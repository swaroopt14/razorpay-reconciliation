/**
 * Settlement Journal (v2) data module — API-backed via BFF.
 * Surfaces keep importing DEMO_SETTLEMENT_ROWS / helpers; this module loads live data.
 */

import { notifyDemoDataListeners } from './demoBatchReadiness'
import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import {
  extractClientBatchIdsFromListResponse,
  getSettlementObservationBatchesForSession,
  getSettlementObservationsForClientBatch,
  getSettlementParseErrorsForClientBatch,
  mapObservationToTableRow,
  type CanonicalSettlementObservation,
  type SettlementObservationTableRow,
  type SettlementParseErrorRow,
} from '@/services/payout-command/prod-api/settlementObservations'

/** Spec 7.11 - Settlement Journal demo fixtures. */

export type SignalMethod =
  | 'Webhook'
  | 'API response'
  | 'Bank/PSP file'
  | 'Ledger feed'
  | 'Manual external reference'

export type SettlementOutcome =
  | 'Exact'
  | 'Short'
  | 'Over'
  | 'Returned'
  | 'Reversal'
  | 'Waiting'
  | 'Missing reference'
  | 'Mixed'

export type SettlementRow = {
  id: string
  paymentRef: string
  contractId: string
  payeeLabel: string
  expectedLabel: string
  observedLabel: string
  expectedRupees: number
  observedRupees: number | null
  currency: string
  providerRef: string | null
  valueDate: string | null
  outcome: SettlementOutcome
  signalSource: SignalMethod
  matchConfidence: string
  batchId: string
  missingAction: string | null
  note: string
  traceHref: string
  contractHref: string
  outcomeReviewHref: string
}

export type SettlementBatch = {
  batchId: string
  label: string
  rowCount: number
  expectedValue: number
  observedValue: number
  waitingCount: number
  exceptionCount: number
  /** Exact / waiting / exception mix label */
  health: 'Stable' | 'Needs attention' | 'Critical'
}

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

function signalFromSource(sourceSystem: string, sourceType: string): SignalMethod {
  const hay = `${sourceSystem} ${sourceType}`.toLowerCase()
  if (hay.includes('webhook')) return 'Webhook'
  if (hay.includes('ledger')) return 'Ledger feed'
  if (hay.includes('manual')) return 'Manual external reference'
  if (hay.includes('file') || hay.includes('csv') || hay.includes('bank') || hay.includes('psp')) {
    return 'Bank/PSP file'
  }
  return 'API response'
}

function outcomeFromObservation(row: SettlementObservationTableRow): {
  outcome: SettlementOutcome
  observedRupees: number | null
  missingAction: string | null
  note: string
} {
  const status = row.statusRaw.toUpperCase()
  const expected = row.amount
  const settled = row.settledAmount
  const hasProvider = row.providerRef !== '-' || row.bankRef !== '-'
  const clientRef = row.clientRef !== '-' ? row.clientRef : null

  if (row.returnFlag || status.includes('RETURN')) {
    return {
      outcome: 'Returned',
      observedRupees: settled || expected || null,
      missingAction: null,
      note: 'Return received after credit attempt.',
    }
  }
  if (row.reversalFlag || status.includes('REVERS')) {
    return {
      outcome: 'Reversal',
      observedRupees: settled || expected || null,
      missingAction: null,
      note: 'Reversal exposure recorded against sealed contract.',
    }
  }
  if (status.includes('PENDING') || status.includes('WAITING') || status === '') {
    return {
      outcome: 'Waiting',
      observedRupees: null,
      missingAction: 'Collect historical signals or retry connector.',
      note: 'Provider ack is not final settlement. Waiting for credit / file signal.',
    }
  }
  if (!clientRef || status.includes('MISSING') || (!hasProvider && settled > 0)) {
    return {
      outcome: 'Missing reference',
      observedRupees: settled || expected || null,
      missingAction: 'Map provider reference or upload corrected settlement file.',
      note: 'Settlement amount present but provider / payment ref could not be mapped.',
    }
  }
  if (settled > 0 && expected > 0 && settled < expected * 0.995) {
    return {
      outcome: 'Short',
      observedRupees: settled,
      missingAction: null,
      note: 'Observed credit below sealed expected amount - open Outcome Review.',
    }
  }
  if (settled > 0 && expected > 0 && settled > expected * 1.005) {
    return {
      outcome: 'Over',
      observedRupees: settled,
      missingAction: null,
      note: 'Observed credit above sealed expected amount.',
    }
  }
  if (status.includes('SETTLE') || status.includes('SUCCESS') || status.includes('PAID')) {
    return {
      outcome: 'Exact',
      observedRupees: settled || expected,
      missingAction: null,
      note: 'Observed matches sealed expected amount.',
    }
  }
  return {
    outcome: 'Mixed',
    observedRupees: settled || null,
    missingAction: null,
    note: row.status !== '-' ? `Settlement status: ${row.status}` : 'Settlement signal recorded.',
  }
}

