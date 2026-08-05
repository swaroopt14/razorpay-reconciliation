import {
  DEMO_BATCH_LABEL,
  DEMO_CLIENT_BATCH_REF,
  DEMO_SMOKE_BATCH_ID,
  demoBatchHref,
} from './ycDemoConstants'
import { PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH } from '../batchCommandCenterHref'
import { DEMO_DISPATCH_ROWS } from './dispatchRelayDemo'
import { DEMO_PAYOUT_AMOUNTS, demoIntendedPaymentValue } from './demoPayoutAmounts'
import { DEMO_SETTLEMENT_ROWS, settlementSummary } from './settlementJournalDemo'
import { DEMO_PROOF_PACKS, proofCenterStats } from './proofCenterDemo'

/** Spec 7.2 lifecycle ribbon - Received → Governed → Sealed → Dispatched → Settled → Proven */
export type LifecycleStage = {
  id: string
  label: 'Received' | 'Governed' | 'Sealed' | 'Dispatched' | 'Settled' | 'Proven'
  count: number
  valueRupees: number
  href: string
}

export type OverviewSummaryCard = {
  id: string
  /** Exact 7.2 labels */
  label:
    | 'Intended payment value'
    | 'Settlement value observed'
    | 'Value requiring review'
    | 'Proof-ready payouts'
  valueLabel: string
  hint: string
  href: string
}

export type AttentionItem = {
  id: string
  /** Exact 7.2 attention queue labels */
  label:
    | 'Blocked before dispatch'
    | 'Waiting for settlement'
    | 'Outcome exception'
    | 'Evidence incomplete'
  detail: string
  count: number
  valueRupees: number
  href: string
  severity: 'high' | 'medium' | 'low'
}

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

const settlement = settlementSummary(DEMO_SETTLEMENT_ROWS)
const proofStats = proofCenterStats(DEMO_PROOF_PACKS)

const sealedRows = DEMO_DISPATCH_ROWS.filter((r) => r.sealed)
const sealedValue = sealedRows.reduce((s, r) => s + r.amountRupees, 0)
const dispatchedRows = DEMO_DISPATCH_ROWS.filter(
  (r) =>
    r.sealed &&
    (r.flowStage === 'Sent' ||
      r.flowStage === 'Acknowledged' ||
      r.flowStage === 'Processing' ||
      r.flowStage === 'Outcome observed'),
)
const dispatchedValue = dispatchedRows.reduce((s, r) => s + r.amountRupees, 0)

const waitingRows = DEMO_SETTLEMENT_ROWS.filter((r) => r.outcome === 'Waiting')
const exceptionRows = DEMO_SETTLEMENT_ROWS.filter((r) =>
  ['Short', 'Returned', 'Reversal', 'Missing reference', 'Mixed'].includes(r.outcome),
)
const shortDelta = DEMO_SETTLEMENT_ROWS.filter((r) => r.outcome === 'Short').reduce((s, r) => {
  if (r.observedRupees == null) return s
  return s + (r.expectedRupees - r.observedRupees)
}, 0)
const reviewValue =
  shortDelta +
  DEMO_SETTLEMENT_ROWS.filter((r) => r.outcome === 'Returned' || r.outcome === 'Reversal').reduce(
    (s, r) => s + r.expectedRupees,
    0,
  ) +
  DEMO_SETTLEMENT_ROWS.filter((r) => r.outcome === 'Missing reference').reduce(
    (s, r) => s + r.expectedRupees,
    0,
  )

const blockedRow = DEMO_DISPATCH_ROWS[19]!
const incompletePacks = DEMO_PROOF_PACKS.filter((p) => p.coverageRank < 5 || p.missingItems.length > 0)
const incompleteValue = incompletePacks.reduce((s, p) => {
  const idx = DEMO_DISPATCH_ROWS.findIndex((d) => d.humanRef === p.paymentRef)
  return s + (DEMO_PAYOUT_AMOUNTS[idx] ?? 0)
}, 0)
const p5Packs = DEMO_PROOF_PACKS.filter((p) => p.coverageRank === 5)
const p5Value = p5Packs.reduce((s, p) => {
  const idx = DEMO_DISPATCH_ROWS.findIndex((d) => d.humanRef === p.paymentRef)
  return s + (DEMO_PAYOUT_AMOUNTS[idx] ?? 0)
}, 0)

const intended = demoIntendedPaymentValue()
const settledExactish = DEMO_SETTLEMENT_ROWS.filter(
  (r) => r.outcome === 'Exact' || r.outcome === 'Short' || r.outcome === 'Missing reference',
)

/**
 * Prepared demo totals - derived from the same 20-row dispatch/settlement/proof fixtures
 * as Intent journals, Settlement Journal, Action Contract (PAY-0001 = ₹5,500), and sample CSVs.
 * Batch intended total matches smoke Leakage payroll scale (₹55,000).
 */
