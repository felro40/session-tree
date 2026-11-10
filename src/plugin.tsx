/**
 * Session Tree — desktop half entry. Built by `npm run build` into
 * `desktop/plugin.js`; the module only defines things, all wiring happens in
 * `register(ctx)` so a hot reload re-evaluates cleanly.
 */
import { host, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'
import type { HermesPlugin, PluginContext } from '@hermes/plugin-sdk'
import flowCss from '@xyflow/react/dist/base.css'

import { SessionTreePage } from './page/session-tree-page.tsx'
import { createServices } from './page/services.ts'
import { SettingsPage } from './settings/settings-page.tsx'
import pluginCss from './styles.css'

export const PLUGIN_ID = 'session-tree'
export const ROUTE_PATH = '/session-tree'

/** Third-party + own CSS as one `<style>` element, removed on dispose. */
function injectStyles(ctx: PluginContext): void {
  const style = document.createElement('style')

  style.dataset.sessionTree = 'styles'
  style.textContent = `${flowCss}\n${pluginCss}`
  document.head.appendChild(style)
  ctx.onDispose(() => style.remove())
}

const plugin: HermesPlugin = {
  id: PLUGIN_ID,
  name: 'Session Tree',
  description: 'Your chat sessions as an interactive graph of how they branched.',
  register(ctx) {
    injectStyles(ctx)

    // The synced layout store and this device's preferences, shared by the page and its
    // settings page (push, poll and timers through ctx.*: a reload retires them).
    const services = createServices(ctx)

    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: ROUTE_PATH },
        render: () => <SessionTreePage ctx={ctx} services={services} />
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        data: { path: ROUTE_PATH, label: 'Session Tree', codicon: 'type-hierarchy' }
      },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: 'session-tree.open',
          label: 'Open Session Tree',
          keywords: ['session', 'tree', 'graph', 'branches'],
          run: () => host.navigate(ROUTE_PATH)
        }
      }
    ])

    ctx.registerSettingsPage?.({
      id: 'settings',
      title: 'Session Tree',
      icon: 'type-hierarchy',
      render: () => <SettingsPage services={services} />
    })
  }
}

export default plugin
