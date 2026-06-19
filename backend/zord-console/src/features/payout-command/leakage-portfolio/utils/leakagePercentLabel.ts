/** API returns leakage_percentage as a 0–1 fraction. */
export function leakagePercentLabel(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return '—'
  const pct = fraction > 1 ? fraction : fraction * 100
  return `${pct.toFixed(2)}%`
}

export function leakagePercentDeltaClass(fraction: number): string {
  const pct = fraction > 1 ? fraction : fraction * 100
  if (pct <= 0) return 'text-slate-700 bg-slate-100 border-slate-300'
  if (pct < 2) return 'text-slate-700 bg-slate-100 border-slate-300'
  if (pct <= 5) return 'text-amber-800 bg-amber-50 border-amber-200'
  return 'text-red-800 bg-red-50 border-red-200'
}
