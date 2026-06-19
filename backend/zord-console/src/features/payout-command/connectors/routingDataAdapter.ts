import { getLiveRoutingSnapshot } from './liveRoutingDataAdapter'
import type { RoutingKpiSnapshot, RoutingTimeWindow } from './types'

export type RoutingIntelligenceAdapter = {
  getSnapshot: (window: RoutingTimeWindow) => Promise<RoutingKpiSnapshot | null>
}

const liveAdapter: RoutingIntelligenceAdapter = {
  async getSnapshot(window) {
    try {
      return await getLiveRoutingSnapshot(window)
    } catch {
      return null
    }
  },
}

export function getRoutingIntelligenceAdapter(): RoutingIntelligenceAdapter {
  return liveAdapter
}
