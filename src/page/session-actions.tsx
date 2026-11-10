/**
 * The session actions (R14), wired to the host: one controller per page, used by the block
 * menu, the blocks' ⋯ buttons and the inspector. Routes (pre-check in docs/measured-facts.md):
 *
 * - Appearance → `host.sessions.setColor` (the SDK's `PROFILE_SWATCHES`); Pin → `host.sessions.pin`
 * - Rename → the `session.title` RPC for the session with a live runtime the page knows, else the
 *   backend's fenced `POST /sessions/{id}/rename` (`renameSessionPreferringRpc`)
 * - Mark as read / unread → the backend's fenced `POST /sessions/{id}/read`
 * - Move to project → `session.workspace.move` (session key + the target's root folder)
 * - Branch → `session.branch_stored` with one idempotency key per attempt and one request per
 *   parent at a time (`createBranchFlights`); the page stays and selects the child
 * - Export → the backend's `GET /sessions/{id}/export` (the core export's exact bytes, base64),
 *   written verbatim as `<title>-<id8>.json`
 * - Archive / Unarchive → the backend's fenced `POST /sessions/{id}/archive` (the app's
 *   `setSessionArchived` PATCH); Delete → the backend's fenced `POST /sessions/{id}/delete` (the
 *   core DELETE handler) after a confirmation. Not the `session.archive` / `session.delete` RPCs:
 *   measured in the Webapp, the client refuses the first for a session it never opened and the
 *   gateway does not serve the second (pre-check, docs/measured-facts.md).
 *
 * Optimistic where it is safe (title, pin, read state, archive, delete): the rows are patched
 * until the server rows agree (`settleOverrides`), rolled back when the call fails.
 */
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  host,
  Input,
  isSubmitEnter,
  randomUuid
} from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

import { fetchExport, fetchMutationSnapshot, postArchive, postDelete, postReadState, postRename } from '../api.ts'
import {
  branchNote,
  createBranchFlights,
  createFencedMutation,
  decodeExportEnvelope,
  deleteBlockedReason,
  exportFilename,
  isActionable,
  isAlreadyAbsent,
  moveTargets,
  projectRootCwd,
  renameRoute,
  restErrorText,
  settleOverrides
} from '../model/actions.ts'
import type { FocusedRuntime, RowOverride } from '../model/actions.ts'
import type { GraphModel, GraphNode } from '../model/graph.ts'
import type { SessionRow } from '../model/sessions.ts'
import type { LiveStatus } from '../model/status.ts'
import { useMenuLabels } from './labels.ts'
import type { MenuLabels } from './labels.ts'
import type { SessionActions } from './session-actions-context.ts'

export interface SessionActionsOptions {
  ctx: PluginContext
  model: GraphModel
  /** The page's optimistic row patches (`useRowOverrides`). */
  setOverrides: Dispatch<SetStateAction<ReadonlyMap<string, RowOverride>>>
  statusOf(node: GraphNode): LiveStatus | undefined
  runtime: FocusedRuntime
  refreshSessions(): void
  refreshProjects(): void
  /** A branch was created: place and select it once it arrives (R14). */
  onBranched(childId: string): void
  /** The session moved to another project: its block is placed anew in that project's band. */
  onMoved(nodeId: string): void
  onRemoved(nodeId: string): void
}

const errorText = (error: unknown) => restErrorText(error)

/** The gateway's refusal reason, when a JSON-RPC error carries one (`data.reason`). */
const rpcReason = (error: unknown) => (error as { data?: { reason?: string } } | null)?.data?.reason

/**
 * Optimistic row patches, retired as soon as the server rows agree (`settleOverrides`). Held by
 * the page: the rows it builds the graph from are the server rows with these applied.
 */
export function useRowOverrides(serverRows: readonly SessionRow[]) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, RowOverride>>(() => new Map())
  const [settledFor, setSettledFor] = useState(serverRows)

  // New server rows: retire what they confirm (state adjusted during render, not in an effect).
  if (settledFor !== serverRows) {
    setSettledFor(serverRows)

    if (overrides.size > 0) {
      setOverrides(settleOverrides(serverRows, overrides))
    }
  }

  return [overrides, setOverrides] as const
}

