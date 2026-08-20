import { formatMoney } from '@/services/payout-command/money/money'

/**
 * Table / drawer money — preserve fractional major units.
 * CON-P0-23: never default missing currency to INR.
 */
export function formatJournalMoney(amount: number, currency?: string | null): string {
  return formatMoney(amount, currency, { decimals: 2 })
}
