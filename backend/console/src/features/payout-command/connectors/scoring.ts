import type {
  RecommendationConfidence,
  RouteRecommendation,
  RouteRecommendationInput,
} from './types'

const SCORE_WEIGHTS = {
  success: 0.45,
  latency: 0.2,
  stability: 0.2,
  failurePenalty: 0.15,
} as const

function clampTo100(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function latencyToScore(avgTimeSec: number): number {
  // <=2s is excellent; >=6s is poor.
  const score = ((6 - avgTimeSec) / 4) * 100
  return clampTo100(score)
}

function toConfidence(route: RouteRecommendationInput): RecommendationConfidence {
  if (route.sampleSize < 3000 || route.missingSignals > 1) return 'Low'
  if (route.sampleSize < 8000 || route.missingSignals > 0 || route.stabilityScore < 78) return 'Medium'
  return 'High'
}

export function scoreRoute(route: RouteRecommendationInput): RouteRecommendation {
  const normalizedSuccess = clampTo100(route.successRatePct)
  const latencyScore = latencyToScore(route.avgTimeSec)
  const normalizedStability = clampTo100(route.stabilityScore)
  const normalizedPenalty = clampTo100(route.failureTrendPenalty)
  const score =
    SCORE_WEIGHTS.success * normalizedSuccess +
    SCORE_WEIGHTS.latency * latencyScore +
    SCORE_WEIGHTS.stability * normalizedStability -
    SCORE_WEIGHTS.failurePenalty * normalizedPenalty

  return {
    ...route,
    normalizedSuccess,
    latencyScore,
    normalizedStability,
    normalizedPenalty,
    score: Number(score.toFixed(2)),
    confidence: toConfidence(route),
  }
}

export function rankRoutes(routes: RouteRecommendationInput[]): RouteRecommendation[] {
  return routes
    .map(scoreRoute)
    .sort((a, b) => b.score - a.score)
}