export function useSessionActionsController(options: SessionActionsOptions): {
  actions: SessionActions
  dialogs: ReactNode
} {
  const labels = useMenuLabels()
  const { setOverrides } = options
  const [colors, setColors] = useState<ReadonlyMap<string, null | string>>(() => new Map())
  const [renaming, setRenaming] = useState<GraphNode>()
  const [deleting, setDeleting] = useState<GraphNode>()
  const [mutate] = useState(() => createFencedMutation(randomUuid))
  const [branchFlights] = useState(() =>
    createBranchFlights(<T,>(method: string, params: Record<string, unknown>) => host.request<T>(method, params), randomUuid)
  )
  const latest = useRef({ options, labels, colors })
  const menuHost = useRef<HTMLElement | null>(null)
  const requestedMenuNode = useRef<null | string>(null)
  const dialogFromMenu = useRef(false)

  useEffect(() => {
    latest.current = { options, labels, colors }
  })

  const actions = useMemo<SessionActions>(() => {
    const patch = (id: string, override: RowOverride) =>
      setOverrides(previous => new Map(previous).set(id, { ...previous.get(id), ...override }))

    const unpatch = (id: string) =>
      setOverrides(previous => {
        if (!previous.has(id)) {
          return previous
        }

        const next = new Map(previous)

        next.delete(id)

        return next
      })

    const rowOf = (node: GraphNode): SessionRow => {
      if (!isActionable(node)) {
        throw new Error('Not available on this block')
      }

      return node.row
    }

    const notifyError = (error: unknown, fallback: string) => host.notify({ kind: 'error', title: fallback, message: errorText(error) })

    return {
      canAct: node => isActionable(node),
      statusOf: node => latest.current.options.statusOf(node),
      branchCount: node => latest.current.options.model.childrenOf.get(node.id)?.length ?? 0,
      moveTargets: node => moveTargets(latest.current.options.model.projects, node.projectId),
      colorOf: node => latest.current.colors.get(node.row?.id ?? node.id) ?? null,

      rename(node) {
        if (isActionable(node)) {
          setRenaming(node)
        }
      },

      togglePin(node) {
        const row = rowOf(node)
        const pinned = !row.pinned

        // The app's own pin store; its pin sync writes the backend `pinned` flag.
        host.sessions.pin(row.id, pinned)
        patch(row.id, { pinned })
      },

      async toggleUnread(node) {
        const row = rowOf(node)
        const unread = !row.unread

        patch(row.id, { unread })

        try {
          await mutate(
            JSON.stringify(['read', node.profile, row.id, unread]),
            () => fetchMutationSnapshot(latest.current.options.ctx, node.profile, row.id),
            identity => postReadState(latest.current.options.ctx, node.profile, row.id, unread, identity)
          )
          latest.current.options.refreshSessions()
        } catch (error) {
          unpatch(row.id)
          notifyError(error, latest.current.labels.unreadFailed)
        }
      },

      setColor(node, color) {
        const row = rowOf(node)

        host.sessions.setColor(row.id, color)
        setColors(previous => new Map(previous).set(row.id, color))
      },

      copied() {
        host.notify({ kind: 'success', message: 'Session ID copied', durationMs: 2000 })
      },

      copyFailed(error) {
        notifyError(error, latest.current.labels.copyIdFailed)
      },

      async branch(node) {
        const row = rowOf(node)
        let joined = false

        try {
          // One request per parent at a time: a double-submit joins the flight in progress
          // (one idempotency key per attempt), and only the first caller places the child
          // (or reports the failure).
          const started = branchFlights({ parentId: row.id, profile: node.profile, cwd: row.cwd })

          joined = started.joined
          const result = await started.flight

          if (joined) {
            return
          }

          const child = result?.stored_session_id

          if (!child) {
            throw new Error('The gateway returned no branch id')
          }

          // The graph does not open the branch (R14 keeps the user here): release the live
          // runtime the create bound, so the stored child is an ordinary idle session.
          if (result.session_id && result.session_id !== child) {
            await host.request('session.close', { session_id: result.session_id }).catch(() => undefined)
          }

          latest.current.options.onBranched(child)
          latest.current.options.refreshSessions()
          host.notify({ kind: 'success', message: `Branched “${node.title}”`, durationMs: 2000 })
        } catch (error) {
          if (!joined) {
            notifyError(error, 'Could not branch session')
          }
        }
      },

      async exportSession(node) {
        const row = rowOf(node)

        try {
          // The core export's exact bytes (decoded from the backend's base64 envelope), written
          // verbatim: never parsed and re-serialised.
          const bytes = decodeExportEnvelope(await fetchExport(latest.current.options.ctx, node.profile, row.id))
          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }))
          const anchor = document.createElement('a')

          anchor.href = url
          anchor.download = exportFilename(row.id, node.title)
          anchor.click()
          latest.current.options.ctx.setTimeout(() => URL.revokeObjectURL(url), 1000)
          host.notify({ kind: 'success', message: latest.current.labels.exported, durationMs: 2000 })
        } catch (error) {
          notifyError(error, latest.current.labels.exportFailed)
        }
      },

      async moveTo(node, project) {
        const row = rowOf(node)
        const cwd = projectRootCwd(project)

        try {
          if (!cwd) {
            throw new Error('That project has no folder')
          }

          await host.request('session.workspace.move', { session_key: row.id, cwd, profile: node.profile }).catch((error: unknown) => {
            // The shared owner refuses a move while a turn runs.
            throw rpcReason(error) === 'session_busy' ? new Error('The session is running; move it when it is idle') : error
          })
          latest.current.options.onMoved(node.id)
          latest.current.options.refreshSessions()
          latest.current.options.refreshProjects()
          host.notify({ kind: 'success', message: latest.current.labels.movedTo(project.label), durationMs: 2000 })
        } catch (error) {
          notifyError(error, latest.current.labels.moveFailed)
        }
      },

      async toggleArchive(node) {
        const row = rowOf(node)
        const archived = !row.archived

        patch(row.id, archived ? { archived, pinned: false } : { archived })

        try {
          // The app's own route (`setSessionArchived`): the fenced REST edit, through the backend.
          await mutate(
            JSON.stringify(['archive', node.profile, row.id, archived]),
            () => fetchMutationSnapshot(latest.current.options.ctx, node.profile, row.id),
            identity => postArchive(latest.current.options.ctx, node.profile, row.id, archived, identity)
          )
          latest.current.options.refreshSessions()
          host.notify({ kind: 'success', message: archived ? `Archived “${node.title}”` : `Unarchived “${node.title}”`, durationMs: 2000 })
        } catch (error) {
          unpatch(row.id)
          notifyError(error, archived ? 'Could not archive session' : 'Could not unarchive session')
        }
      },

      remove(node) {
        if (isActionable(node)) {
          setDeleting(node)
        }
      },

      openMenuFor(nodeId, anchor) {
        const target = menuHost.current

        if (!target) {
          return
        }

        const rect = anchor.getBoundingClientRect()

        requestedMenuNode.current = nodeId
        // A ContextMenu opens on `contextmenu` only; this is the ⋯ button's way in.
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left, clientY: rect.bottom + 2 }))
      },

      setMenuHost(element) {
        menuHost.current = element
      },

      takeRequestedMenuNode() {
        const id = requestedMenuNode.current

        requestedMenuNode.current = null

        return id
      },

      dialogOpening() {
        const opening = dialogFromMenu.current

        dialogFromMenu.current = false

        return opening
      },

      noteDialogFromMenu() {
        dialogFromMenu.current = true
      }
    }
  }, [branchFlights, mutate, setOverrides])

  const backendRename = async (node: GraphNode, title: string): Promise<null | string | undefined> => {
    const row = node.row!
    const { ctx } = latest.current.options
    const result = await mutate(
      JSON.stringify(['rename', node.profile, row.id, title]),
      () => fetchMutationSnapshot(ctx, node.profile, row.id),
      identity => postRename(ctx, node.profile, row.id, title, identity)
    )

    return result?.title
  }

  const submitRename = async (node: GraphNode, title: string) => {
    const row = node.row!
    const route = renameRoute(row, latest.current.options.runtime, title)
    let finalTitle = title

    if (route.kind === 'rpc') {
      try {
        const result = await host.request<{ title?: string }>('session.title', { session_id: route.runtimeId, title })

        finalTitle = result?.title ?? title
      } catch {
        // Mid-reconnect socket, or the runtime is gone: the stored row takes the backend path.
        finalTitle = (await backendRename(node, title)) ?? title
      }
    } else {
      finalTitle = (await backendRename(node, title)) ?? title
    }

    setOverrides(previous => new Map(previous).set(row.id, { ...previous.get(row.id), title: finalTitle || null }))
    latest.current.options.refreshSessions()
    host.notify({ kind: 'success', message: labels.renamed, durationMs: 2000 })
  }

  const dialogs = (
    <>
      <RenameDialog
        key={renaming?.id ?? 'none'}
        node={renaming}
        labels={labels}
        onClose={() => setRenaming(undefined)}
        onSubmit={submitRename}
      />
      <DeleteDialog
        node={deleting}
        labels={labels}
        branches={deleting ? (options.model.childrenOf.get(deleting.id)?.length ?? 0) : 0}
        blocked={deleting ? deleteBlockedReason(options.statusOf(deleting)) : undefined}
        onClose={() => setDeleting(undefined)}
        onConfirm={async node => {
          const row = node.row!
          const blocked = deleteBlockedReason(latest.current.options.statusOf(node))

          if (blocked) {
            throw new Error(blocked)
          }

          // The app's own route (`deleteSession`): the core fenced DELETE, through the backend. A
          // refusal (a running turn, a gateway owner that says no) rejects: ConfirmDialog shows
          // its message inline and stays open. A row already gone (deleted elsewhere: the fence
          // read answers 404, or the core answers `already_absent`) is deleted, as the core says.
          await mutate(
            JSON.stringify(['delete', node.profile, row.id]),
            () => fetchMutationSnapshot(latest.current.options.ctx, node.profile, row.id),
            identity => postDelete(latest.current.options.ctx, node.profile, row.id, identity)
          ).catch((error: unknown) => {
            if (!isAlreadyAbsent(error)) {
              throw new Error(errorText(error))
            }
          })
          setOverrides(previous => new Map(previous).set(row.id, { removed: true }))
          latest.current.options.onRemoved(node.id)
          latest.current.options.refreshSessions()
        }}
      />
    </>
  )

  return { actions, dialogs }
}

