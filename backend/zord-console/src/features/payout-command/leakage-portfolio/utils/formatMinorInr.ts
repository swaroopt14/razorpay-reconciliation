import { formatInrPrecise } from '@/services/payout-command/batch-model'
import type { MinorAmountField } from '@/services/payout-command/prod-api/intelligenceTypes'

export function coerceMinor(value: MinorAmountField | null | undefined): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatMinorInr(value: MinorAmountField | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const minor = coerceMinor(value)
  if (!Number.isFinite(minor)) return '—'
  return formatInrPrecise(minor)
}
