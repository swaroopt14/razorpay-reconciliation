import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type {
  AmbiguityBubbleMapBatch,
  AmbiguityBubbleMapResolved,
  AmbiguityVelocityScatterResponse,
  AmbiguityVelocityScatterResolved,
} from '@/services/payout-command/prod-api/ambiguityVelocityTypes'
import { coerceMinor } from '../../leakage-portfolio/utils/formatMinorInr'

export type AmbiguityRiskTier = 'clean' | 'safe' | 'watch' | 'alert' | 'critical'

export type AmbiguityBubblePoint = {
  batchId: string
  amountValueMinor: number
  amountAtRiskMinor: number
  /** (amount_at_risk / amount_value) × 100 */
  riskRatioPct: number
  /** Normalized batch size 0–100 for X axis. */
  sizePct: number
  /** sqrt(amount / max) × 100 for bubble area scaling via Z axis. */
  bubbleSizePct: number
  bubbleColor: string
  riskTier: AmbiguityRiskTier
  riskTierLabel: string
}

export const BUBBLE_MAP_MAX_Z = 100

const COLOR_CLEAN = '#94a3b8'
const COLOR_SAFE = '#22c55e'
const COLOR_WATCH = '#facc15'
const COLOR_ALERT = '#fb923c'
const COLOR_CRITICAL = '#ef4444'

export function riskTierFromRatio(ratio: number): {
  tier: AmbiguityRiskTier
  color: string
  label: string
} {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { tier: 'clean', color: COLOR_CLEAN, label: 'Clean (0%)' }
  }
  if (ratio <= 2) return { tier: 'safe', color: COLOR_SAFE, label: 'Safe (≤2%)' }
  if (ratio <= 5) return { tier: 'watch', color: COLOR_WATCH, label: 'Watch (2–5%)' }
  if (ratio <= 10) return { tier: 'alert', color: COLOR_ALERT, label: 'Alert (5–10%)' }
  return { tier: 'critical', color: COLOR_CRITICAL, label: 'Critical (>10%)' }
}

export const AMBIGUITY_BUBBLE_LEGEND = [
  { label: 'Critical (>10%)', color: COLOR_CRITICAL, hint: 'Investigate now' },
  { label: 'Alert (5–10%)', color: COLOR_ALERT, hint: '' },
  { label: 'Watch (2–5%)', color: COLOR_WATCH, hint: '' },
  { label: 'Safe (≤2%)', color: COLOR_SAFE, hint: '' },
  { label: 'Clean (0%)', color: COLOR_CLEAN, hint: 'No at-risk value' },
] as const

export const BUBBLE_MAP_QUADRANTS = [
  { position: 'top-left', title: 'Contained risk', subtitle: 'Small batch · high risk · monitor' },
  { position: 'top-right', title: 'Critical', subtitle: 'Big batch · high risk · investigate now' },
  { position: 'bottom-left', title: 'Ignore', subtitle: 'Small batch · low risk' },
  { position: 'bottom-right', title: 'Healthy large batch', subtitle: 'Big batch · low risk' },
] as const

function riskRatioPct(totalMinor: number, atRiskMinor: number): number {
  if (totalMinor <= 0) return 0
  return Math.min(100, Math.round((atRiskMinor / totalMinor) * 1000) / 10)
}

function bubblePointFromAmounts(
  batchId: string,
  amountValueMinor: number,
  amountAtRiskMinor: number,
  maxAmountMinor: number,
): AmbiguityBubblePoint {
  const safeMax = Math.max(maxAmountMinor, 1)
  const ratio = riskRatioPct(amountValueMinor, amountAtRiskMinor)
  const tier = riskTierFromRatio(ratio)
  const sizeRatio = amountValueMinor / safeMax
  return {
    batchId,
    amountValueMinor,
    amountAtRiskMinor,
    riskRatioPct: ratio,
    sizePct: Math.min(100, Math.max(0, sizeRatio * 100)),
    bubbleSizePct: Math.sqrt(Math.max(0, sizeRatio)) * BUBBLE_MAP_MAX_Z,
    bubbleColor: tier.color,
    riskTier: tier.tier,
    riskTierLabel: tier.label,
  }
}

function isBubbleMapResponse(res: AmbiguityVelocityScatterResponse): res is AmbiguityBubbleMapResolved {
  return (
    isDataAvailable(res) &&
    'batches' in res &&
    Array.isArray((res as AmbiguityBubbleMapResolved).batches)
  )
}

