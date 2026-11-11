/**
 * The block menu (R14): the PROJECTS pane session menu's items, in its order and with its labels
 * (`apps/desktop/src/app/chat/sidebar/session-actions-menu.tsx`, row surface), built from the
 * SDK UI kit's ContextMenu. It opens on a right-click on an in-scope session block, or from a ⋯
 * button (block or inspector). Dimmed out-of-scope blocks, stand-ins and empty canvas get no
 * menu and no browser menu either (R5, R7). Esc or a click outside closes it; focus then goes
 * back to the canvas (never to a button Space would click), unless a dialog opened from it.
 *
 * The app's Open-in-new-tab / New window / Open in terminal items are not part of R14 (double-
 * click opens a tab here).
 */
import {
  Codicon,
  ColorSwatches,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  CopyButton,
  icons,
  PROFILE_SWATCHES
} from '@hermes/plugin-sdk'
import { useCallback, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'

import { deleteBlockedReason } from '../model/actions.ts'
import type { GraphModel, GraphNode } from '../model/graph.ts'
import { useMenuLabels } from './labels.ts'
import type { MenuLabels } from './labels.ts'
import { useSessionActions } from './session-actions-context.ts'
import type { SessionActions } from './session-actions-context.ts'

/**
 * The block an event happened on: a React Flow node, or a list entry that stands for one (a
 * Swimlanes singles popover row carries `data-st-node`).
 */
export function nodeIdAt(target: EventTarget | null): null | string {
  const element = (target as Element | null)?.closest?.('.react-flow__node, [data-st-node]')

  return element?.getAttribute('data-st-node') ?? element?.getAttribute('data-id') ?? null
}

const ICON = 14

function MenuItems({ node, actions, labels }: { node: GraphNode; actions: SessionActions; labels: MenuLabels }) {
  const row = node.row!
  const status = actions.statusOf(node)
  const unread = Boolean(row.unread)
  const blocked = deleteBlockedReason(status)
  const targets = actions.moveTargets(node)
  const ArchiveOff = icons.ArchiveOff

  return (
    <>
      {/* IDENTITY */}
      <ContextMenuItem
        data-action="rename"
        onSelect={() => {
          actions.noteDialogFromMenu()
          actions.rename(node)
        }}
      >
        <Codicon name="edit" size={ICON} />
        <span>{labels.rename}</span>
      </ContextMenuItem>
      <ContextMenuItem data-action="pin" data-pinned={row.pinned ? 'true' : 'false'} onSelect={() => actions.togglePin(node)}>
        <Codicon name="pin" size={ICON} />
        <span>{row.pinned ? labels.unpin : labels.pin}</span>
      </ContextMenuItem>
      <ContextMenuItem data-action="read" data-unread={unread ? 'true' : 'false'} onSelect={() => void actions.toggleUnread(node)}>
        <Codicon name={unread ? 'mail-read' : 'mail'} size={ICON} />
        <span>{unread ? labels.markRead : labels.markUnread}</span>
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger data-action="appearance">
          <Codicon name="symbol-color" size={ICON} />
          <span>{labels.appearance}</span>
        </ContextMenuSubTrigger>
        {/* The app's swatches: the SDK's PROFILE_SWATCHES through its ColorSwatches. */}
        <ContextMenuSubContent className="p-2" data-testid="session-tree-menu-appearance">
          <ColorSwatches
            clearIcon="circle-slash"
            clearLabel={labels.noColor}
            swatches={PROFILE_SWATCHES}
            value={actions.colorOf(node)}
            onChange={color => actions.setColor(node, color)}
          />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <CopyButton
        appearance="context-menu-item"
        errorMessage={labels.copyIdFailed}
        iconClassName="size-3.5 text-current"
        label={labels.copyId}
        text={row.id}
        onCopied={() => actions.copied(node)}
        onCopyError={error => actions.copyFailed(error)}
      />
      <ContextMenuSeparator />
      {/* WORK */}
      <ContextMenuItem data-action="branch" onSelect={() => void actions.branch(node)}>
        <Codicon name="repo-forked" size={ICON} />
        <span>{labels.branch}</span>
      </ContextMenuItem>
      <ContextMenuItem data-action="export" onSelect={() => void actions.exportSession(node)}>
        <Codicon name="cloud-download" size={ICON} />
        <span>{labels.export}</span>
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger data-action="move">
          <Codicon name="folder" size={ICON} />
          <span>{labels.moveToProject}</span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent data-testid="session-tree-menu-move">
          {targets.length === 0 ? (
            <ContextMenuItem disabled>{labels.moveNoProjects}</ContextMenuItem>
          ) : (
            targets.map(project => (
              <ContextMenuItem key={project.id} data-action="move-to" data-project-id={project.id} onSelect={() => void actions.moveTo(node, project)}>
                {project.label}
              </ContextMenuItem>
            ))
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      {/* DANGER */}
      <ContextMenuItem data-action="archive" data-archived={row.archived ? 'true' : 'false'} onSelect={() => void actions.toggleArchive(node)}>
        {row.archived && ArchiveOff ? <ArchiveOff className="size-3.5" /> : <Codicon name="archive" size={ICON} />}
        <span>{row.archived ? labels.unarchive : labels.archive}</span>
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        className="text-destructive focus:text-destructive"
        data-action="delete"
        data-blocked-reason={blocked}
        disabled={Boolean(blocked)}
        title={blocked}
        onSelect={() => {
          actions.noteDialogFromMenu()
          actions.remove(node)
        }}
      >
        <Codicon name="trash" size={ICON} />
        <span>{labels.delete}</span>
        {blocked && <span className="st-menu-note">{blocked}</span>}
      </ContextMenuItem>
    </>
  )
}

export interface SessionMenuProps {
  model: GraphModel
  /** The canvas element (the menu's trigger). */
  children: ReactElement
  /** Right before the menu opens for `node` (select it, hide the tooltip). */
  onOpenFor(node: GraphNode): void
  /** Where focus goes when the menu closes (the canvas). */
  onRestoreFocus(): void
}

export function SessionMenu({ model, children, onOpenFor, onRestoreFocus }: SessionMenuProps) {
  const actions = useSessionActions()
  const labels = useMenuLabels()
  const [nodeId, setNodeId] = useState<null | string>(null)
  const node = nodeId ? model.nodeById.get(nodeId) : undefined

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const requested = actions?.takeRequestedMenuNode() ?? null
      const id = requested ?? nodeIdAt(event.target)
      const target = id ? model.nodeById.get(id) : undefined

      if (!actions || !actions.canAct(target)) {
        // R5 / R7 and empty canvas: neither our menu nor the browser's.
        event.preventDefault()

        return
      }

      setNodeId(target!.id)
      onOpenFor(target!)
    },
    [actions, model, onOpenFor]
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      {actions && node && actions.canAct(node) && (
        <ContextMenuContent
          className="w-40"
          aria-label={labels.sessionActions}
          data-testid="session-tree-menu"
          data-node-id={node.id}
          onCloseAutoFocus={event => {
            event.preventDefault()

            if (!actions.dialogOpening()) {
              onRestoreFocus()
            }
          }}
        >
          <MenuItems node={node} actions={actions} labels={labels} />
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}
