/**
 * The canvas toolbar, shared by every style: scope (All projects + the projects from
 * `projects.tree`, with colour and icon), profile filter, Show all, Show archived, Snap, the
 * zoom controls (−, %, +, Fit) and Re-arrange.
 */
import { Codicon } from '@hermes/plugin-sdk'
import { useReactFlow, useViewport } from '@xyflow/react'
import type { MouseEvent, ReactNode } from 'react'

import { ALL_PROFILES, ALL_PROJECTS } from '../model/graph.ts'
import type { ProjectInfo } from '../model/projects.ts'
import { ProjectGlyph } from '../styles/shared.tsx'

/** Toolbar buttons never take focus, so Space (pan, R3) cannot click the last-used button. */
const noFocus = (event: MouseEvent) => event.preventDefault()

function ToolButton({
  testId,
  title,
  pressed,
  onClick,
  children,
  className
}: {
  testId: string
  title: string
  pressed?: boolean
  onClick(): void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      className={`st-tb${pressed ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      data-testid={testId}
      title={title}
      aria-label={title}
      aria-pressed={pressed === undefined ? undefined : pressed}
      onMouseDown={noFocus}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export interface ToolbarProps {
  projects: ProjectInfo[]
  scope: string
  onScope(scope: string): void
  profiles: string[]
  profile: string
  onProfile(profile: string): void
  showAll: boolean
  onShowAll(on: boolean): void
  showArchived: boolean
  onShowArchived(on: boolean): void
  snap: boolean
  onSnap(on: boolean): void
  minZoom: number
  maxZoom: number
  onFit(): void
  onRearrange(): void
  singlesCount: number
}

export const ZOOM_STEP = 1.2

export function Toolbar(props: ToolbarProps) {
  const { zoomTo, getZoom } = useReactFlow()
  const { zoom } = useViewport()
  const clamp = (value: number) => Math.min(props.maxZoom, Math.max(props.minZoom, value))
  const scoped = props.projects.filter(project => project.sessionIds.length > 0 || project.id === props.scope)

  return (
    <div className="st-bar" data-testid="session-tree-toolbar">
      <span className="st-brand">
        <Codicon name="type-hierarchy" size={14} />
        Session tree
      </span>
      <div className="st-scope" role="radiogroup" aria-label="Project scope" data-testid="session-tree-scope">
        <button
          type="button"
          role="radio"
          aria-checked={props.scope === ALL_PROJECTS}
          className={props.scope === ALL_PROJECTS ? 'is-on' : undefined}
          data-scope={ALL_PROJECTS}
          title="All projects"
          onMouseDown={noFocus}
          onClick={() => props.onScope(ALL_PROJECTS)}
        >
          All
        </button>
        {scoped.map(project => (
          <button
            key={project.id}
            type="button"
            role="radio"
            aria-checked={props.scope === project.id}
            className={props.scope === project.id ? 'is-on' : undefined}
            data-scope={project.id}
            title={`Project: ${project.label}`}
            onMouseDown={noFocus}
            onClick={() => props.onScope(project.id)}
          >
            <ProjectGlyph project={project} size={11} />
            {project.label}
          </button>
        ))}
      </div>
      <label className="st-profile" title="Profile">
        <Codicon name="account" size={12} />
        <select
          data-testid="session-tree-profile"
          aria-label="Profile"
          value={props.profile}
          onChange={event => {
            // Hand the keyboard back: a focused <select> swallows Space, so it would not pan (R3).
            event.currentTarget.blur()
            props.onProfile(event.target.value)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.currentTarget.blur()
            }
          }}
        >
          {props.profiles.map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={ALL_PROFILES}>All profiles</option>
        </select>
      </label>
      <span className="st-spacer" />
      <ToolButton
        testId="session-tree-show-all"
        title={`Show all: put the ${props.singlesCount} sessions without branches on the canvas`}
        pressed={props.showAll}
        onClick={() => props.onShowAll(!props.showAll)}
      >
        <Codicon name="list-flat" size={13} />
        Show all
      </ToolButton>
      <ToolButton
        testId="session-tree-show-archived"
        title="Show archived"
        pressed={props.showArchived}
        onClick={() => props.onShowArchived(!props.showArchived)}
      >
        <Codicon name="archive" size={13} />
        Archived
      </ToolButton>
      <ToolButton testId="session-tree-rearrange" title="Re-arrange (reset this layout)" onClick={props.onRearrange}>
        <Codicon name="refresh" size={13} />
      </ToolButton>
      <span className="st-sep" />
      <ToolButton
        testId="session-tree-snap"
        title={`Snap to grid (${props.snap ? 'on' : 'off'})`}
        pressed={props.snap}
        onClick={() => props.onSnap(!props.snap)}
      >
        <Codicon name="symbol-numeric" size={13} />
        Snap
      </ToolButton>
      <span className="st-sep" />
      <ToolButton testId="session-tree-zoom-out" title="Zoom out" onClick={() => void zoomTo(clamp(getZoom() / ZOOM_STEP))}>
        −
      </ToolButton>
      <ToolButton testId="session-tree-zoom-level" title="Reset to 100%" onClick={() => void zoomTo(1)} className="st-zoom">
        <span data-testid="session-tree-zoom">{Math.round(zoom * 100)}%</span>
      </ToolButton>
      <ToolButton testId="session-tree-zoom-in" title="Zoom in" onClick={() => void zoomTo(clamp(getZoom() * ZOOM_STEP))}>
        +
      </ToolButton>
      <ToolButton testId="session-tree-fit" title="Fit to view" onClick={props.onFit}>
        <Codicon name="screen-full" size={13} />
        Fit
      </ToolButton>
    </div>
  )
}
