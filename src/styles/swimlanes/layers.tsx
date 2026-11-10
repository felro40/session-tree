/**
 * Project swimlanes layers around the flow:
 *
 * - **Under** (flow coordinates, behind the blocks): the lane bands, the hatched "earlier" zone,
 *   the day lines, the "now" line and a collapsed lane's activity bar.
 * - **Over** (screen coordinates, in front): the lane header column — fixed in screen x (a
 *   horizontal pan does not move it), following the lanes vertically, matching their heights at
 *   every zoom, constant in width; the time axis — fixed in screen y, following the canvas
 *   horizontally; and the "no branches N" popover of a lane chip.
 */
import { Codicon } from '@hermes/plugin-sdk'
import { useViewport } from '@xyflow/react'
import { memo, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

import { shortAge } from '../../model/format.ts'
import type { GraphModel } from '../../model/graph.ts'
import { usePluginCtx } from '../../page/plugin-context.ts'
import { ProjectGlyph, projectColor } from '../shared.tsx'
import type { FrameLayerProps, FrameLayout } from '../types.ts'
import type { SwimFrameLayout, SwimLayout } from './layout.ts'
import { AXIS_HEIGHT, HEADER_WIDTH, SWIM_HEIGHT, tokenLabel } from './spec.ts'
import { CHIP_PREFIX } from './swim-flow.tsx'

/** The layout this style's frame computed (`frame.compute` returns a `SwimLayout`). */
const swim = (layout: FrameLayout) => layout as SwimFrameLayout

/** How far the bands reach beyond the content on each side. */
const BAND_OVERHANG = 4000

const SwimUnderSvg = memo(function SwimUnderSvg({ layout }: { layout: SwimLayout }) {
  const left = Math.min(layout.bounds.minX, layout.earlier.x) - BAND_OVERHANG
  const right = Math.max(layout.bounds.maxX, layout.window.right) + BAND_OVERHANG
  const height = layout.bounds.height

  return (
    <svg className="st-swim-under-svg" width={1} height={1} aria-hidden="true">
      <defs>
        <pattern id="st-swim-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={8} className="st-swim-hatch-line" />
        </pattern>
      </defs>
      {layout.lanes.map((lane, index) => (
        <rect
          key={lane.key}
          data-testid="session-tree-lane-band"
          data-lane={lane.key}
          className={`st-swim-band${index % 2 ? ' is-alt' : ''}${lane.collapsed ? ' is-collapsed' : ''}`}
          x={left}
          y={lane.top}
          width={right - left}
          height={lane.height}
        />
      ))}
      <rect className="st-swim-earlier" x={left} y={0} width={layout.earlier.x + layout.earlier.width - left - 6} height={height} fill="url(#st-swim-hatch)" />
      {layout.ticks.map(tick => (
        <line key={tick.day} className="st-swim-dayline" x1={tick.x} y1={0} x2={tick.x} y2={height} />
      ))}
      {layout.lanes.map(lane =>
        lane.activity.map(mark => (
          <rect
            key={`${lane.key}:${mark.id}`}
            className={`st-swim-activity${mark.standin ? ' is-standin' : ''}`}
            data-testid="session-tree-lane-activity"
            data-lane={lane.key}
            x={mark.x}
            y={lane.top + lane.height / 2 - 3}
            width={mark.width}
            height={6}
            rx={3}
            style={{ '--st-pc': projectColor(lane.project) } as CSSProperties}
          />
        ))
      )}
      <line className="st-swim-nowline" data-testid="session-tree-now-line" x1={layout.nowX} y1={0} x2={layout.nowX} y2={height} />
    </svg>
  )
})

export function SwimUnder({ layout }: { layout: FrameLayout }) {
  const { x, y, zoom } = useViewport()

  return (
    <div className="st-swim-under" data-testid="session-tree-swim-under" style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}>
      <SwimUnderSvg layout={swim(layout)} />
    </div>
  )
}

