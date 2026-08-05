import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'
import { mapMatchStatus, settlementMappingConfidence } from '../mappers/mapMatchStatus'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'

export type SettlementDataHealthMetrics = {
  recordsReceived: number
  withBankRefPct: number
  withClientRefPct: number
  matchedCount: number
  unmatchedOrphanValue: number
  avgMatchConfidence: number | null
  missingRefRatePct: number
}

export function deriveSettlementDataHealth(rows: SettlementObservationTableRow[]): SettlementDataHealthMetrics {
  const recordsReceived = rows.length
  if (recordsReceived === 0) {
    return {
      recordsReceived: 0,
      withBankRefPct: 0,
      withClientRefPct: 0,
      matchedCount: 0,
      unmatchedOrphanValue: 0,
      avgMatchConfidence: null,
      missingRefRatePct: 0,
    }
  }

  const hasRef = (value: string | undefined) => {
    const v = (value ?? '').trim()
    return Boolean(v && v !== '—')
  }
  const withBankRef = rows.filter((r) => hasRef(r.bankRef)).length
  const withClientRef = rows.filter((r) => hasRef(r.clientRef)).length
  const matchedCount = rows.filter((r) => {
    const linkedIntentId = (r.matchedIntentId ?? '').trim()
    if (linkedIntentId && linkedIntentId !== '—') return true
    return mapMatchStatus(r) === 'Matched'
  }).length
  const unmatchedOrphanValue = rows
    .filter((r) => !hasRef(r.clientRef))
    .reduce((sum, r) => sum + r.amount, 0)

  const scores = rows
    .map((r) => settlementMappingConfidence(r))
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s))
  const avgMatchConfidence =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  return {
    recordsReceived,
    withBankRefPct: Math.round((withBankRef / recordsReceived) * 100),
    withClientRefPct: Math.round((withClientRef / recordsReceived) * 100),
    matchedCount,
    unmatchedOrphanValue,
    avgMatchConfidence,
    missingRefRatePct: Math.round(((recordsReceived - withClientRef) / recordsReceived) * 100),
  }
}

export function formatOrphanValue(value: number): string {
  if (value <= 0) return formatJournalMoney(0)
  return formatJournalMoney(value)
}