function isTimeseriesResponse(res: AmbiguityVelocityScatterResponse): res is AmbiguityVelocityScatterResolved {
  return (
    isDataAvailable(res) &&
    'points' in res &&
    Array.isArray((res as AmbiguityVelocityScatterResolved).points)
  )
}

function mapBubbleMapBatches(
  batches: AmbiguityBubbleMapBatch[],
  focusBatchId?: string,
): AmbiguityBubblePoint[] {
  const rows = focusBatchId?.trim()
    ? batches.filter((row) => row.batch_id?.trim() === focusBatchId.trim())
    : batches
  if (rows.length === 0) return []

  const maxAmount = Math.max(...rows.map((row) => coerceMinor(row.amount_value)), 1)
  return rows.map((row) =>
    bubblePointFromAmounts(
      row.batch_id?.trim() || '—',
      coerceMinor(row.amount_value),
      coerceMinor(row.amount_at_risk),
      maxAmount,
    ),
  )
}

function mapLegacyTimeseriesPoints(
  res: AmbiguityVelocityScatterResolved,
  focusBatchId?: string,
): AmbiguityBubblePoint[] {
  const rows = res.points.filter((row) => !focusBatchId || row.batch_id?.trim() === focusBatchId.trim())
  if (rows.length === 0) return []

  const maxAmount = Math.max(
    ...rows.map((row) => coerceMinor(row.total_amount_minor)),
    1,
  )

  return rows.map((row) =>
    bubblePointFromAmounts(
      row.batch_id?.trim() || '—',
      coerceMinor(row.total_amount_minor),
      coerceMinor(row.ambiguous_amount_minor),
      maxAmount,
    ),
  )
}

export function mapAmbiguityVelocityScatter(
  res: AmbiguityVelocityScatterResponse | null,
  options: { batchId?: string } = {},
): { points: AmbiguityBubblePoint[]; live: boolean; maxAmountMinor: number } {
  const focusBatchId = options.batchId?.trim()

  if (!res || !isDataAvailable(res)) {
    return { points: [], live: false, maxAmountMinor: 0 }
  }

  if (isBubbleMapResponse(res)) {
    const points = mapBubbleMapBatches(res.batches, focusBatchId)
    const maxAmountMinor = Math.max(...points.map((p) => p.amountValueMinor), 0)
    return points.length > 0 ? { points, live: true, maxAmountMinor } : { points: [], live: false, maxAmountMinor: 0 }
  }

  if (isTimeseriesResponse(res)) {
    const points = mapLegacyTimeseriesPoints(res, focusBatchId)
    const maxAmountMinor = Math.max(...points.map((p) => p.amountValueMinor), 0)
    return points.length > 0 ? { points, live: true, maxAmountMinor } : { points: [], live: false, maxAmountMinor: 0 }
  }

  return { points: [], live: false, maxAmountMinor: 0 }
}

export function batchSizeAxisTicks(maxAmountMinor: number): { value: number; label: string }[] {
  const safeMax = Math.max(maxAmountMinor, 1)
  return [0, 25, 50, 75, 100].map((pct) => ({
    value: pct,
    label: formatInrTick(Math.round((safeMax * pct) / 100)),
  }))
}

function formatInrTick(minor: number): string {
  if (minor >= 10_000_000) return `₹${(minor / 10_000_000).toFixed(1)}Cr`
  if (minor >= 100_000) return `₹${Math.round(minor / 100_000)}L`
  if (minor >= 1_000) return `₹${Math.round(minor / 100)}`
  return minor === 0 ? '₹0' : `₹${(minor / 100).toFixed(0)}`
}

export function bubbleMapSummary(points: AmbiguityBubblePoint[]): {
  batchCount: number
  maxAmountMinor: number
  byTier: { tier: AmbiguityRiskTier; count: number }[]
} {
  const tiers: AmbiguityRiskTier[] = ['critical', 'alert', 'watch', 'safe', 'clean']
  const counts = new Map<AmbiguityRiskTier, number>()
  for (const tier of tiers) counts.set(tier, 0)
  for (const point of points) {
    counts.set(point.riskTier, (counts.get(point.riskTier) ?? 0) + 1)
  }
  return {
    batchCount: points.length,
    maxAmountMinor: Math.max(...points.map((p) => p.amountValueMinor), 0),
    byTier: tiers.map((tier) => ({ tier, count: counts.get(tier) ?? 0 })),
  }
}
