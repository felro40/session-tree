/**
 * The app's own wording for the session menu (`t.sidebar.row.*`, `t.sidebar.projects.*`,
 * `t.common.*` through the SDK's `useI18n`), so labels match `session-actions-menu.tsx` in every
 * language the app speaks. Each string falls back to the English source text
 * (`apps/desktop/src/i18n/en.ts`, `en_projects.ts`) if a key is missing.
 */
import { useI18n } from '@hermes/plugin-sdk'
import { useMemo } from 'react'

export interface MenuLabels {
  rename: string
  pin: string
  unpin: string
  markRead: string
  markUnread: string
  appearance: string
  noColor: string
  copyId: string
  copyIdFailed: string
  copied: string
  branch: string
  export: string
  moveToProject: string
  moveNoProjects: string
  movedTo(name: string): string
  moveFailed: string
  archive: string
  unarchive: string
  delete: string
  deleteTitle: string
  deleteDesc(title: string): string
  deleting: string
  deleted: string
  renameTitle: string
  untitledPlaceholder: string
  renamed: string
  renameFailed: string
  unreadFailed: string
  sessionActions: string
  cancel: string
  save: string
  exported: string
  exportFailed: string
}

type Tree = Record<string, unknown> | undefined

function pick(tree: unknown, path: string): unknown {
  let value: unknown = tree

  for (const key of path.split('.')) {
    value = (value as Tree)?.[key]
  }

  return value
}

export function labelsFrom(t: unknown): MenuLabels {
  const text = (path: string, fallback: string): string => {
    const value = pick(t, path)

    return typeof value === 'string' && value ? value : fallback
  }

  const format = (path: string, fallback: (arg: string) => string) => (arg: string) => {
    const value = pick(t, path)

    if (typeof value === 'function') {
      try {
        const out = (value as (arg: string) => unknown)(arg)

        if (typeof out === 'string' && out) {
          return out
        }
      } catch {
        // The fallback below.
      }
    }

    return fallback(arg)
  }

  return {
    rename: text('sidebar.row.rename', 'Rename…'),
    pin: text('sidebar.row.pin', 'Pin'),
    unpin: text('sidebar.row.unpin', 'Unpin'),
    markRead: text('sidebar.row.markRead', 'Mark as read'),
    markUnread: text('sidebar.row.markUnread', 'Mark as unread'),
    appearance: text('sidebar.projects.menuAppearance', 'Appearance'),
    noColor: text('sidebar.projects.noColor', 'No color'),
    copyId: text('sidebar.row.copyId', 'Copy ID'),
    copyIdFailed: text('sidebar.row.copyIdFailed', 'Could not copy session ID'),
    copied: text('common.copied', 'Copied'),
    branch: text('sidebar.row.branchFrom', 'Branch'),
    export: text('sidebar.row.export', 'Export'),
    moveToProject: text('sidebar.projects.moveToProject', 'Move to project'),
    moveNoProjects: text('sidebar.projects.moveNoProjects', 'No other projects'),
    movedTo: format('sidebar.projects.movedTo', name => `Moved to ${name}`),
    moveFailed: text('sidebar.projects.moveFailed', 'Could not move session'),
    archive: text('sidebar.row.archive', 'Archive'),
    unarchive: text('sidebar.row.unarchive', 'Unarchive'),
    delete: text('common.delete', 'Delete'),
    deleteTitle: text('sidebar.row.deleteTitle', 'Delete session?'),
    deleteDesc: format('sidebar.row.deleteDesc', title => `This will permanently delete “${title}”. This cannot be undone.`),
    deleting: text('sidebar.row.deleting', 'Deleting…'),
    deleted: text('sidebar.row.deleted', 'Session deleted'),
    renameTitle: text('sidebar.row.renameTitle', 'Rename session'),
    untitledPlaceholder: text('sidebar.row.untitledPlaceholder', 'Untitled session'),
    renamed: text('sidebar.row.renamed', 'Renamed'),
    renameFailed: text('sidebar.row.renameFailed', 'Rename failed'),
    unreadFailed: text('sidebar.row.unreadFailed', 'Could not update unread state'),
    sessionActions: text('sidebar.row.sessionActions', 'Session actions'),
    cancel: text('common.cancel', 'Cancel'),
    save: text('common.save', 'Save'),
    exported: text('desktop.sessionExported', 'Session exported'),
    exportFailed: text('desktop.sessionExportFailed', 'Could not export session')
  }
}

export function useMenuLabels(): MenuLabels {
  const { t } = useI18n()

  return useMemo(() => labelsFrom(t), [t])
}
