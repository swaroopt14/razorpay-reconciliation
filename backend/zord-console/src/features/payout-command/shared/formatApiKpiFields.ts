import { fmtInrFromMinorExact, parseMinorField } from '../command-center/commandCenterFormat'

export { formatKpiMoneyMinor } from './formatKpiDisplay'

/** Display API scalar as-is — no client-side math or unit conversion. */
export function displayApiField(value: string | number | null | undefined, loading?: boolean): string {
  if (loading) return '…'
  if (value == null || String(value).trim() === '') return '—'
  return String(value).trim()
}

/** Format minor amount from API — no computation. */
export function formatApiMinorField(value: string | number | null | undefined, loading?: boolean): string {
  if (loading) return '…'
  if (value == null || String(value).trim() === '') return '—'
  const parsed = parseMinorField(value)
  return parsed != null ? fmtInrFromMinorExact(parsed) : '—'
}

/** Format count from API. */
export function formatApiCount(value: number | null | undefined, loading?: boolean): string {
  if (loading) return '…'
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-IN').format(Math.round(value))
}

/** Format percentage from API (already 0–100 or 0–1 — pass asApiRatio if 0–1). */
export function formatApiPct(
  value: number | null | undefined,
  loading?: boolean,
  asApiRatio = false,
): string {
  if (loading) return '…'
  if (value == null || Number.isNaN(value)) return '—'
  const pct = asApiRatio ? value * 100 : value
  return `${Math.round(pct * 10) / 10}%`
}

/** Format leakage_percentage from API (0–1 fraction → display %). Only rate field that uses ×100. */
export function formatLeakageApiPct(value: number | null | undefined, loading?: boolean): string {
  return formatApiPct(value, loading, true)
}
