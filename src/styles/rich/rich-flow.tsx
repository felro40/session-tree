/**
 * Rich cards (mockup `variants/rich-cards/`): airy 280 px cards — a project chip, the 7-day
 * activity sparkline and ⋯ on top, a two-line title (bold with an accent dot when unread), a
 * two-line excerpt of the last message (R22; the first prompt when there is none), a footer with
 * the model chip, last used, messages and a token bar scaled to the largest session in scope.
 * Compacted ×N: ghost cards stacked behind plus a tag. Status: running is an animated border,
 * needs input an amber banner strip above the card, open an accent glow, pinned a pin glyph.
 * Links are soft curves (R13 detours on drop); "continued as" is a dashed accent curve with a
 * pill. Every card has a fixed height: the details arriving never move anything.
 */
import { Codicon } from '@hermes/plugin-sdk'
import { BaseEdge, EdgeLabelRenderer, useInternalNode } from '@xyflow/react'
import type { Edge, EdgeProps, InternalNode, Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { CSSProperties } from 'react'

import { agoLabel } from '../../model/format.ts'
import type { GraphNode } from '../../model/graph.ts'
import type { Rect } from '../../model/layout.ts'
import { curveRouter } from '../../model/route.ts'
import type { Port } from '../../model/route.ts'
import { useSessionActions } from '../../page/session-actions-context.ts'
import { BlockHandles, ProjectGlyph, projectColor } from '../shared.tsx'
import { tokenLabel } from '../swimlanes/spec.ts'
import type { BlockData, LinkData } from '../types.ts'
import { useDetails, useRichEnv } from './context.tsx'
import type { DetailsEntry } from './details.ts'
import {
  activityTooltip,
  cardTokens,
  MAX_GHOSTS,
  RICH_HEIGHT,
  RICH_RESET_X,
  RICH_WIDTH,
  richPorts,
  shortModel,
  sparkPoints,
  TOKEN_BAR,
  tokenBarWidth
} from './spec.ts'

export type RichCardNode = Node<BlockData, 'rich-session'>
export type RichStandinNode = Node<BlockData, 'rich-standin'>
export type RichLinkEdge = Edge<LinkData, 'rich-link'>

export const FIRST_PROMPT_LABEL = 'First prompt'

function cardClass(data: BlockData, selected: boolean, extra = ''): string {
  const { node, status } = data

  return [
    'session-tree__block',
    'st-rich',
    extra,
    selected ? 'is-selected' : '',
    data.inLineage ? 'is-lineage' : '',
    status?.open ? 'is-open' : '',
    status?.running ? 'is-running' : '',
    status?.needsInput ? 'is-asking' : '',
    status?.unread ? 'is-unread' : '',
    node.archived ? 'is-archived' : '',
    node.outOfScope ? 'is-out-of-scope' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

/** The 7-day activity: a small area sparkline with a per-day tooltip. */
export function Sparkline({ values, days }: { values: readonly number[]; days: readonly string[] }) {
  const points = sparkPoints(values)
  const last = points[points.length - 1]
  const line = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const tip = activityTooltip(values, days)

  return (
    <span className="st-rc-spark" data-testid="session-tree-sparkline" data-activity={values.join(',')} data-days={days.join(',')} title={tip}>
      <svg viewBox="0 0 50 18" width={50} height={18} aria-label={tip} role="img">
        {points.length > 0 && <path d={`M${points[0].x.toFixed(1)} 17 L${line.replace(/ /g, ' L')} L${last.x.toFixed(1)} 17Z`} />}
        <polyline points={line} />
        {last && <circle cx={last.x} cy={last.y} r={1.8} />}
      </svg>
    </span>
  )
}

function SparkSlot({ entry }: { entry: DetailsEntry | undefined }) {
  if (!entry) {
    return <span className="st-rc-spark is-loading" data-testid="session-tree-sparkline" data-loading="true" />
  }

  return entry.details && entry.details.activity.length > 0 ? (
    <Sparkline values={entry.details.activity} days={entry.details.days} />
  ) : (
    <span className="st-rc-spark is-empty" data-testid="session-tree-sparkline" data-activity="" />
  )
}

/** Two lines: the excerpt, the first prompt (labelled) when there is none, or skeleton lines. */
function Excerpt({ node, entry }: { node: GraphNode; entry: DetailsEntry | undefined }) {
  if (!entry) {
    return (
      <div className="st-rc-pv is-loading" data-testid="session-tree-excerpt" data-loading="true">
        <i className="st-rc-sk" style={{ width: '92%' }} />
        <i className="st-rc-sk" style={{ width: '64%' }} />
      </div>
    )
  }

  const excerpt = entry.details?.excerpt

  if (excerpt) {
    return (
      <div className="st-rc-pv" data-testid="session-tree-excerpt" data-kind="last" data-role={entry.details?.role ?? undefined} title={excerpt}>
        <span data-field="excerpt">{excerpt}</span>
      </div>
    )
  }

  const preview = node.row?.preview?.trim()

  return (
    <div className="st-rc-pv" data-testid="session-tree-excerpt" data-kind={preview ? 'first-prompt' : 'none'} title={preview || undefined}>
      {preview ? (
        <>
          <b data-field="excerpt-label">{FIRST_PROMPT_LABEL}:</b> <span data-field="excerpt">{preview}</span>
        </>
      ) : (
        <span className="st-rc-none">No messages to show</span>
      )}
    </div>
  )
}

export const RichCard = memo(function RichCard({ data, selected }: NodeProps<RichCardNode>) {
  const { node, status, project } = data
  const actions = useSessionActions()
  const env = useRichEnv()
  const row = node.row!
  const entry = useDetails(node.id)
  const tokens = cardTokens(node)
  const max = env?.maxTokens ?? 0
  const bar = tokenBarWidth(tokens, max)
  const ghosts = Math.min(node.compacted, MAX_GHOSTS)

  return (
    <div
      className={cardClass(data, Boolean(selected))}
      data-testid="session-tree-block"
      data-session-id={row.id}
      data-node-id={node.id}
      data-project-id={node.projectId ?? ''}
      data-status={status?.tone ?? 'idle'}
      data-running={status?.running ? 'true' : undefined}
      data-needs-input={status?.needsInput ? 'true' : undefined}
      data-unread={status?.unread ? 'true' : undefined}
      data-pinned={status?.pinned ? 'true' : undefined}
      data-open={status?.open ? 'true' : undefined}
      data-archived={node.archived ? 'true' : undefined}
      data-out-of-scope={node.outOfScope ? 'true' : undefined}
      data-lineage={data.inLineage ? 'true' : undefined}
      data-ghosts={ghosts}
      data-tokens={tokens}
      data-token-max={max}
      data-details={entry ? (entry.details ? 'loaded' : 'missing') : 'loading'}
      style={{ width: RICH_WIDTH, height: RICH_HEIGHT, '--st-pc': projectColor(project) } as CSSProperties}
    >
      <BlockHandles resetX={RICH_RESET_X} />
      {Array.from({ length: ghosts }, (_, index) => (
        <i key={index} className="st-rc-ghost" data-testid="session-tree-ghost" style={{ '--st-g': index + 1 } as CSSProperties} aria-hidden="true" />
      ))}
      {status?.needsInput && (
        <div className="st-rc-banner" data-testid="session-tree-needs-input">
          ● Needs input <span>· waiting on your reply</span>
        </div>
      )}
      <div className="st-rc-body">
        <div className="st-rc-hd">
          <span className="st-rc-proj" data-field="project">
            <ProjectGlyph project={project} size={10} />
            {project?.label ?? 'Home'}
          </span>
          {status?.pinned && <Codicon name="pinned" size={12} className="st-pin" aria-label="pinned" />}
          {status?.unread && <span className="st-rc-udot" data-testid="session-tree-unread-dot" title="Unread" />}
          {status?.running && <span className="st-rc-run">running</span>}
          {node.archived && <span className="st-rc-proj st-rc-arch">archived</span>}
          <span className="st-rc-grow" />
          <SparkSlot entry={entry} />
          {actions?.canAct(node) && (
            // R14: the session menu from the card itself.
            <button
              type="button"
              className="st-more st-rc-more nodrag nopan"
              data-testid="session-tree-block-more"
              aria-label="Session actions"
              title="Session actions"
              onMouseDown={event => event.stopPropagation()}
              onDoubleClick={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation()
                actions.openMenuFor(node.id, event.currentTarget)
              }}
            >
              <Codicon name="ellipsis" size={14} />
            </button>
          )}
        </div>
        <div className="st-rc-ttl" data-field="title" title={node.title}>
          {node.title}
        </div>
        <Excerpt node={node} entry={entry} />
        <div className="st-rc-ft">
          <span className="st-rc-model" data-field="model" title={row.model ?? undefined}>
            {shortModel(row.model)}
          </span>
          <span data-field="last-used">{agoLabel(row.last_active || row.started_at, data.nowMs)}</span>
          <span data-field="messages">{row.message_count ?? 0} msgs</span>
          <span className="st-rc-tok" title={`${tokens.toLocaleString()} tokens`}>
            <span className="st-rc-bar" style={{ width: TOKEN_BAR }}>
              <b data-testid="session-tree-token-bar" style={{ width: bar }} />
            </span>
            <span data-field="tokens">{tokenLabel(tokens)}</span>
          </span>
        </div>
      </div>
      {node.compacted > 0 && (
        <span
          className="st-rc-ctag"
          data-testid="session-tree-compacted"
          title={`${node.compacted} earlier segment${node.compacted > 1 ? 's' : ''} compacted into this card`}
        >
          <Codicon name="layers" size={10} />
          compacted ×{node.compacted}
        </span>
      )}
    </div>
  )
})

export const RichStandin = memo(function RichStandin({ data }: NodeProps<RichStandinNode>) {
  const { node } = data

  return (
    <div
      className={cardClass(data, false, 'is-standin')}
      data-testid="session-tree-standin"
      data-node-id={node.id}
      data-missing-id={node.missingId}
      data-out-of-scope={node.outOfScope ? 'true' : undefined}
      style={{ width: RICH_WIDTH, height: RICH_HEIGHT }}
    >
      <BlockHandles resetX={RICH_RESET_X} />
      <div className="st-rc-body">
        <div className="st-rc-hd">
          <span className="st-rc-proj st-rc-arch">unknown</span>
        </div>
        <div className="st-rc-ttl">Parent not loaded</div>
        <div className="st-rc-pv">Deleted, hidden or outside the loaded sessions</div>
        <i className="st-rc-sk" style={{ width: '82%' }} />
        <i className="st-rc-sk" style={{ width: '56%' }} />
      </div>
    </div>
  )
})

function rectOfInternal(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? RICH_WIDTH,
    height: node.measured?.height ?? node.height ?? RICH_HEIGHT
  }
}

const samePort = (a: Port, b: Port) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && a.dir === b.dir

export function RichLink({ id, source, target, data }: EdgeProps<RichLinkEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode || !data) {
    return null
  }

  const { from, to } = richPorts(data.kind, rectOfInternal(sourceNode), rectOfInternal(targetNode))
  const routed = data.route && samePort(data.route.from, from) && samePort(data.route.to, to)
  // R13: the stored on-drop route while both ends stay put, the live soft curve otherwise.
  const route = routed ? data.route!.route : curveRouter.live(from, to)
  const classes = [
    'session-tree__link',
    'st-rich-link',
    `session-tree__link--${data.kind}`,
    data.fromStandin ? 'session-tree__link--standin' : '',
    data.highlighted ? 'is-highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <g
      data-testid="session-tree-link"
      data-source={source}
      data-target={target}
      data-kind={data.kind}
      data-standin={data.fromStandin ? 'true' : undefined}
      data-detoured={route.detoured ? 'true' : 'false'}
      data-highlighted={data.highlighted ? 'true' : undefined}
      className={data.dimmed ? 'is-dimmed' : undefined}
    >
      <BaseEdge id={id} path={route.svg} className={classes} />
      <circle className={`st-rich-link-end${data.kind === 'reset' ? ' is-reset' : ''}${data.highlighted ? ' is-highlighted' : ''}`} cx={to.x} cy={to.y} r={4} />
      {data.kind === 'reset' && (
        <EdgeLabelRenderer>
          <div
            className="session-tree__link-label st-rich-pill nodrag nopan"
            data-testid="session-tree-link-label"
            data-link-id={id}
            style={{ transform: `translate(-50%, -50%) translate(${route.mid.x}px, ${route.mid.y}px)` }}
          >
            continued as
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}
