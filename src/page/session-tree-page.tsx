/**
 * The Session Tree page (route `/session-tree`): loads the session rows (plugin backend) and the
 * projects (`projects.tree`), builds the graph model, lays it out with the active style and
 * draws it in the shared canvas shell, with the toolbar and the style's side panel.
 *
 * Positions live in memory, per style + profile + scope (card 4 persists them).
 */
import { EmptyState, host, useQuery, useValue } from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchHealth, fetchProfiles, fetchProjects, fetchSessions } from '../api.ts'
import { applyOverrides } from '../model/actions.ts'
import { ALL_PROFILES, ALL_PROJECTS, buildGraph } from '../model/graph.ts'
import type { GraphNode } from '../model/graph.ts'
import { laidOutFamilies } from '../model/layout.ts'
import type { LayoutResult, Point } from '../model/layout.ts'
import { LayoutMemory } from '../model/layout-memory.ts'
import { visibleRows } from '../model/sessions.ts'
import { liveStatus } from '../model/status.ts'
import type { HostStatusSnapshot } from '../model/status.ts'
import { DEFAULT_STYLE_ID, getStyle } from '../styles/registry.ts'
import { GraphCanvas, MAX_ZOOM, MIN_ZOOM } from './graph-canvas.tsx'
import { PluginCtx } from './plugin-context.ts'
import { useRowOverrides, useSessionActionsController } from './session-actions.tsx'
import { SessionActionsCtx } from './session-actions-context.ts'
import { Toolbar } from './toolbar.tsx'
import { useLiveRefresh } from './use-live-refresh.ts'

export const BACKEND_OFF_MESSAGE =
  "Session Tree's backend is off: enable the session-tree plugin for this profile and restart the gateway."

const FIT_OPTIONS = { padding: 0.08, maxZoom: 1.25, duration: 0 }
const EMPTY_LAYOUT: LayoutResult = { positions: new Map(), labels: [] }
/** No SDK source for "needs input" yet (pre-check 10). */
const NO_NEEDS_INPUT: ReadonlySet<string> = new Set()

export function SessionTreePage({ ctx }: { ctx: PluginContext }) {
  return (
    <PluginCtx.Provider value={ctx}>
      <ReactFlowProvider>
        <PageBody ctx={ctx} />
      </ReactFlowProvider>
    </PluginCtx.Provider>
  )
}

