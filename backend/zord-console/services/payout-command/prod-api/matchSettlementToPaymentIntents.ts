import type { IntentJournalPaymentIntentItem } from './intentJournalTypes'
import type { SettlementObservationTableRow } from './settlementObservations'

function norm(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function isPresent(value: string): boolean {
  return Boolean(value && value !== '—')
}

/** Resolve payment intent id for one settlement row (console-only; no outcome-engine field). */
export function resolveMatchedPaymentIntentId(
  row: Pick<SettlementObservationTableRow, 'observationId' | 'clientRef' | 'matchedIntentId'>,
  intents: IntentJournalPaymentIntentItem[],
): string | null {
  const fromApi = norm(row.matchedIntentId)
  if (isPresent(fromApi)) return fromApi

  const observationId = norm(row.observationId)
  if (observationId) {
    const byObservationId = intents.find((intent) => norm(intent.intent_id) === observationId)
    if (byObservationId?.intent_id?.trim()) return byObservationId.intent_id.trim()
  }

  const clientRef = norm(row.clientRef)
  if (isPresent(clientRef)) {
    const byClientRef = intents.find((intent) => norm(intent.client_payout_ref) === clientRef)
    if (byClientRef?.intent_id?.trim()) return byClientRef.intent_id.trim()
  }

  return null
}

/** Enrich settlement rows with matched intent ids from payment-intents API. */
export function enrichSettlementRowsWithPaymentIntentMatches(
  rows: SettlementObservationTableRow[],
  intents: IntentJournalPaymentIntentItem[],
): SettlementObservationTableRow[] {
  if (!rows.length || !intents.length) return rows

  return rows.map((row) => {
    const matchedIntentId = resolveMatchedPaymentIntentId(row, intents)
    if (!matchedIntentId) return row
    return { ...row, matchedIntentId }
  })
}

export function countSettlementRowsMatchedToPaymentIntents(
  rows: SettlementObservationTableRow[],
): number {
  return rows.filter((row) => isPresent(norm(row.matchedIntentId))).length
}
