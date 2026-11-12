/**
 * The Session Tree page (route `/session-tree`): loads the session rows (plugin backend) and the
 * projects (`projects.tree`), builds the graph model, lays it out with the active style and
 * draws it in the shared canvas shell, with the toolbar and the style's side panel.
 *
 * Card 4: block positions, the view style and snap come from the synced layout store
 * (`LayoutSync`, per style + profile + scope, saved on drop); Show all, Show archived, the
 * profile filter, the project scope (per profile filter), the style override, the panel and the
 * zoom + pan stay on this device (`DevicePrefs`), so a closed and reopened page shows the view
 * it was left on. Re-arrange asks first and can be undone; the layout it forgets is kept in
 * Layout history (`layout-history.tsx`). An unreachable backend shows the cached layout.
 */
import { Button, EmptyState, ErrorState, host, useQuery, useValue } from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'
import { ReactFlowProvider, useReactFlow, useStoreApi } from '@xyflow/react'
import type { Viewport } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchHealth, fetchProfiles, fetchProjects, fetchSessions } from '../api.ts'
import { applyOverrides } from '../model/actions.ts'
import { viewportKey } from '../model/device-prefs.ts'
import { ALL_PROFILES, ALL_PROJECTS, buildGraph, layoutKeysOf } from '../model/graph.ts'
import type { GraphNode } from '../model/graph.ts'
import { anyInView, laidOutFamilies } from '../model/layout.ts'
import type { LayoutResult, Point } from '../model/layout.ts'
import type { LayoutRef } from '../model/layout-sync.ts'
import { EMPTY_SELECTION, canvasSelectable, keepShown, reduceSelection, singleSelected } from '../model/selection.ts'
import type { Selection, SelectionAction } from '../model/selection.ts'
import { visibleRows } from '../model/sessions.ts'
import { liveStatus } from '../model/status.ts'
import type { HostStatusSnapshot } from '../model/status.ts'
import { getStyle, registeredStyles, resolveStyleId } from '../styles/registry.ts'
import { createFrameCache } from './frame-cache.ts'
import { GraphCanvas, MAX_ZOOM, MIN_ZOOM } from './graph-canvas.tsx'
import { LayoutHistoryDialog, RearrangeConfirm } from './layout-history.tsx'
import { PluginCtx } from './plugin-context.ts'
import { useRowOverrides, useSessionActionsController } from './session-actions.tsx'
import { SessionActionsCtx } from './session-actions-context.ts'
import { READ_ONLY_MESSAGE, usePrefsVersion, useSyncVersion } from './services.ts'
import type { Services } from './services.ts'
import { Toolbar } from './toolbar.tsx'
import { useLiveRefresh } from './use-live-refresh.ts'

export const BACKEND_OFF_MESSAGE =
  "Session Tree's backend is off: enable the session-tree plugin for this profile and restart the gateway."
export const OFFLINE_MESSAGE = 'offline: showing last saved layout'
/** Card 7 fix r1 (review r1 finding 6): a background refresh failed; the canvas shows the last data. */
export const REFRESH_FAILED_MESSAGE = 'Couldn\u2019t refresh \u2014 showing the last data'
/** How long the Re-arrange toast (with Undo) stays. */
export const UNDO_TOAST_MS = 10_000

const FIT_OPTIONS = { padding: 0.08, maxZoom: 1.25, duration: 0 }
const EMPTY_LAYOUT: LayoutResult = { positions: new Map(), labels: [] }
/** No SDK source for "needs input" yet (pre-check 10). */
const NO_NEEDS_INPUT: ReadonlySet<string> = new Set()

export function SessionTreePage({ ctx, services }: { ctx: PluginContext; services: Services }) {
  return (
    <PluginCtx.Provider value={ctx}>
      <ReactFlowProvider>
        <PageBody ctx={ctx} services={services} />
      </ReactFlowProvider>
    </PluginCtx.Provider>
  )
}

interface UndoToast {
  id: number
  message: string
  undo(): void
  /** The Re-arrange toast also opens Layout history. */
  history?: boolean
}

