/**
 * The block context menu: the PROJECTS pane session menu's items (R14). Card 3 wires the
 * actions; here every item is shown disabled. Read-only blocks never open it (R5).
 */
import { useEffect, useRef } from 'react'

import { usePluginCtx } from './plugin-context.ts'

const ITEMS: (string | null)[] = [
  'Appearance ▸',
  'Pin',
  'Rename…',
  'Move to project ▸',
  'Copy ID',
  null,
  'Branch',
  'Export',
  'Mark as read',
  null,
  'Archive',
  'Delete'
]

export interface MenuState {
  nodeId: string
  x: number
  y: number
}

export function SessionMenu({ menu, onClose }: { menu: MenuState; onClose(): void }) {
  const ctx = usePluginCtx()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const offDown = ctx.addEventListener(
      document,
      'pointerdown',
      event => {
        if (!ref.current?.contains(event.target as Node)) {
          onClose()
        }
      },
      true
    )
    const offKey = ctx.addEventListener(document, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'Escape') {
        onClose()
      }
    })

    return () => {
      offDown()
      offKey()
    }
  }, [ctx, onClose])

  return (
    <div
      ref={ref}
      className="session-tree__menu"
      role="menu"
      data-testid="session-tree-menu"
      data-node-id={menu.nodeId}
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={event => event.preventDefault()}
    >
      {ITEMS.map((item, index) =>
        item === null ? (
          <hr key={`sep-${index}`} />
        ) : (
          <button
            key={item}
            type="button"
            role="menuitem"
            disabled
            className={item === 'Delete' ? 'is-danger' : undefined}
            title="Session actions arrive in a later version"
          >
            {item}
          </button>
        )
      )}
    </div>
  )
}