function RenameDialog({
  node,
  labels,
  onClose,
  onSubmit
}: {
  node?: GraphNode
  labels: MenuLabels
  onClose(): void
  onSubmit(node: GraphNode, title: string): Promise<void>
}) {
  const current = node?.row?.title ?? ''
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const submit = async () => {
    if (!node || busy) {
      return
    }

    const next = value.trim()

    if (next === current.trim()) {
      onClose()

      return
    }

    setBusy(true)
    setError(null)

    try {
      await onSubmit(node, next)
      onClose()
    } catch (err) {
      setError(errorText(err))
      host.notify({ kind: 'error', title: labels.renameFailed, message: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(node)} onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className="max-w-md" data-testid="session-tree-rename-dialog" data-node-id={node?.id}>
        <DialogHeader>
          <DialogTitle>{labels.renameTitle}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          aria-label={labels.renameTitle}
          data-testid="session-tree-rename-input"
          disabled={busy}
          placeholder={labels.untitledPlaceholder}
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (isSubmitEnter(event)) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {error && (
          <div className="st-dialog-error" role="alert" data-testid="session-tree-rename-error">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button type="button" disabled={busy} data-testid="session-tree-rename-save" onClick={() => void submit()}>
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  node,
  labels,
  branches,
  blocked,
  onClose,
  onConfirm
}: {
  node?: GraphNode
  labels: MenuLabels
  branches: number
  blocked?: string
  onClose(): void
  onConfirm(node: GraphNode): Promise<void>
}) {
  const note = branchNote(branches)
  const description = node ? [labels.deleteDesc(node.title), note, blocked ?? ''].filter(Boolean).join('\n') : ''

  return (
    <ConfirmDialog
      open={Boolean(node)}
      title={labels.deleteTitle}
      description={<span data-testid="session-tree-delete-text">{description}</span>}
      confirmLabel={labels.delete}
      busyLabel={labels.deleting}
      doneLabel={labels.deleted}
      cancelLabel={labels.cancel}
      destructive
      onClose={onClose}
      onConfirm={() => (node ? onConfirm(node) : undefined)}
    />
  )
}
