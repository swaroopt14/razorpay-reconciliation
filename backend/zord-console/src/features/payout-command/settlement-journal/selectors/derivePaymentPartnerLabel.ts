import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'

function isPresent(value: string | undefined): boolean {
  const v = (value ?? '').trim()
  return Boolean(v && v !== '—')
}

function formatPartnerLabel(raw: string): string {
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

/** Dominant payment partner label from settlement observation rows. */
export function derivePaymentPartnerLabel(rows: SettlementObservationTableRow[]): string {
  if (!rows.length) return '—'

  const counts = new Map<string, number>()
  for (const row of rows) {
    const provider = isPresent(row.providerRef) ? row.providerRef.trim() : ''
    const source = isPresent(row.sourceSystem) ? row.sourceSystem.trim() : ''
    const key = provider || source
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  if (!counts.size) return '—'

  const [topKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return formatPartnerLabel(topKey)
}
