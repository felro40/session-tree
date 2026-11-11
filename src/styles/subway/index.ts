/**
 * Subway map (R1, card 7; mockup `variants/subway-map/`): every conversation lineage a thick
 * coloured line, every session a station, a `/branch` the line splitting into a new track.
 * Draggable with saved positions (R12, R16: its own layouts), octilinear tracks (straight while a
 * station is dragged, octilinear with the R13 detour on drop), singles in the bottom depot (R8),
 * a map key in the corner.
 */
import { octilinearRouter } from '../../model/route.ts'
import { GroupLabel } from '../shared.tsx'
import type { StyleDefinition } from '../types.ts'
import { SubwayProvider } from './context.tsx'
import { SubwayLayer } from './layer.tsx'
import { layoutSubway } from './layout.ts'
import { subwaySlots } from './plan.ts'
import { STATION_H, STATION_W, SUBWAY_GRID, subwayLayoutSpec, subwayPorts } from './spec.ts'
import { SubwayLink, SubwayStandin, SubwayStation } from './subway-flow.tsx'

export const subwayStyle: StyleDefinition = {
  id: 'subway',
  label: 'Subway map',
  nodeTypes: { 'subway-station': SubwayStation, 'subway-standin': SubwayStandin, group: GroupLabel },
  nodeType: { session: 'subway-station', standin: 'subway-standin', group: 'group' },
  edgeTypes: { 'subway-link': SubwayLink },
  edgeType: 'subway-link',
  nodeSize: { width: STATION_W, height: STATION_H },
  layoutSpec: subwayLayoutSpec,
  layout: layoutSubway,
  draggable: true,
  savesLayout: true,
  singles: 'depot',
  router: octilinearRouter,
  ports: subwayPorts,
  linkSlots: subwaySlots,
  grid: SUBWAY_GRID,
  resetPortX: STATION_W / 2,
  Provider: SubwayProvider,
  Layer: SubwayLayer,
  // Room for the station labels above the top row, the map key and the depot below.
  fitPadding: { top: '70px', right: '40px', bottom: '120px', left: '40px' }
}
