/**
 * Layout history: the earlier arrangements of the shown style's one layout (card 10: one history
 * per profile + style, whatever the project scope) that the backend keeps
 * (`dashboard/layout_store.py` backups). A Re-arrange (in All projects, or of one project) keeps the layout it forgets, and a
 * restore keeps the one it replaces, so a misclick can be taken back after the Undo toast is
 * gone, and from any device. Restore replaces the current arrangement (with Undo).
 *
 * Also the Re-arrange confirm, which is where Layout history is opened from (and the Re-arrange
 * toast): the toolbar has no room for a button of its own at the narrowest widths. The confirm is
 * a plain dialog, not the SDK's ConfirmDialog, which confirms on Enter and Space whichever button
 * has focus: Space is the pan key, and a misclick followed by Space must not re-arrange. Both
 * dialogs open with focus on their harmless button (Cancel, Close): a key pressed after a
 * misclick never re-arranges or restores (review t_c044054d B1: Layout history opened from a
 * focused "Layout history…" with a cached list put focus on the first Restore). Only activating
 * Re-arrange or Restore itself changes the layout: a click, or Tab to the button and Enter or
 * Space (keyboard access stays).
 */
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, useQuery } from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'
import { useState } from 'react'

import { fetchBackup, fetchBackups } from '../api.ts'
import type { LayoutBackupInfo } from '../api.ts'
import { restErrorText } from '../model/actions.ts'
import { agoLabel, dateTimeLabel } from '../model/format.ts'
import type { Point } from '../model/layout.ts'
import type { LayoutRef } from '../model/layout-sync.ts'
import { backupLabel, rearrangeText } from './history-labels.ts'

/** How many backups the backend keeps per profile + style (`MAX_BACKUPS_PER_LAYOUT`). */
export const BACKUPS_KEPT = 10

/** A dialog's focus on open: the control with `testId` (its harmless button), never the first. */
function focusOn(testId: string) {
  return (event: Event) => {
    const target = (event.target as HTMLElement | null)?.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

    if (target) {
      event.preventDefault()
      target.focus()
    }
  }
}

