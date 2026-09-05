import { DEMO_DISPATCH_ROWS } from './dispatchRelayDemo'
import {
  DEMO_BLOCKED_INDEX,
  DEMO_MISSING_REF_INDEX,
  DEMO_RETURNED_INDEX,
  DEMO_REVERSAL_INDEX,
  formatDemoInr,
  isDemoShortIndex,
  isDemoWaitingIndex,
} from './demoPayoutAmounts'
import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import { undersettleBreakdownForIndex, type UndersettleBreakdown } from './undersettleScheduleDemo'

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
  invoiceLabel: string
  taxLabel: string
  marginLabel: string
  undersettle: UndersettleBreakdown | null
}

const METHODS: SignalMethod[] = [
  'API response',
  'Webhook',
  'Bank/PSP file',
  'API response',
  'Manual external reference',
  'Ledger feed',
  'Webhook',
  'API response',
  'Bank/PSP file',
  'API response',
  'Webhook',
  'Ledger feed',
  'API response',
  'Bank/PSP file',
  'Webhook',
  'Manual external reference',
  'API response',
  'Webhook',
  'Bank/PSP file',
  'API response',
]

/** Map dispatch lifecycle → settlement outcome for the 100-payout demo. */
function outcomeFor(i: number, amount: number): {
  outcome: SettlementOutcome
  observed: number | null
  providerRef: string | null
  valueDate: string | null
  confidence: string
  note: string
  missingAction: string | null
} {
  // Unsealed — never dispatched (PAY-0020 beneficiary-change block)
  if (i === DEMO_BLOCKED_INDEX) {
    return {
      outcome: 'Waiting',
      observed: null,
      providerRef: null,
      valueDate: null,
      confidence: '-',
      note: 'Unsealed after policy block. No dispatch attempt, so no settlement to observe.',
      missingAction: 'Resolve Control Review, then seal and dispatch.',
    }
  }
  // Waiting — dispatched; bank confirmation not yet observed
  if (isDemoWaitingIndex(i)) {
    return {
      outcome: 'Waiting',
      observed: null,
      providerRef: DEMO_DISPATCH_ROWS[i]?.attempts[0]?.providerRef ?? null,
      valueDate: null,
      confidence: '-',
      note: 'Provider ack is not final settlement. Waiting for credit / file signal.',
      missingAction: 'Collect historical signals or retry connector.',
    }
  }
  // Short at 90% (provider fee deduction)
  if (isDemoShortIndex(i)) {
    const shortObserved = Math.round(amount * 0.90 * 100) / 100
    return {
      outcome: 'Short',
      observed: shortObserved,
      providerRef: `UTR-${8819000000 + i}`,
      valueDate: '12 Jun 2026',
      confidence: '72%',
      note: `Observed credit ₹${shortObserved.toLocaleString('en-IN', { minimumFractionDigits: 2 })} below sealed expected — provider fee deduction.`,
      missingAction: null,
    }
  }
  // Returned
  if (i === DEMO_RETURNED_INDEX) {
    return {
      outcome: 'Returned',
      observed: amount,
      providerRef: `RET-${770000 + i}`,
      valueDate: '13 Jun 2026',
      confidence: '88%',
      note: 'Return received after credit attempt — distinct from short settlement.',
      missingAction: null,
    }
  }
  // Reversal
  if (i === DEMO_REVERSAL_INDEX) {
    return {
      outcome: 'Reversal',
      observed: amount,
      providerRef: `REV-${660000 + i}`,
      valueDate: '14 Jun 2026',
      confidence: '90%',
      note: 'Reversal exposure recorded against sealed contract.',
      missingAction: null,
    }
  }
  // Missing reference
  if (i === DEMO_MISSING_REF_INDEX) {
    return {
      outcome: 'Missing reference',
      observed: amount,
      providerRef: null,
      valueDate: '12 Jun 2026',
      confidence: '41%',
      note: 'Settlement amount present but provider / payment ref could not be mapped.',
      missingAction: 'Map provider reference or upload corrected settlement file.',
    }
  }
  // Everything else — Exact match
  return {
    outcome: 'Exact',
    observed: amount,
    providerRef: `UTR-${8820000000 + i}`,
    valueDate: '12 Jun 2026',
    confidence: `${92 + (i % 7)}%`,
    note: 'Observed matches sealed expected amount.',
    missingAction: null,
  }
}

/** Single demo batch for settlement journal (one batch across the console). */
const SETTLEMENT_BATCH_IDS = [DEMO_SMOKE_BATCH_ID] as const

