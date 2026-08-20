/**
 * CON-P0-11 — Intent Journal money is always stored as minor units (paise for INR)
 * plus currency. Service 2 major amounts are converted exactly once at the adapter.
 */

export type JournalMoney = {
  amountMinor: number
  currency: string
}

export const JOURNAL_DEFAULT_CURRENCY = 'INR'

/** High-value sidebar filter threshold: ₹15,00,000 in minor units. */
export const JOURNAL_HIGH_VALUE_MINOR = 150_000_000

export function normalizeJournalCurrency(currency?: string | null): string {
  const cur = (currency || JOURNAL_DEFAULT_CURRENCY).trim().toUpperCase()
  return /^[A-Z]{3}$/.test(cur) ? cur : JOURNAL_DEFAULT_CURRENCY
}

export function journalMoney(amountMinor: number, currency?: string | null): JournalMoney {
  const minor = Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0
  return { amountMinor: minor, currency: normalizeJournalCurrency(currency) }
}

/**
 * Convert major INR (or other 2-decimal currency) to minor units without float drift.
 * Example: 1234.56 → 123456
 */
export function majorAmountToMinor(major: number | string | null | undefined): number {
  if (major == null || major === '') return 0
  const n = typeof major === 'number' ? major : Number.parseFloat(String(major).replace(/,/g, ''))
  if (!Number.isFinite(n)) return 0
  const neg = n < 0
  const [intRaw, fracRaw = ''] = String(Math.abs(n)).split('.')
  const intPart = Number.parseInt(intRaw, 10)
  if (!Number.isFinite(intPart)) return 0
  const frac2 = `${fracRaw}00`.slice(0, 2)
  const fracPart = Number.parseInt(frac2, 10) || 0
  const minor = intPart * 100 + fracPart
  return neg ? -minor : minor
}

/** Parse an already-minor amount field (Service 7 `*_minor`). */
export function parseMinorAmountField(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

/**
 * Prefer `total_amount_minor` when present; otherwise convert Service 2 `total_amount`
 * (major INR) exactly once.
 */
export function resolveBatchTotalAmountMinor(item: {
  total_amount_minor?: number | string | null
  total_amount?: number | string | null
}): number {
  if (item.total_amount_minor != null && item.total_amount_minor !== '') {
    return parseMinorAmountField(item.total_amount_minor)
  }
  return majorAmountToMinor(item.total_amount)
}

/** Format journal batch money for KPI / hero display (minor → ₹). */
export function formatJournalMoneyFromMinor(
  amountMinor: number | null | undefined,
  currency: string = JOURNAL_DEFAULT_CURRENCY,
): string {
  if (amountMinor == null || !Number.isFinite(amountMinor)) return '—'
  const cur = normalizeJournalCurrency(currency)
  const major = amountMinor / 100
  const locale = cur === 'INR' ? 'en-IN' : 'en-US'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major)
  } catch {
    return `${cur} ${major.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}
