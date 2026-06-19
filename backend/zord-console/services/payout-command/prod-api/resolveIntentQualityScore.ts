/** Normalize intent-engine numeric score fields (number or numeric string). */
export function readApiScore(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Per-row Quality column — `intent_quality_score` only (no fallbacks). */
export function readIntentQualityScore(item: { intent_quality_score?: unknown }): number | null {
  return readApiScore(item.intent_quality_score)
}