export const OVERVIEW_DEMO = {
  batchId: DEMO_SMOKE_BATCH_ID,
  clientBatchRef: DEMO_CLIENT_BATCH_REF,
  batchLabel: DEMO_BATCH_LABEL,
  intendedValueRupees: intended,
  settlementObservedRupees: settlement.observedValue,
  reviewValueRupees: reviewValue,
  proofReadyCount: proofStats.p5,
  proofReadyValueRupees: p5Value,
  instructionCount: DEMO_DISPATCH_ROWS.length,
  hasTrendHistory: false,
} as const

export const OVERVIEW_HEADER = {
  title: 'Overview',
  subtitle: 'Authorised, settled, and what needs attention.',
} as const

export function overviewLifecycleRibbon(): LifecycleStage[] {
  return [
    {
      id: 'received',
      label: 'Received',
      count: DEMO_DISPATCH_ROWS.length,
      valueRupees: intended,
      href: demoBatchHref('grid'),
    },
    {
      id: 'governed',
      label: 'Governed',
      count: DEMO_DISPATCH_ROWS.length - 1,
      valueRupees: intended - blockedRow.amountRupees,
      href: demoBatchHref('grid'),
    },
    {
      id: 'sealed',
      label: 'Sealed',
      count: sealedRows.length,
      valueRupees: sealedValue,
      href: demoBatchHref('grid'),
    },
    {
      id: 'dispatched',
      label: 'Dispatched',
      count: dispatchedRows.length,
      valueRupees: dispatchedValue,
      href: demoBatchHref('settlement'),
    },
    {
      id: 'settled',
      label: 'Settled',
      count: settledExactish.length,
      valueRupees: settlement.observedValue,
      href: demoBatchHref('settlement'),
    },
    {
      id: 'proven',
      label: 'Proven',
      count: OVERVIEW_DEMO.proofReadyCount,
      valueRupees: OVERVIEW_DEMO.proofReadyValueRupees,
      href: '/proof?demo=sandbox',
    },
  ]
}

export function overviewSummaryCards(): OverviewSummaryCard[] {
  return [
    {
      id: 'intended',
      label: 'Intended payment value',
      valueLabel: formatInr(OVERVIEW_DEMO.intendedValueRupees),
      hint: `${OVERVIEW_DEMO.instructionCount} authorised instructions`,
      href: demoBatchHref('grid'),
    },
    {
      id: 'settlement',
      label: 'Settlement value observed',
      valueLabel: formatInr(OVERVIEW_DEMO.settlementObservedRupees),
      hint: 'Matched to sealed demand',
      href: '/settlement/journal?demo=sandbox',
    },
    {
      id: 'review',
      label: 'Value requiring review',
      valueLabel: formatInr(OVERVIEW_DEMO.reviewValueRupees),
      hint: 'Short-settled, returned, or unresolved',
      href: '/settlement/review?demo=sandbox',
    },
    {
      id: 'proof',
      label: 'Proof-ready payouts',
      valueLabel: String(OVERVIEW_DEMO.proofReadyCount),
      hint: `${formatInr(OVERVIEW_DEMO.proofReadyValueRupees)} with complete evidence packs`,
      href: '/proof?demo=sandbox',
    },
  ]
}

export function overviewAttentionQueue(): AttentionItem[] {
  return [
    {
      id: 'blocked',
      label: 'Blocked before dispatch',
      detail: 'Beneficiary change - policy blocked seal until review',
      count: 1,
      valueRupees: blockedRow.amountRupees,
      href: '/controls/review',
      severity: 'high',
    },
    {
      id: 'waiting',
      label: 'Waiting for settlement',
      detail: 'Dispatched; bank confirmation not yet observed',
      count: waitingRows.length,
      valueRupees: settlement.waitingValue,
      href: '/settlement/journal?demo=sandbox',
      severity: 'medium',
    },
    {
      id: 'exception',
      label: 'Outcome exception',
      detail: 'Short settlement vs sealed Payment Action Contract',
      count: exceptionRows.length,
      valueRupees: OVERVIEW_DEMO.reviewValueRupees,
      href: '/settlement/review?demo=sandbox',
      severity: 'high',
    },
    {
      id: 'evidence',
      label: 'Evidence incomplete',
      detail: 'Settlement present; proof pack missing required artefacts',
      count: incompletePacks.length,
      valueRupees: incompleteValue,
      href: demoBatchHref('proof', { extra: 'filter=incomplete' }),
      severity: 'medium',
    },
  ]
}

export const OVERVIEW_CTAS = {
  followDemo: {
    label: 'Open batch',
    href: demoBatchHref('grid'),
  },
  createObligation: {
    label: 'Create payout',
    href: `${PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH}?upload=1`,
  },
  openQueue: {
    label: 'Needs attention',
    href: '#attention-now',
  },
  exportHealth: {
    label: 'Export summary',
  },
  followLifecycle: {
    label: 'Open batch',
    href: demoBatchHref('grid'),
  },
} as const
