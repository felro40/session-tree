/**
 * The canvas toolbar, shared by every style: scope (All projects + the projects from
 * `projects.tree`, with colour and icon), profile filter, Show all, Show archived, Snap, the
 * zoom controls (−, %, +, Fit) and Re-arrange.
 *
 * At a narrow page width (a split view) it never squeezes its items: the scope strip moves to
 * its own line, then the brand and the tools show icons only, then the tools get a line of their
 * own (`toolbar-layout.ts`). The layout is measured and applied straight to the DOM
 * (`data-layout`, `data-brand`, `data-tools`, the strip's `data-fade`), so a resize re-renders
 * nothing. It measures in CSS px, also under Hermes' UI scale (`cssScale`).
 */
import { Codicon } from '@hermes/plugin-sdk'
import { useReactFlow, useViewport } from '@xyflow/react'
import { useLayoutEffect, useRef } from 'react'
import type { MouseEvent, ReactNode, WheelEvent } from 'react'

import { ALL_PROFILES, ALL_PROJECTS } from '../model/graph.ts'
import type { ProjectInfo } from '../model/projects.ts'
import { ProjectGlyph } from '../styles/shared.tsx'
import { barLayout, cssScale, fadeEdges, revealBy, wheelScroll } from './toolbar-layout.ts'
import type { BarMeasure, Sized } from './toolbar-layout.ts'

/** Toolbar buttons never take focus, so Space (pan, R3) cannot click the last-used button. */
const noFocus = (event: MouseEvent) => event.preventDefault()

/** A tool's or the brand's text: hidden when the bar is short of room (the tooltip keeps the name). */
const Label = ({ children }: { children: ReactNode }) => <span className="st-label">{children}</span>

/** How far the selected chip stays clear of the strip's ends (the fade is 18 px). */
const REVEAL_PAD = 12

const px = (value: string) => Number.parseFloat(value) || 0

/** An element's width in CSS px (client rects are zoomed under Hermes' UI scale). */
type WidthOf = (element: Element) => number

