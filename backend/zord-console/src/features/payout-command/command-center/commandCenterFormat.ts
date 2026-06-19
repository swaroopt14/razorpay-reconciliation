/** Full INR with Indian digit grouping — never L/Cr/K abbreviations. */
export type FmtInrFullOptions = {
  /** 0 = whole rupees (KPI heroes); 2 = paise preserved (table rows). */
  decimals?: 0 | 2
}

export function fmtInrFull(
  amount: number | null | undefined,
  options: FmtInrFullOptions = {},
): string {
  const { decimals = 0 } = options
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'
  if (amount === 0) return decimals === 2 ? '₹0.00' : '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

/** Paise/minor → whole rupees for display. */
export function minorToRupees(minor: number | null | undefined): number | null {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return null
  return minor / 100
}

/** Format intelligence / trend minor-unit fields as INR. */
export function fmtInrFromMinor(
  minor: number | null | undefined,
  options: FmtInrFullOptions = {},
): string {
  const rupees = minorToRupees(minor)
  if (rupees === null) return '—'
  return fmtInrFull(rupees, options)
}

/**
 * Displays the amount EXACTLY as returned by the backend — NO calculation.
 * The value is shown as-is (no ÷100 paise→rupee conversion, no rounding); we
 * only add the ₹ symbol and Indian digit grouping for readability and keep
 * the decimals exactly as the API sent them.
 *
 * Example: backend `527228.11` → "₹5,27,228.11" (value untouched).
 *
 * Float-safe: we read the digits from `String(value)`, which round-trips the
 * parsed number exactly, instead of doing any arithmetic.
 */
export function fmtInrFromMinorExact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const neg = value < 0
  const [intRaw, fracRaw = ''] = String(Math.abs(value)).split('.')
  const grouped = Number(intRaw).toLocaleString('en-IN')
  return `${neg ? '-' : ''}₹${grouped}${fracRaw ? `.${fracRaw}` : ''}`
}

/** Chart Y-axis: minor units → thousands of rupees (₹50k → 50). */
export function chartThousandsFromMinor(minor: number): number {
  if (!Number.isFinite(minor) || minor <= 0) return 0
  return minor / 100_000
}

/** @deprecated Use fmtInrFull — kept as alias to prevent L/Cr regressions. */
export function fmtInrCompact(minor: number | null): string {
  return fmtInrFull(minor, { decimals: 0 })
}

export function parseMinorField(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatLastUpdated(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
