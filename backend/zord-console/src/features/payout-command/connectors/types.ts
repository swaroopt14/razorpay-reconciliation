export type RoutingTimeWindow = '24h' | '7d' | '30d'

export type ConnectorType = 'PSP' | 'Bank' | 'Rail'
export type ConnectorStatus = 'Healthy' | 'Stable' | 'Degraded' | 'Risk' | 'Load' | 'Reliable'
export type TrendDirection = 'up' | 'down' | 'flat'
export type RouteRisk = 'Low' | 'Medium' | 'High'
export type RecommendationConfidence = 'High' | 'Medium' | 'Low'

export type ConnectorHealthRow = {
  id: string
  connector: string
  type: ConnectorType
  successPct: number
  avgTimeSec: number
  failurePct: number
  status: ConnectorStatus
  trend: TrendDirection
  recommendedAction: string
  volumeMinor: number
  moneyAtRiskMinor: number
  preventableLeakageMinor: number
}

export type RouteRecommendationInput = {
  id: string
  psp: string
  rail: string
  bank: string
  successRatePct: number
  avgTimeSec: number
  risk: RouteRisk
  leakageSavingsMinor: number
  bestForHighValue?: boolean
  sampleSize: number
  stabilityScore: number
  failureTrendPenalty: number
  missingSignals: number
}

export type RouteRecommendation = RouteRecommendationInput & {
  latencyScore: number
  normalizedSuccess: number
  normalizedStability: number
  normalizedPenalty: number
  score: number
  confidence: RecommendationConfidence
}

export type CorrelationInsight = {
  id: string
  text: string
}

export type ActionRecommendation = {
  id: string
  title: string
  /** Current exposure (amount at stake) in minor units. */
  impactMinor: number
  /** Preventable share of the exposure in minor units (confidence-scaled). */
  preventableMinor?: number
  impactLabel: string
}

export type ConnectorFailureBreakdown = {
  reason: string
  pct: number
}

export type ConnectorDrilldown = {
  connectorId: string
  successTrend7d: Array<{ day: string; successPct: number }>
  topFailures: ConnectorFailureBreakdown[]
  bestPairings: string[]
  weakPairings: string[]
  suggested: string
}

export type LeakageCompositionSlice = {
  key: string
  label: string
  amountMinor: number
}

/** Raw leakage / recommendation totals from intelligence APIs (no connector allocation). */
export type RoutingApiTotals = {
  totalIntendedMinor: number
  moneyAtRiskMinor: number
  preventableLeakageMinor: number
}

export type RoutingKpiSnapshot = {
  generatedAtIso: string
  staleAfterMinutes: number
  /** Direct API totals for hero KPIs — avoids summed/rounded connector shares. */
  apiTotals?: RoutingApiTotals
  /** A9 decision success rate from patterns dashboard (0–100). */
  patternsDecisionSuccessRate?: number
  connectors: ConnectorHealthRow[]
  routeCandidates: RouteRecommendationInput[]
  correlationInsights: CorrelationInsight[]
  actionRecommendations: ActionRecommendation[]
  leakageComposition: LeakageCompositionSlice[]
  networkHealthTrend: Array<{ label: string; successPct: number; latencyIndex: number }>
  drilldowns: ConnectorDrilldown[]
}
