/**
 * Some KPI endpoints return ratios in [0..1], others return percent-like [0..100].
 * Normalize to ratio first so UI formatting is stable across deployments.
 */
export function normalizePercentRatio(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  if (value < 0) return 0
  if (value > 1) return Math.min(1, value / 100)
  return value
}

export function formatPercentLabel(
  value: number | null | undefined,
  options?: { digits?: number },
): string {
  const ratio = normalizePercentRatio(value)
  if (ratio == null) return '—'
  const digits = options?.digits ?? 0
  return `${(ratio * 100).toFixed(digits)}%`
}
