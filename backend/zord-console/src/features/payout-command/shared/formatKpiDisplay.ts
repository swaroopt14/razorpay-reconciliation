import { fmtInrFromMinorExact } from '../command-center/commandCenterFormat'

/** Literal unavailable marker for priority intelligence surfaces. */
export const KPI_UNAVAILABLE = '-'

export function isKpiValueMissing(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string' && value.trim() === '') return true
  return false
}

export function formatKpiText(value: string | null | undefined): string {
  if (isKpiValueMissing(value)) return KPI_UNAVAILABLE
  return String(value).trim()
}

export function formatKpiCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return KPI_UNAVAILABLE
  return Math.round(value).toLocaleString('en-IN')
}

/** Rate fields from intelligence APIs are 0.0–1.0; values above 1 are treated as already-percent. */
export function formatKpiRatePercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return KPI_UNAVAILABLE
  const pct = value <= 1 ? value * 100 : value
  return `${pct.toFixed(digits)}%`
}

export function formatKpiMoneyMinor(value: number | string | null | undefined): string {
  if (isKpiValueMissing(value)) return KPI_UNAVAILABLE
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return KPI_UNAVAILABLE
  return fmtInrFromMinorExact(n)
}