function confidenceLabel(mapping: number | null, parse: number | null): string {
  const raw = mapping ?? parse
  if (raw == null || !Number.isFinite(raw)) return '-'
  const pct = raw <= 1 ? Math.round(raw * 100) : Math.round(raw)
  return `${pct}%`
}

function mapTableRowToSettlementRow(row: SettlementObservationTableRow): SettlementRow {
  const mapped = outcomeFromObservation(row)
  const paymentRef = row.clientRef !== '-' ? row.clientRef : row.sourceRowRef
  const providerRef =
    row.bankRef !== '-' ? row.bankRef : row.providerRef !== '-' ? row.providerRef : null
  const valueDate = row.valueDate !== '-' ? row.valueDate : null
  const batchId = row.clientBatchId !== '-' ? row.clientBatchId : DEMO_SMOKE_BATCH_ID

  return {
    id: row.observationId,
    paymentRef,
    contractId: row.matchedIntentId !== '-' ? row.matchedIntentId : '-',
    payeeLabel: row.sourceSystem !== '-' ? row.sourceSystem : 'Settlement payee',
    expectedLabel: formatInr(row.amount),
    observedLabel: mapped.observedRupees == null ? '-' : formatInr(mapped.observedRupees),
    expectedRupees: row.amount,
    observedRupees: mapped.observedRupees,
    currency: row.currency || 'INR',
    providerRef,
    valueDate,
    outcome: mapped.outcome,
    signalSource: signalFromSource(row.sourceSystem, row.sourceType),
    matchConfidence: confidenceLabel(row.mappingConfidence, row.parseConfidence),
    batchId,
    missingAction: mapped.missingAction,
    note: mapped.note,
    traceHref: `/trace?demo=sandbox&ref=${encodeURIComponent(paymentRef)}`,
    contractHref: `/contracts?demo=sandbox&ref=${encodeURIComponent(paymentRef)}`,
    outcomeReviewHref: `/settlement/review?demo=sandbox&focus=${encodeURIComponent(paymentRef)}`,
  }
}

function rowsFromParseErrors(batchId: string, errors: SettlementParseErrorRow[]): SettlementRow[] {
  return errors.map((err, i) => {
    const ref = err.source_row_ref?.trim() || `err-${i + 1}`
    return {
      id: `parse-err-${batchId}-${ref}`,
      paymentRef: `ROW-${ref}`,
      contractId: '-',
      payeeLabel: 'Parse / mapping error',
      expectedLabel: '-',
      observedLabel: '-',
      expectedRupees: 0,
      observedRupees: null,
      currency: 'INR',
      providerRef: null,
      valueDate: null,
      outcome: 'Missing reference' as SettlementOutcome,
      signalSource: 'Bank/PSP file' as SignalMethod,
      matchConfidence: '-',
      batchId,
      missingAction: 'Fix source file and re-upload settlement.',
      note: [err.error_stage, err.reason_code, err.severity].filter(Boolean).join(' · ') || 'Parse error',
      traceHref: `/trace?demo=sandbox&batch_id=${encodeURIComponent(batchId)}`,
      contractHref: '/contracts?demo=sandbox',
      outcomeReviewHref: `/settlement/review?demo=sandbox&batch=${encodeURIComponent(batchId)}`,
    }
  })
}

/** Live rows — reassigned when observations load (ESM live binding). */
export let DEMO_SETTLEMENT_ROWS: SettlementRow[] = []

let loadPromise: Promise<void> | null = null
let loadGeneration = 0

