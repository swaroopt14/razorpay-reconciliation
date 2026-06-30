import { getLiveRoutingSnapshot } from './liveRoutingDataAdapter'
import type { RoutingKpiSnapshot, RoutingTimeWindow } from './types'

export type RoutingIntelligenceAdapter = {
  getSnapshot: (window: RoutingTimeWindow) => Promise<RoutingKpiSnapshot | null>
}

const liveAdapter: RoutingIntelligenceAdapter = {
  getSnapshot(window) {
    return getLiveRoutingSnapshot(window)
  },
}

export function getRoutingIntelligenceAdapter(): RoutingIntelligenceAdapter {
  return liveAdapter
}