function SinglesPopover({
  layout,
  model,
  active,
  nowMs,
  onOpen,
  onClose
}: {
  layout: SwimLayout
  model: GraphModel
  active: NonNullable<FrameLayerProps['active']>
  nowMs: number
  onOpen: FrameLayerProps['onOpen']
  onClose(): void
}) {
  const ctx = usePluginCtx()
  const ref = useRef<HTMLDivElement>(null)
  const lane = layout.lanes.find(each => `${CHIP_PREFIX}${each.key}` === active.id)

  useEffect(() => {
    const offs = [
      ctx.addEventListener(window, 'keydown', event => {
        if ((event as KeyboardEvent).key === 'Escape') {
          onClose()
        }
      }),
      ctx.addEventListener(
        window,
        'pointerdown',
        event => {
          const target = event.target as Element | null

          // A click on the chip toggles it (the chip's own handler); a menu opened from the list
          // lives in a portal and keeps the popover until it acts.
          if (!target || ref.current?.contains(target) || target.closest?.('[data-testid="session-tree-lane-chip"], [role="menu"]')) {
            return
          }

          onClose()
        },
        true
      )
    ]

    return () => offs.forEach(off => off())
  }, [ctx, onClose])

  if (!lane || lane.collapsed || !lane.chip) {
    return null
  }

  const width = 260
  const style: CSSProperties = {
    left: Math.max(HEADER_WIDTH + 6, active.box.x + active.box.width - width),
    top: active.box.y + active.box.height + 6,
    width
  }

  return (
    <div ref={ref} className="st-swim-pop" role="dialog" aria-label={`${lane.label} · no branches`} data-testid="session-tree-lane-popover" data-lane={lane.key} style={style}>
      <h4>
        {lane.label} · no branches <span>{lane.singleIds.length}</span>
      </h4>
      <div className="st-swim-pop-list">
        {lane.singleIds.map(id => {
          const node = model.nodeById.get(id)

          if (!node?.row) {
            return null
          }

          return (
            <div
              key={id}
              className={`st-swim-pop-item${node.archived ? ' is-archived' : ''}`}
              data-st-node={id}
              data-testid="session-tree-lane-single"
              data-session-id={node.row.id}
              title={`${node.title} — double-click opens it in a tab · right-click for actions`}
              style={{ '--st-pc': projectColor(lane.project) } as CSSProperties}
              onDoubleClick={() => onOpen(node)}
            >
              <span className="st-swim-pop-dot" />
              <span className="st-swim-pop-title">{node.title}</span>
              <span className="st-swim-pop-age">{shortAge(node.row.last_active || node.row.started_at, nowMs)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SwimOver({ layout: frameLayout, model, nowMs, onOpen, onToggleLane, active, onCloseActive }: FrameLayerProps) {
  const layout = swim(frameLayout)
  const { x, y, zoom } = useViewport()
  const scoped = model.options.scope !== 'all'
  const sx = (worldX: number) => x + worldX * zoom

  return (
    <div className="st-swim-over" data-testid="session-tree-swim-over">
      <div className="st-swim-axis" data-testid="session-tree-axis" style={{ height: AXIS_HEIGHT }}>
        <div className="st-swim-tick is-earlier" data-testid="session-tree-axis-earlier" style={{ left: sx(layout.earlier.x + 10) }}>
          ‹ earlier
        </div>
        {layout.ticks.map(tick => (
          <div key={tick.day} className={`st-swim-tick${tick.bold ? ' is-bold' : ''}`} data-testid="session-tree-axis-tick" data-day={tick.day} data-x={tick.x} style={{ left: sx(tick.x) }}>
            {tick.label}
          </div>
        ))}
        <div className="st-swim-now" data-testid="session-tree-now" style={{ left: sx(layout.nowX) }}>
          now
        </div>
      </div>
      <div className="st-swim-gutter" data-testid="session-tree-lane-headers" style={{ width: HEADER_WIDTH }}>
        {layout.lanes.map((lane, index) => {
          const height = lane.height * zoom
          const disabled = scoped

          return (
            <div
              key={lane.key}
              role="button"
              tabIndex={-1}
              aria-expanded={!lane.collapsed}
              aria-disabled={disabled || undefined}
              className={`st-swim-lh${index % 2 ? ' is-alt' : ''}${lane.collapsed ? ' is-collapsed' : ''}${lane.scopeCollapsed ? ' is-scope-collapsed' : ''}`}
              data-testid="session-tree-lane-header"
              data-lane={lane.key}
              data-label={lane.label}
              data-sessions={lane.sessions}
              data-tokens={lane.tokens}
              data-in-trees={lane.inTrees}
              data-singles={lane.singles}
              data-collapsed={lane.collapsed ? 'true' : 'false'}
              data-scope-collapsed={lane.scopeCollapsed ? 'true' : 'false'}
              title={disabled ? 'Switch to All projects to collapse or expand lanes' : lane.collapsed ? 'Expand this lane' : 'Collapse this lane'}
              style={{ top: y + lane.top * zoom, height, '--st-pc': projectColor(lane.project) } as CSSProperties}
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                if (!disabled) {
                  onToggleLane(lane.key)
                }
              }}
            >
              <div className="st-swim-lh-name">
                <ProjectGlyph project={lane.project} size={11} />
                <span className="st-swim-lh-label">{lane.label}</span>
                {!disabled && <Codicon name={lane.collapsed ? 'chevron-right' : 'chevron-down'} size={11} className="st-swim-lh-chevron" />}
              </div>
              {!lane.collapsed && height >= SWIM_HEIGHT && (
                <>
                  <div className="st-swim-lh-meta" data-field="totals">
                    {lane.sessions} session{lane.sessions === 1 ? '' : 's'} · {tokenLabel(lane.tokens)} tok
                  </div>
                  <div className="st-swim-lh-meta is-sub" data-field="split">
                    {lane.inTrees} in trees · {lane.singles} single{lane.singles === 1 ? '' : 's'}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="st-swim-corner" style={{ width: HEADER_WIDTH, height: AXIS_HEIGHT }}>
        Projects · {layout.monthLabel}
      </div>
      {active && <SinglesPopover layout={layout} model={model} active={active} nowMs={nowMs} onOpen={onOpen} onClose={onCloseActive} />}
    </div>
  )
}