/** The element's effective CSS zoom: the engine's own, else the product of its ancestors'. */
function zoomOf(element: HTMLElement): number {
  const own = (element as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom

  if (typeof own === 'number' && own > 0) {
    return own
  }

  let zoom = 1

  for (let node: Element | null = element; node; node = node.parentElement) {
    const value = Number.parseFloat(getComputedStyle(node).zoom)

    if (value > 0) {
      zoom *= value
    }
  }

  return zoom
}

/** The factor from CSS px to client-rect px at `element` (`cssScale`). */
const rectScaleOf = (element: HTMLElement) => cssScale(element.getBoundingClientRect().width, element.offsetWidth, zoomOf(element))

/** A group's content width: its items, their margins and the gaps (not the line it may fill). */
function contentWidth(group: Element, width: WidthOf): number {
  const items = [...group.children]
  const gaps = Math.max(0, items.length - 1) * px(getComputedStyle(group).columnGap)

  return items.reduce((sum, item) => {
    const style = getComputedStyle(item)

    return sum + width(item) + px(style.marginLeft) + px(style.marginRight)
  }, gaps)
}

/** An item's width with its text and with its icon only, whether its text is shown now or not. */
function sized(item: Element, shown: number, textShown: boolean, width: WidthOf): Sized {
  // A label adds its width and the gap before it; a hidden one is out of the flow (still laid out).
  const text = [...item.querySelectorAll('.st-label')].reduce(
    (sum, label) => sum + width(label) + px(getComputedStyle(label.parentElement!).columnGap),
    0
  )

  return textShown ? { full: shown, icon: shown - text } : { full: shown + text, icon: shown }
}

interface BarParts {
  bar: HTMLElement
  brand: HTMLElement
  pickers: HTMLElement[]
  tools: HTMLElement
  strip: HTMLElement
}

/** The bar's items at their widths (CSS px), whatever layout is shown now. */
function measureBar({ bar, brand, pickers, tools, strip }: BarParts): BarMeasure {
  // One space: rect widths are divided by the UI scale, the computed lengths are CSS px already
  // (review t_899e3936 B1), and the room is the bar's fractional width, not the rounded clientWidth (N1).
  const scale = rectScaleOf(bar)
  const width: WidthOf = element => element.getBoundingClientRect().width / scale
  const style = getComputedStyle(bar)
  const stripStyle = getComputedStyle(strip)
  const chips = [...strip.children]
  const scope =
    chips.reduce((sum, chip) => sum + width(chip), 0) +
    Math.max(0, chips.length - 1) * px(stripStyle.columnGap) +
    px(stripStyle.paddingLeft) + px(stripStyle.paddingRight) + px(stripStyle.borderLeftWidth) + px(stripStyle.borderRightWidth)

  return {
    room: width(bar) - px(style.borderLeftWidth) - px(style.borderRightWidth) - px(style.paddingLeft) - px(style.paddingRight),
    gap: px(style.columnGap),
    brand: sized(brand, width(brand), bar.dataset.brand !== 'icon', width),
    pickers: pickers.map(width),
    tools: sized(tools, contentWidth(tools, width), bar.dataset.tools !== 'icons', width),
    scope
  }
}

function applyFade(strip: HTMLElement): void {
  const fade = fadeEdges(strip.scrollLeft, strip.clientWidth, strip.scrollWidth)

  if (fade) {
    strip.dataset.fade = fade
  } else {
    delete strip.dataset.fade
  }
}

/** Scrolls the strip (never the page) so the selected chip is in view. */
function revealSelected(strip: HTMLElement): void {
  const chip = strip.querySelector('[aria-checked="true"]')

  if (chip && strip.scrollWidth > strip.clientWidth) {
    // The rects are zoomed under the UI scale; scrollLeft is in CSS px.
    const scale = rectScaleOf(strip)
    const by = revealBy(strip.getBoundingClientRect(), chip.getBoundingClientRect(), REVEAL_PAD * scale) / scale

    if (by !== 0) {
      strip.scrollLeft += by
    }
  }

  applyFade(strip)
}

const setFlag = (element: HTMLElement, key: string, value: string | undefined) => {
  if (value === undefined) {
    delete element.dataset[key]
  } else {
    element.dataset[key] = value
  }
}

/** Applies the layout for the bar's width now; on a change of layout or width, reveals the chip. */
function layoutBar(parts: BarParts, resized: boolean): void {
  const { bar, strip } = parts
  const layout = barLayout(measureBar(parts))
  const before = `${bar.dataset.layout}|${bar.dataset.brand}|${bar.dataset.tools}`

  bar.dataset.layout = layout.lines
  setFlag(bar, 'brand', layout.brandText ? undefined : 'icon')
  setFlag(bar, 'tools', layout.toolText ? undefined : 'icons')

  if (resized || before !== `${bar.dataset.layout}|${bar.dataset.brand}|${bar.dataset.tools}`) {
    revealSelected(strip)
  } else {
    applyFade(strip)
  }
}

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
  /** Re-arrange exists only for a style that saves positions (not Swimlanes, R12). */
  canRearrange?: boolean
  /** Set when the style has no dragging: Snap shows disabled with this tooltip. */
  snapUnavailable?: string
  singlesCount: number
  /** R18 quick switcher: the registered styles and the one shown. */
  styles: { id: string; label: string }[]
  styleId: string
  /** Where the shown style comes from: this device's override, or the synced choice. */
  styleSource: 'device' | 'synced'
  onStyle(id: string): void
  /** The style's side panel (Dense: the inspector), open or closed on this device. */
  hasPanel: boolean
  panelOpen: boolean
  onPanel(open: boolean): void
}

export const ZOOM_STEP = 1.2

