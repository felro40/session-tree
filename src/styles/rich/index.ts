/**
 * Rich cards (R1, card 6; mockup `variants/rich-cards/`): content-first 280 px cards in top-down
 * trees, draggable with saved positions (R12, R16: its own layouts, separate from Dense's), soft
 * curved links with the R13 detour on drop, singles in a right slide-out drawer (R8). The card's
 * excerpt and activity come from the backend's details endpoint, fetched for the cards near the
 * viewport (`context.tsx`, `layer.tsx`).
 */
import { curveRouter } from '../../model/route.ts'
import { GroupLabel } from '../shared.tsx'
import type { StyleDefinition } from '../types.ts'
import { RichProvider } from './context.tsx'
import { RichLayer } from './layer.tsx'
import { layoutRich } from './layout.ts'
import { RichCard, RichLink, RichStandin } from './rich-flow.tsx'
import { RICH_GRID, RICH_HEIGHT, RICH_RESET_X, RICH_WIDTH, richLayoutSpec, richPorts } from './spec.ts'

export const richStyle: StyleDefinition = {
  id: 'rich',
  label: 'Rich cards',
  nodeTypes: { 'rich-session': RichCard, 'rich-standin': RichStandin, group: GroupLabel },
  nodeType: { session: 'rich-session', standin: 'rich-standin', group: 'group' },
  edgeTypes: { 'rich-link': RichLink },
  edgeType: 'rich-link',
  nodeSize: { width: RICH_WIDTH, height: RICH_HEIGHT },
  layoutSpec: richLayoutSpec,
  layout: layoutRich,
  draggable: true,
  savesLayout: true,
  singles: 'drawer',
  router: curveRouter,
  ports: richPorts,
  grid: RICH_GRID,
  resetPortX: RICH_RESET_X,
  Provider: RichProvider,
  Layer: RichLayer,
  // The mockup opens with the drawer closed behind its grip.
  panelDefaultOpen: false
}
