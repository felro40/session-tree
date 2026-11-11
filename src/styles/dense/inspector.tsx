/**
 * The Dense inspector (264 px, right): everything about the selected block, plus the singles
 * list (R8) at its foot, filtered by scope. Its action buttons run the session actions (R14).
 */
import { Codicon } from '@hermes/plugin-sdk'
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { agoLabel, compactNumber, costLabel, dateTimeLabel, shortAge } from '../../model/format.ts'
import { singlesInScope } from '../../model/graph.ts'
import type { GraphModel, GraphNode } from '../../model/graph.ts'
import type { LiveStatus } from '../../model/status.ts'
import { useMenuLabels } from '../../page/labels.ts'
import { useSessionActions } from '../../page/session-actions-context.ts'
import { ProjectGlyph, projectColor } from '../shared.tsx'
import type { StylePanelProps } from '../types.ts'

function NodeLink({
  model,
  id,
  relation,
  onSelect,
  onOpen,
  nowMs
}: {
  model: GraphModel
  id: string
  relation?: string
  onSelect: StylePanelProps['onSelect']
  onOpen: StylePanelProps['onOpen']
  nowMs: number
}) {
  const node = model.nodeById.get(id)

  if (!node) {
    return null
  }

  const project = node.projectId ? model.projects.find(p => p.id === node.projectId) : undefined

  return (
    <button
      type="button"
      className={`st-lk${node.outOfScope ? ' is-dim' : ''}`}
      data-testid="session-tree-inspector-link"
      data-node-id={node.id}
      data-relation={relation ?? ''}
      title={node.kind === 'standin' ? 'Parent not loaded' : node.title}
      disabled={node.readOnly}
      style={{ '--st-pc': projectColor(project) } as CSSProperties}
      onClick={() => onSelect(node.id, true)}
      onDoubleClick={() => onOpen(node)}
    >
      {relation && <span className="st-rel">{relation}</span>}
      <span className="st-lk-dot" />
      <span className="st-lk-title">{node.kind === 'standin' ? 'Parent not loaded' : node.title}</span>
      <span className="st-lk-age">{node.row ? shortAge(node.row.last_active || node.row.started_at, nowMs) : '?'}</span>
    </button>
  )
}

function Stat({ field, label, value, title }: { field: string; label: string; value: ReactNode; title?: string }) {
  return (
    <div>
      <small>{label}</small>
      <b data-field={field} title={title}>
        {value}
      </b>
    </div>
  )
}

function StatusTags({ node, status }: { node: GraphNode; status?: LiveStatus }) {
  const tags: { key: string; label: string; tone?: string }[] = []

  if (status?.open) {
    tags.push({ key: 'open', label: '● open in app', tone: 'acc' })
  }

  if (status?.running) {
    tags.push({ key: 'running', label: 'running', tone: 'run' })
  }

  if (status?.needsInput) {
    tags.push({ key: 'needs-input', label: 'needs input', tone: 'ask' })
  }

  if (status?.unread) {
    tags.push({ key: 'unread', label: 'unread', tone: 'acc' })
  }

  if (status?.pinned) {
    tags.push({ key: 'pinned', label: 'pinned' })
  }

  if (node.archived) {
    tags.push({ key: 'archived', label: 'archived' })
  }

  if (node.compacted > 0) {
    tags.push({ key: 'compacted', label: `compacted ×${node.compacted}`, tone: 'acc' })
  }

  if (node.outOfScope) {
    tags.push({ key: 'out-of-scope', label: 'outside this project' })
  }

  return (
    <div className="st-tags" data-testid="session-tree-inspector-tags">
      {tags.map(tag => (
        <span key={tag.key} className={`st-tag${tag.tone ? ` st-tag--${tag.tone}` : ''}`} data-tag={tag.key}>
          {tag.label}
        </span>
      ))}
    </div>
  )
}

