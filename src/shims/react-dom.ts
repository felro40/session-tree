/**
 * `react-dom` stand-in for the bundle (pre-check 1, path (a)).
 *
 * The plugin loader only lets a disk plugin import `@hermes/plugin-sdk`,
 * `react` and `react/jsx-runtime`, but `@xyflow/react` imports `createPortal`
 * from `react-dom` (EdgeLabelRenderer, ViewportPortal, NodeToolbar). esbuild
 * aliases `react-dom` to this file.
 *
 * A portal is plain data: `react-dom`'s `createPortal` only builds a
 * `{ $$typeof: Symbol.for('react.portal'), key, children, containerInfo }`
 * element, and the reconciler that mounts it is the HOST's react-dom, which
 * renders this plugin's tree anyway. So returning the same element shape here
 * hands the portal to the host renderer unchanged. Mirrors React 19.3's
 * `createPortal` (react-dom/cjs/react-dom.development.js), without the dev
 * key-coercion warning.
 */
import type { ReactNode, ReactPortal } from 'react'

const REACT_PORTAL_TYPE = Symbol.for('react.portal')

export function createPortal(
  children: ReactNode,
  container: Element | DocumentFragment,
  key?: null | string
): ReactPortal {
  if (!container || (container.nodeType !== 1 && container.nodeType !== 9 && container.nodeType !== 11)) {
    throw new Error('Target container is not a DOM element.')
  }

  return {
    $$typeof: REACT_PORTAL_TYPE,
    key: key == null ? null : String(key),
    children,
    containerInfo: container,
    implementation: null
  } as unknown as ReactPortal
}

/** Anything else `react-dom` exports is not used by the bundled code; the
 *  static guard test proves no other import of this module survives. */
export default { createPortal }
