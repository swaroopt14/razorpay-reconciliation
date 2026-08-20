/**
 * CON-P0-23 — currency-safe Money model for live console views.
 *
 * Rules:
 * - Missing / invalid currency ⇒ UNKNOWN (never invent INR).
 * - Format with the row's own currency.
 * - Aggregate only within a single currency unless an explicit FX policy exists (none in V1).
 * - Mixed or UNKNOWN currencies block portfolio-style totals.
 */

export const UNKNOWN_CURRENCY = 'UNKNOWN' as const

export type MoneyCurrency = string

/** Major-unit money (journals / tables). */
export type Money = {
  amount: number
  currency: MoneyCurrency
}

/** Minor-unit money (intelligence `*_minor` fields) with required currency. */
export type MoneyMinor = {
  amountMinor: number
  currency: MoneyCurrency
}

export type MoneyAggregateResult =
  | { ok: true; total: Money; byCurrency: Record<string, number> }
  | { ok: false; reason: 'mixed_currency' | 'unknown_currency' | 'empty'; byCurrency: Record<string, number> }

const ISO4217 = /^[A-Z]{3}$/

/** Normalize API currency. Missing/invalid → UNKNOWN (never INR). */
export function normalizeCurrency(currency?: string | null): MoneyCurrency {
  if (currency == null) return UNKNOWN_CURRENCY
  const cur = String(currency).trim().toUpperCase()
  if (!cur || cur === UNKNOWN_CURRENCY) return UNKNOWN_CURRENCY
  if (!ISO4217.test(cur)) return UNKNOWN_CURRENCY
  return cur
}

export function isKnownCurrency(currency?: string | null): boolean {
  return normalizeCurrency(currency) !== UNKNOWN_CURRENCY
}

export function money(amount: number, currency?: string | null): Money {
  const n = Number.isFinite(amount) ? amount : 0
  return { amount: n, currency: normalizeCurrency(currency) }
}

export function moneyMinor(amountMinor: number, currency?: string | null): MoneyMinor {
  const n = Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0
  return { amountMinor: n, currency: normalizeCurrency(currency) }
}

function localeForCurrency(currency: MoneyCurrency): string {
  if (currency === 'INR') return 'en-IN'
  if (currency === UNKNOWN_CURRENCY) return 'en-US'
  return 'en-US'
}

export type FormatMoneyOptions = {
  /** Fraction digits for major-unit display. Default 2. */
  decimals?: 0 | 2
}

/**
 * Format major-unit money. UNKNOWN currency never renders as ₹ / INR.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency?: string | null,
  options: FormatMoneyOptions = {},
): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  const { decimals = 2 } = options
  const cur = normalizeCurrency(currency)
  const locale = localeForCurrency(cur)

  if (cur === UNKNOWN_CURRENCY) {
    return `${UNKNOWN_CURRENCY} ${amount.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount)
  } catch {
    return `${cur} ${amount.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`
  }
}

/** Format minor units using ISO 4217 exponent (JPY=0, USD/INR=2, KWD=3). */
export function minorExponent(currency?: string | null): number {
  const cur = normalizeCurrency(currency)
  if (cur === 'JPY' || cur === 'KRW' || cur === 'VND') return 0
  if (cur === 'KWD' || cur === 'BHD' || cur === 'OMR') return 3
  return 2
}

export function majorToMinor(amountMajor: number, currency?: string | null): number {
  if (!Number.isFinite(amountMajor)) return 0
  const exp = minorExponent(currency)
  return Math.round(amountMajor * 10 ** exp)
}

export function minorToMajor(amountMinor: number, currency?: string | null): number {
  if (!Number.isFinite(amountMinor)) return 0
  const exp = minorExponent(currency)
  return amountMinor / 10 ** exp
}

export function formatMoneyFromMinor(
  amountMinor: number | null | undefined,
  currency?: string | null,
  options: FormatMoneyOptions = {},
): string {
  if (amountMinor == null || !Number.isFinite(amountMinor)) return '—'
  return formatMoney(minorToMajor(amountMinor, currency), currency, {
    ...options,
    decimals: minorExponent(currency) === 0 ? 0 : options.decimals ?? 2,
  })
}

/** Group amounts by currency. Does not invent FX conversions. */
export function groupAmountsByCurrency(
  items: Array<{ amount: number; currency?: string | null }>,
): Record<string, number> {
  const byCurrency: Record<string, number> = {}
  for (const item of items) {
    if (!Number.isFinite(item.amount)) continue
    const cur = normalizeCurrency(item.currency)
    // Sum via milli-units to reduce float drift within a currency bucket.
    const millis = Math.round(item.amount * 1000)
    byCurrency[cur] = ((byCurrency[cur] ?? 0) * 1000 + millis) / 1000
  }
  return byCurrency
}

/**
 * Aggregate to a single total only when every amount shares one known currency.
 * Mixed currencies or UNKNOWN ⇒ blocked (ok: false).
 */
export function aggregateMoney(
  items: Array<{ amount: number; currency?: string | null }>,
): MoneyAggregateResult {
  const byCurrency = groupAmountsByCurrency(items)
  const keys = Object.keys(byCurrency)
  if (keys.length === 0) {
    return { ok: false, reason: 'empty', byCurrency }
  }
  if (keys.includes(UNKNOWN_CURRENCY)) {
    return { ok: false, reason: 'unknown_currency', byCurrency }
  }
  if (keys.length > 1) {
    return { ok: false, reason: 'mixed_currency', byCurrency }
  }
  const currency = keys[0]!
  return { ok: true, total: money(byCurrency[currency]!, currency), byCurrency }
}

/** Display multi-currency buckets without summing across currencies. */
export function formatMoneyBuckets(byCurrency: Record<string, number>): string {
  const entries = Object.entries(byCurrency).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return '—'
  return entries.map(([cur, amt]) => formatMoney(amt, cur)).join(' · ')
}

/**
 * Amount-range filter in major units of the row currency.
 * Labels are currency-neutral (no ₹). Pass `filterCurrency` to restrict to one currency.
 */
export const CURRENCY_NEUTRAL_AMOUNT_RANGES = [
  'All',
  'Under 10,000',
  '10,000 – 100,000',
  'Over 100,000',
] as const

export type CurrencyNeutralAmountRange = (typeof CURRENCY_NEUTRAL_AMOUNT_RANGES)[number]

export function matchesCurrencyAwareAmountRange(
  amount: number,
  currency: string | null | undefined,
  range: CurrencyNeutralAmountRange,
  filterCurrency?: string | null,
): boolean {
  if (range === 'All') {
    if (filterCurrency && isKnownCurrency(filterCurrency)) {
      return normalizeCurrency(currency) === normalizeCurrency(filterCurrency)
    }
    return true
  }
  const cur = normalizeCurrency(currency)
  if (cur === UNKNOWN_CURRENCY) return false
  if (filterCurrency && isKnownCurrency(filterCurrency) && cur !== normalizeCurrency(filterCurrency)) {
    return false
  }
  if (!Number.isFinite(amount)) return false
  if (range === 'Under 10,000') return amount < 10_000
  if (range === '10,000 – 100,000') return amount >= 10_000 && amount <= 100_000
  return amount > 100_000
}