/** The inspector's action row (R14): Open, Branch, Rename, Archive / Unarchive, and ⋯ for the
 *  whole session menu. Same functions as the block menu. */
function Actions({ node, onOpen }: { node: GraphNode; onOpen: StylePanelProps['onOpen'] }) {
  const actions = useSessionActions()
  const labels = useMenuLabels()
  const available = Boolean(actions?.canAct(node))
  const archived = Boolean(node.row?.archived)

  return (
    <div className="st-acts" data-testid="session-tree-inspector-actions">
      <button type="button" className="st-act st-act--primary" data-action="open" disabled={!available} title="Open in a new tab" onClick={() => onOpen(node)}>
        <Codicon name="link-external" size={12} />
        Open
      </button>
      <button
        type="button"
        className="st-act"
        data-action="branch"
        disabled={!available}
        title={labels.branch}
        onClick={event => {
          // A double-click is one Branch: the second click would branch the new child (card-3 review).
          if (event.detail > 1) {
            return
          }

          void actions?.branch(node)
        }}
      >
        <Codicon name="repo-forked" size={12} />
        {labels.branch}
      </button>
      <button type="button" className="st-act" data-action="rename" disabled={!available} title={labels.rename} aria-label={labels.rename} onClick={() => actions?.rename(node)}>
        <Codicon name="edit" size={12} />
      </button>
      <button
        type="button"
        className="st-act"
        data-action="archive"
        disabled={!available}
        title={archived ? labels.unarchive : labels.archive}
        aria-label={archived ? labels.unarchive : labels.archive}
        onClick={() => void actions?.toggleArchive(node)}
      >
        <Codicon name="archive" size={12} />
      </button>
      <button
        type="button"
        className="st-act"
        data-action="more"
        data-testid="session-tree-inspector-more"
        disabled={!available}
        title={labels.sessionActions}
        aria-label={labels.sessionActions}
        onClick={event => actions?.openMenuFor(node.id, event.currentTarget)}
      >
        <Codicon name="ellipsis" size={12} />
      </button>
    </div>
  )
}