export function Toolbar(props: ToolbarProps) {
  const { zoomTo, getZoom } = useReactFlow()
  const { zoom } = useViewport()
  const clamp = (value: number) => Math.min(props.maxZoom, Math.max(props.minZoom, value))
  const scoped = props.projects.filter(project => project.sessionIds.length > 0 || project.id === props.scope)
  const barRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  // What the bar holds: a change re-measures it and re-attaches the observer to the new items.
  const contents = [
    scoped.map(project => `${project.id}\u0000${project.label}`).join('\u0001'),
    props.profiles.join('\u0001'),
    props.styles.map(style => style.label).join('\u0001'),
    props.canRearrange !== false,
    props.hasPanel,
    Boolean(props.snapUnavailable)
  ].join('\u0002')

  useLayoutEffect(() => {
    const bar = barRef.current
    const strip = stripRef.current
    const brand = bar?.querySelector<HTMLElement>(':scope > .st-brand')
    const tools = bar?.querySelector<HTMLElement>(':scope > .st-tools')

    if (!bar || !strip || !brand || !tools) {
      return
    }

    const parts: BarParts = { bar, brand, pickers: [...bar.querySelectorAll<HTMLElement>(':scope > .st-profile')], tools, strip }
    let width = bar.clientWidth
    let live = true

    layoutBar(parts, true)
    // Only elements whose size no layout changes: the page (its width) and the bar's own content
    // (labels, pickers, icons, chips, the zoom %), so applying a layout never re-triggers it.
    const observer = new ResizeObserver(() => {
      const now = bar.clientWidth

      layoutBar(parts, now !== width)
      width = now
    })

    observer.observe(bar.parentElement ?? bar)

    for (const element of bar.querySelectorAll('.st-label, .st-profile, .codicon, .st-scope > button, [data-testid="session-tree-zoom"]')) {
      observer.observe(element)
    }

    // The fonts (codicons, the UI font) may land after the first measure.
    void document.fonts?.ready.then(() => {
      if (live) {
        layoutBar(parts, false)
      }
    })

    return () => {
      live = false
      observer.disconnect()
    }
  }, [contents])

  useLayoutEffect(() => {
    if (stripRef.current) {
      revealSelected(stripRef.current)
    }
  }, [props.scope])

  const onStripWheel = (event: WheelEvent<HTMLDivElement>) => {
    const strip = event.currentTarget
    const by = wheelScroll(event.deltaX, event.deltaY, event.deltaMode, strip.clientWidth, event.shiftKey)

    if (by !== 0 && strip.scrollWidth > strip.clientWidth) {
      strip.scrollLeft += by
    }
  }

  return (
    <div className="st-bar" data-testid="session-tree-toolbar" ref={barRef}>
      <span className="st-brand" title="Session tree">
        <Codicon name="type-hierarchy" size={14} />
        <Label>Session tree</Label>
      </span>
      <div className="st-scope-slot">
        <div
          className="st-scope"
          role="radiogroup"
          aria-label="Project scope"
          data-testid="session-tree-scope"
          ref={stripRef}
          onWheel={onStripWheel}
          onScroll={event => applyFade(event.currentTarget)}
        >
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
      <label
        className="st-profile st-style"
        title={props.styleSource === 'device' ? 'View style (this device only — Settings → Plugins → Session Tree)' : 'View style (synced to every device)'}
      >
        <Codicon name="layout" size={12} />
        <select
          data-testid="session-tree-style"
          data-source={props.styleSource}
          aria-label="View style"
          value={props.styleId}
          onChange={event => {
            // Like the profile select: hand the keyboard back so Space pans (R3).
            event.currentTarget.blur()
            props.onStyle(event.target.value)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.currentTarget.blur()
            }
          }}
        >
          {props.styles.map(style => (
            <option key={style.id} value={style.id}>
              {style.label}
            </option>
          ))}
        </select>
      </label>
      {/* The tools: one unit that moves onto its own line when the bar is narrow; each group
          stays whole. */}
      <div className="st-tools">
        <span className="st-tool-group">
          <ToolButton
            testId="session-tree-show-all"
            title={`Show all: put the ${props.singlesCount} sessions without branches on the canvas`}
            pressed={props.showAll}
            onClick={() => props.onShowAll(!props.showAll)}
          >
            <Codicon name="list-flat" size={13} />
            <Label>Show all</Label>
          </ToolButton>
          <ToolButton
            testId="session-tree-show-archived"
            title="Show archived"
            pressed={props.showArchived}
            onClick={() => props.onShowArchived(!props.showArchived)}
          >
            <Codicon name="archive" size={13} />
            <Label>Archived</Label>
          </ToolButton>
          {props.canRearrange !== false && (
            <ToolButton testId="session-tree-rearrange" title="Re-arrange (reset this layout)" onClick={props.onRearrange}>
              <Codicon name="refresh" size={13} />
            </ToolButton>
          )}
        </span>
        <span className="st-sep" />
        {props.snapUnavailable ? (
          // R12 (Swimlanes): no dragging, so no snapping; the toggle stays visible, disabled, with why.
          <span className="st-tb-wrap" title={props.snapUnavailable} data-testid="session-tree-snap-wrap">
            <button
              type="button"
              className="st-tb is-disabled"
              data-testid="session-tree-snap"
              title={props.snapUnavailable}
              aria-label={`Snap to grid — ${props.snapUnavailable}`}
              aria-disabled="true"
              disabled
              onMouseDown={noFocus}
            >
              <Codicon name="symbol-numeric" size={13} />
              <Label>Snap</Label>
            </button>
          </span>
        ) : (
          <ToolButton
            testId="session-tree-snap"
            title={`Snap to grid (${props.snap ? 'on' : 'off'})`}
            pressed={props.snap}
            onClick={() => props.onSnap(!props.snap)}
          >
            <Codicon name="symbol-numeric" size={13} />
            <Label>Snap</Label>
          </ToolButton>
        )}
        <span className="st-sep" />
        <span className="st-tool-group">
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
            <Label>Fit</Label>
          </ToolButton>
        </span>
        {props.hasPanel && (
          <>
            <span className="st-sep" />
            <ToolButton
              testId="session-tree-panel"
              title={props.panelOpen ? 'Hide the side panel' : 'Show the side panel'}
              pressed={props.panelOpen}
              onClick={() => props.onPanel(!props.panelOpen)}
            >
              <Codicon name="layout-sidebar-right" size={13} />
            </ToolButton>
          </>
        )}
      </div>
    </div>
  )
}