export function RearrangeConfirm({
  open,
  viewLabel,
  project,
  onClose,
  onConfirm,
  onHistory
}: {
  open: boolean
  viewLabel: string
  /**
   * Card 10 (A7): a Re-arrange in a project scope resets only that project's blocks; `count` is
   * how many of them it moves on the canvas (0: nothing to re-arrange, review t_5e9be878 N4).
   */
  project?: { label: string; count: number }
  onClose(): void
  onConfirm(): void
  onHistory(): void
}) {
  const { text, canConfirm } = rearrangeText(viewLabel, project)

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent className="max-w-md" data-testid="session-tree-rearrange-dialog" onOpenAutoFocus={focusOn('session-tree-rearrange-cancel')}>
        <DialogHeader>
          <DialogTitle>{project ? 'Re-arrange this project?' : 'Re-arrange this layout?'}</DialogTitle>
          <DialogDescription>
            <span data-testid="session-tree-rearrange-text">{text}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="st-dlg-left"
            data-testid="session-tree-rearrange-history"
            onClick={() => {
              onClose()
              onHistory()
            }}
          >
            Layout history…
          </Button>
          <Button type="button" variant="ghost" data-testid="session-tree-rearrange-cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="session-tree-rearrange-confirm"
            disabled={!canConfirm}
            onClick={() => {
              onClose()
              onConfirm()
            }}
          >
            Re-arrange
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LayoutHistoryDialog({
  ctx,
  layout,
  revision,
  viewLabel,
  scopeLabel,
  projectLabel,
  nowMs,
  flush,
  onClose,
  onRestore
}: {
  ctx: PluginContext
  layout: LayoutRef
  /** The store's revision: a change (a Re-arrange sent, another device's) refetches the list. */
  revision: null | number
  /** The style (and profile) whose one layout this is (card 10: one history per style). */
  viewLabel: string
  /** The project scope shown (`undefined`: All projects): a restore still replaces every block. */
  scopeLabel?: string
  /** A backup's project id → its label from `projects.tree`; `undefined` when it no longer exists. */
  projectLabel(id: string): string | undefined
  nowMs: number
  /** Sends this window's queued changes first (a Re-arrange just made is listed). */
  flush(): Promise<void>
  onClose(): void
  /** The backup's positions (by layout key) become the layout. */
  onRestore(positions: Map<string, Point>): void
}) {
  const [restoring, setRestoring] = useState<null | string>(null)
  const [error, setError] = useState<null | string>(null)
  const list = useQuery({
    queryKey: ['session-tree', 'backups', layout.profile, layout.style, revision],
    queryFn: async () => {
      await flush()

      return fetchBackups(ctx, layout.profile, layout.style)
    },
    retry: false,
    refetchOnWindowFocus: false,
    // A new revision keeps the list on screen until the new one arrives.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey.slice(0, 4).join('\u0000') === ['session-tree', 'backups', layout.profile, layout.style].join('\u0000') ? previous : undefined)
  })

  const restore = async (backup: LayoutBackupInfo) => {
    if (restoring) {
      return
    }

    setRestoring(backup.id)
    setError(null)

    try {
      const full = await fetchBackup(ctx, layout.profile, backup.id)

      if (full.style !== layout.style || full.scope !== layout.scope) {
        throw new Error('That backup belongs to another view.')
      }

      onRestore(new Map(full.positions.map(entry => [entry.id, { x: entry.x, y: entry.y }])))
      onClose()
    } catch (err) {
      setError(restErrorText(err))
    } finally {
      setRestoring(null)
    }
  }

  const backups = list.data?.backups ?? []

  return (
    <Dialog open onOpenChange={open => !open && !restoring && onClose()}>
      <DialogContent className="max-w-lg" data-testid="session-tree-history-dialog" onOpenAutoFocus={focusOn('session-tree-history-close')}>
        <DialogHeader>
          <DialogTitle>Layout history</DialogTitle>
          <DialogDescription>
            Earlier arrangements of {viewLabel}, one list for every project scope. Each Re-arrange or restore keeps the arrangement it replaces (up to the last {BACKUPS_KEPT}, shared by your
            devices). Restoring replaces the current arrangement, which is kept here too.
            {scopeLabel && (
              <span data-testid="session-tree-history-scope-note">
                {' '}
                Restoring replaces the whole layout, every project&rsquo;s blocks, not only {scopeLabel}&rsquo;s.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {list.isPending && (
          <div className="st-hist-note" data-testid="session-tree-history-loading">
            Loading…
          </div>
        )}
        {list.isError && !list.data && (
          <div className="st-dialog-error" role="alert" data-testid="session-tree-history-error">
            Could not load the layout history: {restErrorText(list.error)}
          </div>
        )}
        {list.data && backups.length === 0 && (
          <div className="st-hist-note" data-testid="session-tree-history-empty">
            No earlier arrangements of this view yet. Re-arrange keeps the one it replaces here.
          </div>
        )}
        {backups.length > 0 && (
          <ul className="st-hist-list" data-testid="session-tree-history-list">
            {backups.map(backup => (
              <li
                key={backup.id}
                className="st-hist-row"
                data-testid="session-tree-history-row"
                data-backup-id={backup.id}
                data-count={backup.count}
                data-reason={backup.reason}
                data-project={backup.project ?? undefined}
              >
                <span className="st-hist-when">
                  <b>{dateTimeLabel(backup.created_at)}</b>
                  <span className="st-hist-ago">{agoLabel(backup.created_at, nowMs)}</span>
                </span>
                <span className="st-hist-what" data-testid="session-tree-history-what">
                  {backup.count} block{backup.count === 1 ? '' : 's'} · {backupLabel(backup, projectLabel)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={Boolean(restoring)}
                  data-testid="session-tree-history-restore"
                  onClick={() => void restore(backup)}
                >
                  {restoring === backup.id ? 'Restoring…' : 'Restore'}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {list.data?.read_only && (
          <div className="st-hist-note" data-testid="session-tree-history-read-only">
            The history was written by a newer Session Tree: it reads as empty here.
          </div>
        )}
        {error && (
          <div className="st-dialog-error" role="alert" data-testid="session-tree-history-restore-error">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={Boolean(restoring)} data-testid="session-tree-history-close" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
