/** Table / drawer money — preserve paise (no integer rounding). */
export function formatJournalMoney(amount: number, currency = 'INR'): string {
  if (!Number.isFinite(amount)) return '—'
  const cur = (currency || 'INR').trim().toUpperCase()
  const code = /^[A-Z]{3}$/.test(cur) ? cur : 'INR'
  const locale = code === 'INR' ? 'en-IN' : 'en-US'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${code} ${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}