function PageBody({ ctx }: { ctx: PluginContext }) {
  const activeProfile = useValue(host.state.profile) || 'default'
  const [profileChoice, setProfileChoice] = useState<null | string>(null)
  const profile = profileChoice ?? activeProfile
  const [scopeChoice, setScope] = useState(ALL_PROJECTS)
  const [showAll, setShowAll] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [snap, setSnap] = useState(false)
  const [selectedChoice, setSelectedId] = useState<null | string>(null)
  const [memory] = useState(() => new LayoutMemory())
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [fitRequest, setFitRequest] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const style = getStyle(DEFAULT_STYLE_ID)
  const flow = useReactFlow()

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

    return [...names].sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)))
  }, [profiles.data, activeProfile])

  const projectProfiles = profile === ALL_PROFILES ? profileNames : [profile]

  const projects = useQuery({
    queryKey: ['session-tree', 'projects', projectProfiles.join(',')],
    queryFn: () => fetchProjects(projectProfiles),
    // The gateway socket may still be connecting on a cold page load.
    retry: 4,
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
  const layoutKey = `${style.id}|${profile}|${scope}`
  // Lay out only complete data: a layout made before the projects arrive would group every
  // block under "no project", and the memory would keep those positions.
  const ready = Boolean(sessions.data) && !projects.isPending
  const layout = useMemo(
    () => (ready ? memory.place(layoutKey, previous => style.layout(model, previous, spec)) : EMPTY_LAYOUT),
    // `layoutVersion` re-runs the merge after a drop or a Re-arrange changed the memory.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version is the memory's change signal
    [ready, memory, layoutKey, style, model, spec, layoutVersion]
  )

  const busy = useValue(host.state.busy)
  const busyBySession = useValue(host.state.busyBySession)
  const focusedSessionId = useValue(host.state.focusedSessionId)
  const focusedStoredSessionId = useValue(host.state.focusedStoredSessionId)

  const hostStatus = useMemo<HostStatusSnapshot>(
    () => ({
      busy: Boolean(busy),
      busyBySession: busyBySession ?? {},
      focusedSessionId: focusedSessionId ?? null,
      focusedStoredSessionId: focusedStoredSessionId ?? null,
      needsInput: NO_NEEDS_INPUT
    }),
    [busy, busyBySession, focusedSessionId, focusedStoredSessionId]
  )

  const statusOf = useCallback((node: GraphNode) => (node.row ? liveStatus(node.row, hostStatus) : undefined), [hostStatus])
  const selectedId = selectedChoice && model.nodeById.get(selectedChoice)?.readOnly === false ? selectedChoice : null

  const fit = useCallback(() => {
    const inScope =
      scope === ALL_PROJECTS
        ? undefined
        : laidOutFamilies(model, spec)
            .flatMap(family => family.nodeIds)
            .filter(id => model.nodeById.get(id)?.outOfScope === false)
            .map(id => ({ id }))

    void flow.fitView({ ...FIT_OPTIONS, nodes: inScope && inScope.length > 0 ? inScope : undefined })
  }, [flow, model, spec, scope])

  // A new layout (scope, profile, Show all, Re-arrange) is framed once; refreshes are not.
  useEffect(() => {
    if (fitRequest > 0) {
      fit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on an explicit request
  }, [fitRequest])

  const requestFit = useCallback(() => setFitRequest(count => count + 1), [])

  const onSelect = useCallback(
    (id: null | string, reveal = false) => {
      const node = id ? model.nodeById.get(id) : undefined

      if (id && (!node || node.readOnly)) {
        return
      }

      setSelectedId(id)

      const point = id ? layout.positions.get(id) : undefined

      if (reveal && point) {
        const { zoom } = flow.getViewport()

        void flow.setCenter(point.x + style.nodeSize.width / 2, point.y + style.nodeSize.height / 2, { zoom, duration: 0 })
      }
    },
    [model, layout, flow, style]
  )

  const onMove = useCallback(
    (moves: ReadonlyMap<string, Point>) => {
      memory.move(layoutKey, moves)
      setLayoutVersion(version => version + 1)
    },
    [memory, layoutKey]
  )

  const onRearrange = useCallback(() => {
    // Card 2: recompute the auto-layout for this style + scope (card 4 adds Undo and persistence).
    memory.reset(layoutKey)
    setLayoutVersion(version => version + 1)
    requestFit()
  }, [memory, layoutKey, requestFit])

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
    setSelectedId(pendingSelect)
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
    onMoved: id => {
      memory.forget(id)
      setLayoutVersion(version => version + 1)
    },
    onRemoved: id => setSelectedId(current => (current === id ? null : current))
  })

  const visibleCount = useMemo(() => visibleRows(rows).length, [rows])
  const onCanvas = useMemo(() => laidOutFamilies(model, spec).reduce((sum, family) => sum + family.nodeIds.length, 0), [model, spec])
  const Panel = style.Panel

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

  if (sessions.isError) {
    body = (
      <div className="session-tree__state" data-testid="session-tree-error">
        <EmptyState title="Could not load sessions" description={errorText(sessions.error)} />
      </div>
    )
  } else if (health.isPending || sessions.isPending || projects.isPending) {
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
    body = (
      <>
        <GraphCanvas
          style={style}
          spec={spec}
          model={model}
          positions={layout.positions}
          labels={layout.labels}
          selectedId={selectedId}
          onSelect={onSelect}
          onMove={onMove}
          onOpen={onOpen}
          statusOf={statusOf}
          snap={snap}
          nowMs={nowMs}
        />
        {onCanvas === 0 && (
          <div className="session-tree__hint" data-testid="session-tree-no-branches">
            No branched sessions here — the sessions without branches are listed on the right.
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
        data-row-count={sessions.data ? visibleCount : undefined}
        data-node-count={sessions.data ? model.nodes.length : undefined}
        data-canvas-count={sessions.data ? onCanvas : undefined}
        data-projects={projects.isError ? 'error' : projects.data ? String(projectList.length) : 'loading'}
        title={projects.isError ? `projects.tree: ${errorText(projects.error)}` : undefined}
      >
        <Toolbar
          projects={projectList}
          scope={scope}
          onScope={next => {
            setScope(next)
            requestFit()
          }}
          profiles={profileNames}
          profile={profile}
          onProfile={next => {
            setProfileChoice(next)
            setScope(ALL_PROJECTS)
            setSelectedId(null)
            requestFit()
          }}
          showAll={showAll}
          onShowAll={on => {
            setShowAll(on)
            requestFit()
          }}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
          snap={snap}
          onSnap={setSnap}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          onFit={fit}
          onRearrange={onRearrange}
          singlesCount={model.singles.length}
        />
        <div className="session-tree__main">
          <div className="session-tree__stage">{body}</div>
          {Panel && sessions.data && (
            <Panel model={model} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} statusOf={statusOf} nowMs={nowMs} />
          )}
        </div>
        {dialogs}
      </div>
    </SessionActionsCtx.Provider>
  )
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error')
}