function PageBody({ ctx, services: { sync, prefs } }: { ctx: PluginContext; services: Services }) {
  const activeProfile = useValue(host.state.profile) || 'default'
  const syncVersion = useSyncVersion(sync)

  usePrefsVersion(prefs)
  const device = prefs.get()
  const profile = device.profile ?? activeProfile
  const showAll = device.showAll
  const showArchived = device.showArchived
  // Remembered per profile filter on this device: a reopened page shows the scope it was left on.
  const scopeChoice = prefs.scope(profile)
  // Card 9: the selected blocks (a set with one primary block), per page; never synced.
  const [selectionChoice, setSelection] = useState<Selection>(EMPTY_SELECTION)
  const [fitRequest, setFitRequest] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [toast, setToast] = useState<UndoToast>()
  const [confirmRearrange, setConfirmRearrange] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const settings = sync.settings(profile)
  const style = getStyle(resolveStyleId(device.styleOverride, settings.style))
  const snap = settings.snap && style.draggable
  const flow = useReactFlow()
  const flowStore = useStoreApi()

  useEffect(() => sync.watch(profile), [sync, profile])

  const health = useQuery({
    queryKey: ['session-tree', 'health', activeProfile],
    queryFn: () => fetchHealth(ctx, activeProfile),
    retry: false,
    refetchOnWindowFocus: false
  })

  const profiles = useQuery({
    queryKey: ['session-tree', 'profiles'],
    queryFn: () => fetchProfiles(ctx),
    retry: false,
    refetchOnWindowFocus: false
  })

  const sessions = useQuery({
    queryKey: ['session-tree', 'sessions', profile, showArchived],
    queryFn: () => fetchSessions(ctx, { profile, includeArchived: showArchived }),
    // Show archived refetches with the same profile: keep the canvas (viewport, selection,
    // inspector) on the previous rows until the new ones arrive. A new profile loads fresh.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === profile ? previous : undefined),
    retry: false,
    refetchOnWindowFocus: false
  })

  const profileNames = useMemo(() => {
    const names = new Set(profiles.data?.profiles ?? [])

    names.add(activeProfile)

    if (profile !== ALL_PROFILES) {
      names.add(profile)
    }

    return [...names].sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)))
  }, [profiles.data, activeProfile, profile])

  const projectProfiles = profile === ALL_PROFILES ? profileNames : [profile]

  const projects = useQuery({
    queryKey: ['session-tree', 'projects', projectProfiles.join(',')],
    queryFn: () => fetchProjects(projectProfiles, ctx),
    // The gateway socket may still be connecting on a cold page load.
    retry: 3,
    retryDelay: 750,
    refetchOnWindowFocus: false
  })

  useLiveRefresh(ctx, {
    sessions: () => void sessions.refetch(),
    projects: () => void projects.refetch()
  })

  useEffect(() => ctx.setInterval(() => setNowMs(Date.now()), 60_000), [ctx])

  const projectList = useMemo(() => projects.data ?? [], [projects.data])
  const scope = scopeChoice === ALL_PROJECTS || projectList.some(project => project.id === scopeChoice) ? scopeChoice : ALL_PROJECTS
  const serverRows = useMemo(() => sessions.data?.sessions ?? [], [sessions.data])
  // Session actions patch rows optimistically until the server rows agree (card 3).
  const [overrides, setOverrides] = useRowOverrides(serverRows)
  const rows = useMemo(() => applyOverrides(serverRows, overrides), [serverRows, overrides])

  const model = useMemo(
    () => buildGraph(rows, projectList, { profile, showArchived, scope }),
    [rows, projectList, profile, showArchived, scope]
  )

  const spec = useMemo(() => style.layoutSpec({ showAll }), [style, showAll])
  const ref = useMemo<LayoutRef>(() => ({ profile, style: style.id, scope }), [profile, style, scope])
  // B2 (card-4 review): positions are stored by layout key (a compacted block's lineage root),
  // so a compaction (a new tip id) does not move a placed block.
  const keys = useMemo(() => layoutKeysOf(model), [model])
  // Lay out only complete data: a layout made before the projects arrive would group every
  // block under "no project", and one made before the stored positions arrive would be saved
  // over nothing (and shown, then moved).
  const ready = Boolean(sessions.data) && !projects.isPending && sync.settled(profile)
  const collapsedLanes = device.collapsedLanes
  const collapsed = useMemo(() => new Set(collapsedLanes), [collapsedLanes])
  // Card 5: a framed style (Swimlanes) is laid out from the data alone; it never reads the layout
  // store and never queues anything to it (no `place()`, R12). B1 (card-5 review): the cache
  // recomputes it only when an input changes (data, filters, collapse, the local day, the
  // offset), not on the minute tick, so the canvas does not re-route every link once a minute.
  const [frameCache] = useState(createFrameCache)
  const frameLayout = useMemo(
    () => (ready && style.frame ? frameCache.get({ frame: style.frame, model, showAll, collapsed, nowMs }) : undefined),
    [ready, style, model, showAll, collapsed, nowMs, frameCache]
  )
  const layout = useMemo(
    // Without projects (`projects.tree` failed) the groups are wrong: draw them, but save nothing.
    () =>
      style.frame
        ? (frameLayout ?? EMPTY_LAYOUT)
        : ready
          ? sync.place(ref, previous => style.layout(model, previous, spec), { save: style.savesLayout && !projects.isError, keys })
          : EMPTY_LAYOUT,
    // `syncVersion` re-runs the merge after a drop, a Re-arrange or another window's change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version is the store's change signal
    [ready, sync, ref, style, model, keys, spec, syncVersion, projects.isError, frameLayout]
  )

  const busy = useValue(host.state.busy)
  const busyBySession = useValue(host.state.busyBySession)
  const focusedSessionId = useValue(host.state.focusedSessionId)
  const focusedStoredSessionId = useValue(host.state.focusedStoredSessionId)
  const [needsInput, setNeedsInput] = useState(NO_NEEDS_INPUT)

  useEffect(() => {
    // TEST ONLY (card 6): the SDK has no needs-input source (pre-check 10), so the e2e's own
    // build (`--test-styles`) lets its suite name the ids waiting on the user; `npm run build`
    // defines the flag false and esbuild drops this branch (tests/js/guards.test.ts).
    if (typeof __SESSION_TREE_TEST_STYLES__ !== 'undefined' && __SESSION_TREE_TEST_STYLES__) {
      return ctx.addEventListener(window, 'session-tree:test-needs-input', event => {
        const ids = (event as CustomEvent<unknown>).detail

        setNeedsInput(new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []))
      })
    }
  }, [ctx])

  const hostStatus = useMemo<HostStatusSnapshot>(
    () => ({
      busy: Boolean(busy),
      busyBySession: busyBySession ?? {},
      focusedSessionId: focusedSessionId ?? null,
      focusedStoredSessionId: focusedStoredSessionId ?? null,
      needsInput
    }),
    [busy, busyBySession, focusedSessionId, focusedStoredSessionId, needsInput]
  )

  const statusOf = useCallback((node: GraphNode) => (node.row ? liveStatus(node.row, hostStatus) : undefined), [hostStatus])

  // Card 9: the blocks on the canvas (what a box, Shift+click or Ctrl/⌘+A may select), and the
  // selection kept to the blocks still shown after a refresh. A one-block selection may also be
  // a single picked from its list or drawer (as before card 9), while it exists and is editable.
  const canvasIds = useMemo<ReadonlySet<string>>(
    () => frameLayout?.shown ?? new Set(laidOutFamilies(model, spec).flatMap(family => family.nodeIds)),
    [frameLayout, model, spec]
  )
  const selectable = useCallback((id: string) => canvasSelectable(model, canvasIds, id), [model, canvasIds])
  const plainSelectable = useCallback((id: string) => model.nodeById.get(id)?.readOnly === false, [model])
  // Changing scope, profile or style clears it (adjusted during render, like the Branch select).
  const selectionKey = `${profile}\u0000${scope}\u0000${style.id}`
  const [selectionFor, setSelectionFor] = useState(selectionKey)

  if (selectionFor !== selectionKey) {
    setSelectionFor(selectionKey)
    setSelection(EMPTY_SELECTION)
  }

  const selection = useMemo(() => keepShown(selectionChoice, selectable, plainSelectable), [selectionChoice, selectable, plainSelectable])
  const selectedId = singleSelected(selection)
  const onSelection = useCallback(
    (action: SelectionAction) => setSelection(previous => reduceSelection(keepShown(previous, selectable, plainSelectable), action, selectable, plainSelectable)),
    [selectable, plainSelectable, setSelection]
  )

  const fit = useCallback(() => {
    if (frameLayout) {
      // A framed style frames its lanes itself (right of the header column, under the axis).
      const { width, height } = flowStore.getState()

      if (width > 0 && height > 0) {
        void flow.setViewport(frameLayout.fit(width, height, MIN_ZOOM), { duration: 0 })
      }

      return
    }

    const inScope =
      scope === ALL_PROJECTS
        ? undefined
        : laidOutFamilies(model, spec)
            .flatMap(family => family.nodeIds)
            .filter(id => model.nodeById.get(id)?.outOfScope === false)
            .map(id => ({ id }))

    void flow.fitView({ ...FIT_OPTIONS, ...(style.fitPadding ? { padding: style.fitPadding } : {}), nodes: inScope && inScope.length > 0 ? inScope : undefined })
  }, [flow, flowStore, frameLayout, model, spec, scope, style])

  // A new layout (Show all, Re-arrange) is framed once; refreshes are not.
  useEffect(() => {
    if (fitRequest > 0) {
      fit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on an explicit request
  }, [fitRequest])

  const requestFit = useCallback(() => setFitRequest(count => count + 1), [setFitRequest])

  // A remembered view that shows none of the map's blocks is framed instead of restored: the map
  // was laid out again since (Show all, Re-arrange, another device's drops), or the view was
  // panned or zoomed off it. A framed style (Swimlanes) frames itself.
  const showsMap = useCallback(
    (viewport: Viewport) => {
      const { width, height } = flowStore.getState()

      if (style.frame || width <= 0 || height <= 0) {
        return true
      }

      const blocks = laidOutFamilies(model, spec).flatMap(family =>
        family.nodeIds.flatMap(id => {
          const point = layout.positions.get(id)

          return point ? [{ x: point.x, y: point.y, ...style.nodeSize }] : []
        })
      )

      return anyInView(blocks, viewport, width, height)
    },
    [flowStore, layout, model, spec, style]
  )

  // R16: zoom and pan per style + profile + scope, on this device. A view seen before comes back
  // where it was left; a new one is framed.
  const vpKey = viewportKey(style.id, profile, scope)
  const vpKeyRef = useRef(vpKey)
  const canvasShown = ready && model.nodes.length > 0 && !(sessions.isError && !sessions.data)
  const appliedKey = useRef<null | string>(null)
  const appliedScope = useRef(scope)

  useEffect(() => {
    vpKeyRef.current = vpKey

    if (!canvasShown) {
      appliedKey.current = null

      return
    }

    if (appliedKey.current === null) {
      // The canvas just mounted with this key's viewport (or framed itself).
      appliedKey.current = vpKey
      appliedScope.current = scope
      const saved = prefs.viewport(vpKey)

      if (saved && !showsMap(saved)) {
        fit()
      }

      return
    }

    if (appliedKey.current !== vpKey) {
      // Card 5: in a framed style (Swimlanes) a new scope collapses the other lanes, so the view
      // always re-fits on a scope change; a remembered view still comes back on a reload.
      const refit = Boolean(style.frame) && appliedScope.current !== scope

      appliedKey.current = vpKey
      appliedScope.current = scope
      const saved = prefs.viewport(vpKey)

      if (saved && !refit && showsMap(saved)) {
        void flow.setViewport(saved, { duration: 0 })
      } else {
        fit()
      }
    }
  }, [vpKey, canvasShown, prefs, flow, fit, scope, style, showsMap])

  const onViewport = useCallback((viewport: Viewport) => prefs.setViewport(vpKeyRef.current, viewport), [prefs])

  const onSelect = useCallback(
    (id: null | string, reveal = false) => {
      const node = id ? model.nodeById.get(id) : undefined

      if (id && (!node || node.readOnly)) {
        return
      }

      setSelection(id ? { ids: [id], primary: id } : EMPTY_SELECTION)

      const point = id ? layout.positions.get(id) : undefined

      if (reveal && point) {
        const { zoom } = flow.getViewport()

        void flow.setCenter(point.x + style.nodeSize.width / 2, point.y + style.nodeSize.height / 2, { zoom, duration: 0 })
      }
    },
    [model, layout, flow, style, setSelection]
  )

  const onMove = useCallback(
    (moves: ReadonlyMap<string, Point>) => sync.drop(ref, new Map([...moves].map(([id, point]) => [keys.toStore(id), point]))),
    [sync, ref, keys]
  )
  const onDragging = useCallback((ids: null | string[]) => sync.setDragging(ids), [sync])

  const dismissToast = useCallback(() => setToast(undefined), [setToast])

  const onRearrange = useCallback(() => {
    if (!style.savesLayout) {
      // Swimlanes has no saved positions to reset (R12): Re-arrange is hidden there.
      return
    }

    const previous = sync.rearrange(ref)
    const id = Date.now()

    requestFit()
    setToast({
      id,
      message: 'Layout re-arranged',
      history: true,
      undo: () => {
        sync.restore(ref, previous)
        setToast(undefined)
        requestFit()
      }
    })
  }, [sync, ref, style, requestFit, setToast])

  // A restore from Layout history: the backup becomes the layout (the server keeps the one it
  // replaces), with Undo like a Re-arrange.
  const onRestoreBackup = useCallback(
    (positions: Map<string, Point>) => {
      const previous = sync.restoreBackup(ref, positions)

      requestFit()
      setToast({
        id: Date.now(),
        message: 'Earlier layout restored',
        undo: () => {
          sync.restore(ref, previous)
          setToast(undefined)
          requestFit()
        }
      })
    },
    [sync, ref, requestFit, setToast]
  )
  const flushSync = useCallback(() => sync.flush(), [sync])

  useEffect(() => {
    if (!toast) {
      return
    }

    return ctx.setTimeout(() => setToast(current => (current?.id === toast.id ? undefined : current)), UNDO_TOAST_MS)
  }, [ctx, toast])

  const onOpen = useCallback(
    (node: GraphNode) => {
      if (!node.row || node.readOnly) {
        return
      }

      void host.openSession(node.row.id, { intent: 'tab', ...(node.profile !== activeProfile ? { profile: node.profile } : {}) })
    },
    [activeProfile]
  )

  // R14: after Branch the page stays, then places (mergeLayout) and selects the new child. The
  // selection is adjusted during render once the child is laid out; the effect only moves the
  // viewport to it (an external system).
  const [pendingSelect, setPendingSelect] = useState<null | string>(null)
  const [reveal, setReveal] = useState<null | { id: string }>(null)

  if (pendingSelect && model.nodeById.get(pendingSelect)?.readOnly === false && layout.positions.has(pendingSelect)) {
    setPendingSelect(null)
    setSelection({ ids: [pendingSelect], primary: pendingSelect })
    setReveal({ id: pendingSelect })
  }

  useEffect(() => {
    const point = reveal ? layout.positions.get(reveal.id) : undefined

    if (point) {
      const { zoom } = flow.getViewport()

      void flow.setCenter(point.x + style.nodeSize.width / 2, point.y + style.nodeSize.height / 2, { zoom, duration: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per reveal request
  }, [reveal])

  const { actions, dialogs } = useSessionActionsController({
    ctx,
    model,
    setOverrides,
    statusOf,
    runtime: { focusedStoredSessionId: focusedStoredSessionId ?? null, focusedSessionId: focusedSessionId ?? null },
    refreshSessions: () => void sessions.refetch(),
    refreshProjects: () => void projects.refetch(),
    onBranched: id => setPendingSelect(id),
    onMoved: id => sync.forget(profile, keys.toStore(id)),
    onRemoved: id => setSelection(current => (current.ids.includes(id) ? reduceSelection(current, { type: 'toggle', id }, () => false) : current))
  })

  const visibleCount = useMemo(() => visibleRows(rows).length, [rows])
  const onCanvas = useMemo(
    () => (frameLayout ? frameLayout.shown.size : laidOutFamilies(model, spec).reduce((sum, family) => sum + family.nodeIds.length, 0)),
    [model, spec, frameLayout]
  )
  const onToggleLane = useCallback((key: string) => prefs.toggleLane(key), [prefs])
  const Panel = style.Panel
  const panelOpen = prefs.panelOpen(style.id, style.panelDefaultOpen ?? true)
  const onPanel = useCallback((open: boolean) => prefs.setPanelOpen(style.id, open), [prefs, style])
  const sectionOpen = useCallback((section: string) => prefs.sectionOpen(style.id, section), [prefs, style])
  const onSection = useCallback((section: string, open: boolean) => prefs.setSectionOpen(style.id, section, open), [prefs, style])
  // The Re-arrange confirm and Layout history name the view they act on.
  const viewLabel = `${style.label} · ${scope === ALL_PROJECTS ? 'All projects' : (projectList.find(project => project.id === scope)?.label ?? scope)}${
    profile === ALL_PROFILES ? ' · All profiles' : profile !== activeProfile ? ` · ${profile}` : ''
  }`
  const offline = sync.offline(profile)
  // A background refresh (poll, push or Retry) failed while earlier data is on screen: the canvas
  // keeps that data (c5 r4 N2) and a small note says so; the next successful refresh clears it.
  const refreshFailed = Boolean((sessions.isError && sessions.data) || (projects.isError && projects.data))
  const onStyle = useCallback(
    (id: string) => {
      // R18: the switcher changes this device's override when one is set, else the synced style.
      if (prefs.get().styleOverride) {
        prefs.set({ styleOverride: id })
      } else {
        sync.setSettings(profile, { style: id })
      }
    },
    [prefs, sync, profile]
  )

  if (health.isError) {
    return (
      <div className="session-tree" data-testid="session-tree-page" data-profile={activeProfile}>
        <div className="session-tree__state" data-testid="session-tree-backend-off">
          <EmptyState title={BACKEND_OFF_MESSAGE} />
        </div>
      </div>
    )
  }

  let body
  // Carry-forward c5 r4 N2 (card 7): a background refetch that fails (the gateway stopped, a poll
  // while it restarts) keeps the data it has: the canvas stays on the last rows and projects (the
  // cached layout, R17); only a load with nothing to show yet ends in the error with Retry.
  const sessionsFailed = sessions.isError && !sessions.data
  const projectsFailed = projects.isError && !projects.data

  if (sessionsFailed || projectsFailed) {
    // Carry-forward (card 3 review): a failed load is an error with Retry, never an endless
    // spinner. `projects.tree` too: a row the gateway cannot serialise (an infinite cost) leaves
    // that RPC unanswered, so each attempt times out (`PROJECTS_TIMEOUT_MS`) and ends here.
    const failed = sessionsFailed ? sessions : projects

    body = (
      <div className="session-tree__state" data-testid="session-tree-error" data-failed={sessionsFailed ? 'sessions' : 'projects'}>
        <ErrorState title={sessionsFailed ? 'Could not load sessions' : 'Could not load projects'} description={errorText(failed.error)}>
          <Button variant="outline" data-testid="session-tree-retry" disabled={failed.isFetching} onClick={() => void failed.refetch()}>
            {failed.isFetching ? 'Retrying…' : 'Retry'}
          </Button>
        </ErrorState>
      </div>
    )
  } else if (health.isPending || sessions.isPending || projects.isPending || !sync.settled(profile)) {
    body = (
      <div className="session-tree__state" data-testid="session-tree-loading">
        <EmptyState title="Loading sessions…" />
      </div>
    )
  } else if (model.nodes.length === 0) {
    body = (
      <div className="session-tree__state" data-testid="session-tree-empty">
        <EmptyState title="No sessions yet" description="Sessions you start show up here." />
      </div>
    )
  } else {
    const saved = prefs.viewport(vpKey)

    body = (
      <>
        <GraphCanvas
          style={style}
          spec={spec}
          model={model}
          positions={layout.positions}
          labels={layout.labels}
          selection={selection}
          onSelection={onSelection}
          onSelect={onSelect}
          onMove={onMove}
          onDragging={onDragging}
          onOpen={onOpen}
          statusOf={statusOf}
          snap={snap}
          nowMs={nowMs}
          initialViewport={saved}
          onViewport={onViewport}
          frameLayout={frameLayout}
          onToggleLane={onToggleLane}
          panelOpen={panelOpen}
          onPanel={onPanel}
        />
        {onCanvas === 0 && (
          <div className="session-tree__hint" data-testid="session-tree-no-branches">
            {style.singles === 'lane-chip'
              ? "No branched sessions here — the sessions without branches are in each lane's “no branches” chip."
              : style.singles === 'depot'
                ? 'No branched sessions here — the sessions without branches are in the depot below.'
                : 'No branched sessions here — the sessions without branches are listed on the right.'}
          </div>
        )}
      </>
    )
  }

  return (
    <SessionActionsCtx.Provider value={actions}>
      <div
        className="session-tree"
        data-testid="session-tree-page"
        data-profile={profile}
        data-scope={scope}
        data-style={style.id}
        data-sync={sync.status(profile)}
        data-sync-rev={sync.revision(profile) ?? undefined}
        data-row-count={sessions.data ? visibleCount : undefined}
        data-node-count={sessions.data ? model.nodes.length : undefined}
        data-canvas-count={sessions.data ? onCanvas : undefined}
        data-projects={projects.isError ? 'error' : projects.data ? String(projectList.length) : 'loading'}
        data-refresh-failed={refreshFailed ? 'true' : undefined}
        title={projects.isError ? `projects.tree: ${errorText(projects.error)}` : undefined}
      >
        <Toolbar
          projects={projectList}
          scope={scope}
          onScope={next => prefs.setScope(profile, next)}
          profiles={profileNames}
          profile={profile}
          onProfile={next => {
            // The new profile filter shows the scope last chosen for it (All projects at first).
            prefs.set({ profile: next === activeProfile ? null : next })
            setSelection(EMPTY_SELECTION)
          }}
          showAll={showAll}
          onShowAll={on => {
            prefs.set({ showAll: on })
            requestFit()
          }}
          showArchived={showArchived}
          onShowArchived={on => prefs.set({ showArchived: on })}
          snap={snap}
          onSnap={on => sync.setSettings(profile, { snap: on })}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          onFit={fit}
          onRearrange={() => setConfirmRearrange(true)}
          canRearrange={style.savesLayout}
          snapUnavailable={style.draggable ? undefined : style.snapUnavailable}
          singlesCount={model.singles.length}
          styles={registeredStyles().map(each => ({ id: each.id, label: each.label }))}
          styleId={style.id}
          styleSource={device.styleOverride ? 'device' : 'synced'}
          onStyle={onStyle}
          hasPanel={Boolean(Panel)}
          panelOpen={panelOpen}
          onPanel={open => prefs.setPanelOpen(style.id, open)}
        />
        {offline && (
          <div className="session-tree__banner" role="status" data-testid="session-tree-offline">
            {OFFLINE_MESSAGE}
          </div>
        )}
        {sync.storeReadOnly && (
          <div className="session-tree__banner" role="status" data-testid="session-tree-read-only">
            {READ_ONLY_MESSAGE}
          </div>
        )}
        <div className="session-tree__main">
          <div className="session-tree__stage">
            {body}
            {refreshFailed && (
              <div className="session-tree__note" role="status" data-testid="session-tree-refresh-failed">
                {REFRESH_FAILED_MESSAGE}
              </div>
            )}
          </div>
          {Panel && panelOpen && sessions.data && (
            <Panel
              model={model}
              selectedId={selectedId}
              selectedIds={selection.ids}
              onSelect={onSelect}
              onOpen={onOpen}
              statusOf={statusOf}
              nowMs={nowMs}
              sectionOpen={sectionOpen}
              onSection={onSection}
            />
          )}
        </div>
        {toast && (
          <div className="session-tree__toast" role="status" data-testid="session-tree-toast">
            <span>{toast.message}</span>
            <button type="button" className="st-toast-btn" data-testid="session-tree-undo" onClick={toast.undo}>
              Undo
            </button>
            {toast.history && style.savesLayout && (
              <button type="button" className="st-toast-btn" data-testid="session-tree-toast-history" onClick={() => setHistoryOpen(true)}>
                Layout history
              </button>
            )}
            <button type="button" className="st-toast-btn" aria-label="Dismiss" onClick={dismissToast}>
              ×
            </button>
          </div>
        )}
        {dialogs}
        <RearrangeConfirm
          open={confirmRearrange && style.savesLayout}
          viewLabel={viewLabel}
          onClose={() => setConfirmRearrange(false)}
          onConfirm={onRearrange}
          onHistory={() => setHistoryOpen(true)}
        />
        {historyOpen && style.savesLayout && (
          <LayoutHistoryDialog
            // Another view (a scope, profile or style change while open) is a fresh dialog.
            key={`${ref.profile}\u0000${ref.style}\u0000${ref.scope}`}
            ctx={ctx}
            layout={ref}
            revision={sync.revision(profile)}
            viewLabel={viewLabel}
            nowMs={nowMs}
            flush={flushSync}
            onClose={() => setHistoryOpen(false)}
            onRestore={onRestoreBackup}
          />
        )}
      </div>
    </SessionActionsCtx.Provider>
  )
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error')
}