export async function loadSettlementJournalDemoData(): Promise<SettlementRow[]> {
  const generation = ++loadGeneration
  const batchRes = await getSettlementObservationBatchesForSession()
  if (generation !== loadGeneration) return DEMO_SETTLEMENT_ROWS

  const batchIds = extractClientBatchIdsFromListResponse(batchRes.data)
  if (!batchRes.ok || batchIds.length === 0) {
    DEMO_SETTLEMENT_ROWS = []
    notifyDemoDataListeners()
    return DEMO_SETTLEMENT_ROWS
  }

  const allRows: SettlementRow[] = []
  for (const batchId of batchIds) {
    const [obsRes, errRes] = await Promise.all([
      getSettlementObservationsForClientBatch(batchId),
      getSettlementParseErrorsForClientBatch(batchId),
    ])
    if (generation !== loadGeneration) return DEMO_SETTLEMENT_ROWS

    const observations = (obsRes.data?.items ?? []) as CanonicalSettlementObservation[]
    for (let i = 0; i < observations.length; i += 1) {
      const tableRow = mapObservationToTableRow(observations[i]!, {
        clientBatchId: batchId,
        rowIndex: i,
      })
      allRows.push(mapTableRowToSettlementRow(tableRow))
    }

    const parseErrors = errRes.data?.items ?? []
    if (parseErrors.length > 0) {
      allRows.push(...rowsFromParseErrors(batchId, parseErrors))
    }
  }

  DEMO_SETTLEMENT_ROWS = allRows
  notifyDemoDataListeners()
  return DEMO_SETTLEMENT_ROWS
}

/** Idempotent client bootstrap — surfaces keep reading DEMO_SETTLEMENT_ROWS. */
export function ensureSettlementJournalDemoLoaded(): void {
  if (typeof window === 'undefined') return
  if (loadPromise) return
  loadPromise = loadSettlementJournalDemoData()
    .then(() => undefined)
    .catch(() => {
      DEMO_SETTLEMENT_ROWS = []
      notifyDemoDataListeners()
    })
}

if (typeof window !== 'undefined') {
  ensureSettlementJournalDemoLoaded()
}

export function settlementSummary(rows: SettlementRow[]) {
  let observed = 0
  let waiting = 0
  let returned = 0
  let reversal = 0
  let missingRefs = 0

  for (const r of rows) {
    if (r.outcome === 'Waiting') waiting += r.expectedRupees
    if (r.outcome === 'Returned') returned += r.expectedRupees
    if (r.outcome === 'Reversal') reversal += r.expectedRupees
    if (r.outcome === 'Missing reference') missingRefs += 1
    if (r.observedRupees != null && r.outcome !== 'Waiting') observed += r.observedRupees
  }

  return {
    observedValue: observed,
    waitingValue: waiting,
    returnedValue: returned,
    reversalExposure: reversal,
    missingReferences: missingRefs,
    rowCount: rows.length,
  }
}

export function buildSettlementBatches(rows: SettlementRow[]): SettlementBatch[] {
  const byBatch = new Map<string, SettlementRow[]>()
  for (const r of rows) {
    const list = byBatch.get(r.batchId) ?? []
    list.push(r)
    byBatch.set(r.batchId, list)
  }

  return [...byBatch.entries()]
    .map(([batchId, batchRows]) => {
      const expectedValue = batchRows.reduce((s, r) => s + r.expectedRupees, 0)
      const observedValue = batchRows.reduce(
        (s, r) => s + (r.observedRupees != null && r.outcome !== 'Waiting' ? r.observedRupees : 0),
        0,
      )
      const waitingCount = batchRows.filter((r) => r.outcome === 'Waiting').length
      const exceptionCount = batchRows.filter((r) =>
        ['Short', 'Returned', 'Reversal', 'Missing reference', 'Over', 'Mixed'].includes(r.outcome),
      ).length
      let health: SettlementBatch['health'] = 'Stable'
      if (exceptionCount >= 2 || waitingCount >= 3) health = 'Critical'
      else if (exceptionCount >= 1 || waitingCount >= 1) health = 'Needs attention'

      return {
        batchId,
        label: batchId === DEMO_SMOKE_BATCH_ID ? DEMO_BATCH_LABEL : batchId,
        rowCount: batchRows.length,
        expectedValue,
        observedValue,
        waitingCount,
        exceptionCount,
        health,
      }
    })
    .filter((b) => b.rowCount > 0)
}

export function rowsForBatch(rows: SettlementRow[], batchId: string): SettlementRow[] {
  return rows.filter((r) => r.batchId === batchId)
}

export function formatSettlementInr(n: number): string {
  return formatInr(n)
}