const BATCH_LABELS: Record<string, string> = {
  [DEMO_SMOKE_BATCH_ID]: DEMO_BATCH_LABEL,
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

export const DEMO_SETTLEMENT_ROWS: SettlementRow[] = DEMO_DISPATCH_ROWS.map((d, i) => {
  const o = outcomeFor(i, d.amountRupees)
  const undersettle = undersettleBreakdownForIndex(i)
  return {
    id: `set-${d.humanRef}`,
    paymentRef: d.humanRef,
    contractId: d.contractId,
    payeeLabel: d.payeeLabel,
    expectedLabel: d.amountLabel,
    observedLabel: o.observed == null ? '-' : formatDemoInr(o.observed),
    expectedRupees: d.amountRupees,
    observedRupees: o.observed,
    currency: 'INR',
    providerRef: o.providerRef,
    valueDate: o.valueDate,
    outcome: o.outcome,
    signalSource: METHODS[i % METHODS.length]!,
    matchConfidence: o.confidence,
    batchId: DEMO_SMOKE_BATCH_ID,
    missingAction: o.missingAction,
    note: o.note,
    traceHref: d.traceHref,
    contractHref: d.contractHref,
    outcomeReviewHref: '/settlement/review?demo=sandbox',
    invoiceLabel: d.amountLabel,
    taxLabel: undersettle?.taxLabel ?? '—',
    marginLabel: undersettle?.marginLabel ?? '—',
    undersettle,
  }
})

/** Overlay sealed net + mock outcomes — cross-border sandbox only. */
export function withCrossBorderUndersettle(row: SettlementRow): SettlementRow {
  const u = row.undersettle
  if (!u) return row
  return {
    ...row,
    payeeLabel: `Company ${u.companyCode} · ${row.payeeLabel}`,
    expectedLabel: u.expectedNetLabel,
    observedLabel: u.observedLabel,
    expectedRupees: u.expectedNet,
    observedRupees: u.observed,
    outcome: u.outcome,
    matchConfidence: u.outcome === 'Short' ? '71%' : row.matchConfidence,
    missingAction:
      u.outcome === 'Short' ? 'Open Outcome Review for the unexplained remainder.' : null,
    note: u.reason,
    invoiceLabel: u.invoiceLabel,
    taxLabel: u.taxLabel,
    marginLabel: u.marginLabel,
  }
}

function paise(n: number): number {
  return Math.round(n * 100) / 100
}

export function settlementSummary(rows: SettlementRow[]) {
  let observed = 0
  let waiting = 0
  let returned = 0
  let reversal = 0
  let missingRefs = 0
  let settledCount = 0
  let waitingCount = 0

  for (const r of rows) {
    const sealed = DEMO_DISPATCH_ROWS.find((d) => d.humanRef === r.paymentRef)?.sealed ?? false
    if (!sealed) continue
    if (r.outcome === 'Waiting') {
      waiting += r.expectedRupees
      waitingCount += 1
    }
    if (r.outcome === 'Returned') returned += r.expectedRupees
    if (r.outcome === 'Reversal') reversal += r.expectedRupees
    if (r.outcome === 'Missing reference') missingRefs += 1
    if (r.observedRupees != null && r.outcome !== 'Waiting') {
      observed += r.observedRupees
      settledCount += 1
    }
  }

  return {
    observedValue: paise(observed),
    waitingValue: paise(waiting),
    returnedValue: paise(returned),
    reversalExposure: paise(reversal),
    missingReferences: missingRefs,
    rowCount: rows.length,
    settledCount,
    waitingCount,
  }
}

export function buildSettlementBatches(rows: SettlementRow[]): SettlementBatch[] {
  const byBatch = new Map<string, SettlementRow[]>()
  for (const r of rows) {
    const list = byBatch.get(r.batchId) ?? []
    list.push(r)
    byBatch.set(r.batchId, list)
  }

  return SETTLEMENT_BATCH_IDS.map((batchId) => {
    const batchRows = byBatch.get(batchId) ?? []
    const expectedValue = paise(
      batchRows.reduce((s, r) => {
        const sealed = DEMO_DISPATCH_ROWS.find((d) => d.humanRef === r.paymentRef)?.sealed
        return s + (sealed ? r.expectedRupees : 0)
      }, 0),
    )
    const observedValue = paise(
      batchRows.reduce((s, r) => {
        const sealed = DEMO_DISPATCH_ROWS.find((d) => d.humanRef === r.paymentRef)?.sealed
        return s + (sealed && r.observedRupees != null && r.outcome !== 'Waiting' ? r.observedRupees : 0)
      }, 0),
    )
    const waitingCount = batchRows.filter((r) => {
      const sealed = DEMO_DISPATCH_ROWS.find((d) => d.humanRef === r.paymentRef)?.sealed
      return sealed && r.outcome === 'Waiting'
    }).length
    const exceptionCount = batchRows.filter((r) =>
      ['Short', 'Returned', 'Reversal', 'Missing reference', 'Over', 'Mixed'].includes(r.outcome),
    ).length
    let health: SettlementBatch['health'] = 'Stable'
    if (exceptionCount >= 2 || waitingCount >= 3) health = 'Critical'
    else if (exceptionCount >= 1 || waitingCount >= 1) health = 'Needs attention'

    return {
      batchId,
      label: BATCH_LABELS[batchId] ?? batchId,
      rowCount: batchRows.length,
      expectedValue,
      observedValue,
      waitingCount,
      exceptionCount,
      health,
    }
  }).filter((b) => b.rowCount > 0)
}

export function rowsForBatch(rows: SettlementRow[], batchId: string): SettlementRow[] {
  return rows.filter((r) => r.batchId === batchId)
}

export function formatSettlementInr(n: number): string {
  return formatDemoInr(n)
}
