/** Dense + inspector: the default style (R1). */
import { mergeLayout } from '../../model/layout.ts'
import { curveRouter } from '../../model/route.ts'
import { GroupLabel } from '../shared.tsx'
import type { StyleDefinition } from '../types.ts'
import { DenseBlock, DenseLink, DenseStandin } from './dense-flow.tsx'
import { DenseInspector } from './inspector.tsx'
import { DENSE_GRID, DENSE_HEIGHT, DENSE_RESET_X, DENSE_WIDTH, denseLayoutSpec, densePorts } from './spec.ts'

export const denseStyle: StyleDefinition = {
  id: 'dense',
  label: 'Dense + inspector',
  nodeTypes: { 'dense-session': DenseBlock, 'dense-standin': DenseStandin, group: GroupLabel },
  nodeType: { session: 'dense-session', standin: 'dense-standin', group: 'group' },
  edgeTypes: { 'dense-link': DenseLink },
  edgeType: 'dense-link',
  nodeSize: { width: DENSE_WIDTH, height: DENSE_HEIGHT },
  layoutSpec: denseLayoutSpec,
  layout: (model, previous, spec) => mergeLayout(previous, model, spec),
  draggable: true,
  savesLayout: true,
  singles: 'inspector-list',
  router: curveRouter,
  ports: densePorts,
  grid: DENSE_GRID,
  resetPortX: DENSE_RESET_X,
  Panel: DenseInspector
}