function SessionDetails({ model, node, status, onSelect, onOpen, nowMs }: StylePanelProps & { node: GraphNode; status?: LiveStatus }) {
  const row = node.row!
  const project = node.projectId ? model.projects.find(p => p.id === node.projectId) : undefined
  const parent = model.parentOf.get(node.id)
  const from = model.continuedFrom.get(node.id)
  const continuedAs = model.continuedAs.get(node.id) ?? []
  const children = model.childrenOf.get(node.id) ?? []
  const segments = row._lineage_ids && row._lineage_ids.length > 1 ? row._lineage_ids : null
  const linkProps = { model, onSelect, onOpen, nowMs }

  return (
    <>
      <div className="st-ih">
        <ProjectGlyph project={project} size={11} />
        <span data-field="project">{project?.label ?? 'No project'}</span>
        {model.options.profile === '*' && <span className="st-ih-profile" data-field="profile">{node.profile}</span>}
        <span className="st-ih-id" data-field="id" title={row.id}>
          {row.id}
        </span>
      </div>
      <div className="st-it" data-field="title">
        {node.title}
      </div>
      <StatusTags node={node} status={status} />
      <Actions node={node} onOpen={onOpen} />
      <div className="st-sec">
        <div className="st-kv">
          <Stat field="last-used" label="Last used" value={agoLabel(row.last_active || row.started_at, nowMs)} title={dateTimeLabel(row.last_active)} />
          <Stat field="started" label="Started" value={dateTimeLabel(row.started_at)} />
          <Stat field="messages" label="Messages" value={String(row.message_count ?? 0)} />
          <Stat field="tool-calls" label="Tool calls" value={String(row.tool_call_count ?? 0)} />
          <Stat field="tokens-in" label="Tokens in" value={compactNumber(row.input_tokens)} title={String(row.input_tokens ?? 0)} />
          <Stat field="tokens-out" label="Tokens out" value={compactNumber(row.output_tokens)} title={String(row.output_tokens ?? 0)} />
          <Stat field="cost" label="Cost" value={costLabel(row.actual_cost_usd, row.estimated_cost_usd)} />
          <Stat field="model" label="Model" value={row.model || '—'} title={row.model ?? undefined} />
        </div>
      </div>
      <div className="st-sec">
        <div className="st-sh">
          <span>Compression</span>
        </div>
        {node.compacted > 0 ? (
          <div data-testid="session-tree-inspector-compression">
            <div className="st-cmpline" data-field="compression">
              <Codicon name="layers" size={12} />
              compacted ×{node.compacted} — {node.compacted} earlier segment{node.compacted > 1 ? 's' : ''}
            </div>
            <div className="st-segs">
              {Array.from({ length: node.compacted + 1 }, (_, index) => (
                <i key={index} className={index === node.compacted ? 'is-current' : undefined} />
              ))}
            </div>
            {segments && (
              <div className="st-seglist">
                {segments.map((segment, index) => (
                  <div key={segment}>
                    <span>{index === segments.length - 1 ? 'Current segment' : `Segment ${index + 1}`}</span>
                    <span className="st-mono">{segment}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="st-none" data-field="compression">
            Not compacted · single segment
          </div>
        )}
      </div>
      <div className="st-sec">
        <div className="st-sh">
          <span>Lineage</span>
        </div>
        {parent && <NodeLink {...linkProps} id={parent} relation="parent" />}
        {from && <NodeLink {...linkProps} id={from} relation="cont. from" />}
        {continuedAs.map(id => (
          <NodeLink key={id} {...linkProps} id={id} relation="cont. as" />
        ))}
        {!parent && !from && continuedAs.length === 0 && <div className="st-none">Root session · no parent</div>}
      </div>
      <div className="st-sec">
        <div className="st-sh">
          <span>Children</span>
          <span data-field="children-count">{children.length}</span>
        </div>
        {children.map(id => (
          <NodeLink key={id} {...linkProps} id={id} />
        ))}
        {children.length === 0 && <div className="st-none">No branches yet</div>}
      </div>
    </>
  )
}

export function DenseInspector(props: StylePanelProps) {
  const { model, selectedId, statusOf, onSelect, onOpen, nowMs } = props
  const [singlesOpen, setSinglesOpen] = useState(true)
  const node = selectedId ? model.nodeById.get(selectedId) : undefined
  const singles = singlesInScope(model)

  return (
    <aside className="st-insp" data-testid="session-tree-inspector" data-selected-id={node?.id ?? ''}>
      <div className="st-ib">
        {!node && (
          <div className="st-empty" data-testid="session-tree-inspector-empty">
            Select a session to inspect it.
            <br />
            Click a block · double-click opens it in a tab
          </div>
        )}
        {/* Stand-ins and out-of-scope blocks are never selected (R5): only sessions show here. */}
        {node?.kind === 'session' && <SessionDetails {...props} node={node} status={statusOf(node)} />}
      </div>
      <div className={`st-singles${singlesOpen ? '' : ' is-collapsed'}`} data-testid="session-tree-singles">
        <button type="button" className="st-singles-toggle" onClick={() => setSinglesOpen(open => !open)} aria-expanded={singlesOpen}>
          <Codicon name={singlesOpen ? 'chevron-down' : 'chevron-right'} size={12} />
          <b>Singles</b>
          <span data-testid="session-tree-singles-count">{singles.length}</span>· no branches
        </button>
        {singlesOpen && (
          <div className="st-sl">
            {singles.map(single => (
              <NodeLink key={single.id} model={model} id={single.id} onSelect={onSelect} onOpen={onOpen} nowMs={nowMs} />
            ))}
            {singles.length === 0 && <div className="st-none">No singles in this scope</div>}
          </div>
        )}
      </div>
    </aside>
  )
}
