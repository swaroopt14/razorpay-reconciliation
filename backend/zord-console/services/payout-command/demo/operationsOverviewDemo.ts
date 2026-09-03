import {
  DEMO_BATCH_LABEL,
  DEMO_CLIENT_BATCH_REF,
  DEMO_SMOKE_BATCH_ID,
  withDemoBatchScope,
} from './ycDemoConstants'
import { PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH } from '../batchCommandCenterHref'
import { DEMO_PROOF_PACKS } from './proofCenterDemo'
import { INDIA_CASE } from './indiaBulkCaseStudy'

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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

const INTENT_HREF = withDemoBatchScope('/payouts/intents')
const DISPATCH_HREF = withDemoBatchScope('/execution/dispatches')
const SETTLEMENT_HREF = withDemoBatchScope('/settlement/journal')
const PROOF_HREF = withDemoBatchScope('/proof')
const REVIEW_HREF = withDemoBatchScope('/settlement/review')
const GAPS_HREF = withDemoBatchScope('/settlement/gaps')

const incompletePacks = DEMO_PROOF_PACKS.filter((p) => p.coverageRank < 5)
const incompleteValue = INDIA_CASE.receivedValue - INDIA_CASE.provenValue

/**
 * India bulk-payout case study — same 100-row spine as Intent / Dispatch / Settlement / Proof.
 * 100 received → 99 sealed & dispatched (1 blocked) → 88 settled → 83 proof-ready.
 */
export const OVERVIEW_DEMO = {
  batchId: DEMO_SMOKE_BATCH_ID,
  clientBatchRef: DEMO_CLIENT_BATCH_REF,
  batchLabel: DEMO_BATCH_LABEL,
  intendedValueRupees: INDIA_CASE.receivedValue,
  settlementObservedRupees: INDIA_CASE.settledObservedValue,
  reviewValueRupees: INDIA_CASE.reviewValue,
  proofReadyCount: INDIA_CASE.provenCount,
  proofReadyValueRupees: INDIA_CASE.provenValue,
  instructionCount: INDIA_CASE.receivedCount,
  hasTrendHistory: false,
} as const

export type LifecycleReadiness = {
  intentOk: boolean
  settlementOk: boolean
  dispatched: boolean
}

export const OVERVIEW_HEADER = {
  title: 'Overview',
  subtitle: 'Authorised, settled, and what needs attention.',
} as const

export function overviewLifecycleRibbon(readiness?: LifecycleReadiness): LifecycleStage[] {
  const intentOk = readiness?.intentOk ?? false
  const settlementOk = readiness?.settlementOk ?? false
  const dispatched = readiness?.dispatched ?? false

  return [
    {
      id: 'received',
      label: 'Received',
      count: intentOk ? INDIA_CASE.receivedCount : 0,
      valueRupees: intentOk ? INDIA_CASE.receivedValue : 0,
      href: INTENT_HREF,
    },
    {
      id: 'governed',
      label: 'Governed',
      count: dispatched ? INDIA_CASE.governedCount : 0,
      valueRupees: dispatched ? INDIA_CASE.governedValue : 0,
      href: DISPATCH_HREF,
    },
    {
      id: 'sealed',
      label: 'Sealed',
      count: dispatched ? INDIA_CASE.sealedCount : 0,
      valueRupees: dispatched ? INDIA_CASE.sealedValue : 0,
      href: DISPATCH_HREF,
    },
    {
      id: 'dispatched',
      label: 'Dispatched',
      count: dispatched ? INDIA_CASE.dispatchedCount : 0,
      valueRupees: dispatched ? INDIA_CASE.dispatchedValue : 0,
      href: DISPATCH_HREF,
    },
    {
      id: 'settled',
      label: 'Settled',
      count: settlementOk ? INDIA_CASE.settledCount : 0,
      valueRupees: settlementOk ? INDIA_CASE.settledObservedValue : 0,
      href: SETTLEMENT_HREF,
    },
    {
      id: 'proven',
      label: 'Proven',
      count: settlementOk ? INDIA_CASE.provenCount : 0,
      valueRupees: settlementOk ? INDIA_CASE.provenValue : 0,
      href: PROOF_HREF,
    },
  ]
}

export function overviewSummaryCards(readiness?: LifecycleReadiness): OverviewSummaryCard[] {
  const intentOk = readiness?.intentOk ?? false
  const settlementOk = readiness?.settlementOk ?? false

  return [
    {
      id: 'intended',
      label: 'Intended payment value',
      valueLabel: intentOk ? formatInr(OVERVIEW_DEMO.intendedValueRupees) : '-',
      hint: intentOk ? `${OVERVIEW_DEMO.instructionCount} authorised instructions` : 'Upload intent file to see data',
      href: INTENT_HREF,
    },
    {
      id: 'settlement',
      label: 'Settlement value observed',
      valueLabel: settlementOk ? formatInr(OVERVIEW_DEMO.settlementObservedRupees) : '-',
      hint: settlementOk ? `${INDIA_CASE.settledCount} payouts with an observed settlement signal` : 'Upload settlement file to see data',
      href: SETTLEMENT_HREF,
    },
    {
      id: 'review',
      label: 'Value requiring review',
      valueLabel: settlementOk ? formatInr(OVERVIEW_DEMO.reviewValueRupees) : '-',
      hint: settlementOk ? 'Short-settled, returned, reversed, or unresolved' : 'Upload settlement file to see data',
      href: REVIEW_HREF,
    },
    {
      id: 'proof',
      label: 'Proof-ready payouts',
      valueLabel: settlementOk ? String(OVERVIEW_DEMO.proofReadyCount) : '-',
      hint: settlementOk ? `${formatInr(OVERVIEW_DEMO.proofReadyValueRupees)} with complete evidence packs` : 'Upload settlement file to see data',
      href: PROOF_HREF,
    },
  ]
}

export function overviewAttentionQueue(readiness?: LifecycleReadiness): AttentionItem[] {
  const settlementOk = readiness?.settlementOk ?? false
  const dispatched = readiness?.dispatched ?? false
  const items: AttentionItem[] = []

  if (dispatched) {
    items.push({
      id: 'blocked',
      label: 'Blocked before dispatch',
      detail: 'Beneficiary change - policy blocked seal until review',
      count: INDIA_CASE.blockedCount,
      valueRupees: INDIA_CASE.blockedValue,
      href: '/controls/review',
      severity: 'high',
    })
  }

  if (settlementOk) {
    items.push(
      {
        id: 'waiting',
        label: 'Waiting for settlement',
        detail: 'Dispatched; bank confirmation not yet observed',
        count: INDIA_CASE.waitingCount,
        valueRupees: INDIA_CASE.waitingValue,
        href: SETTLEMENT_HREF,
        severity: 'medium',
      },
      {
        id: 'exception',
        label: 'Outcome exception',
        detail: 'Short, returned, reversed, or missing reference vs sealed contract',
        count: INDIA_CASE.exceptionCount,
        valueRupees: INDIA_CASE.reviewValue,
        href: REVIEW_HREF,
        severity: 'high',
      },
      {
        id: 'evidence',
        label: 'Evidence incomplete',
        detail: 'Packs below P5 — waiting, exception, or blocked',
        count: incompletePacks.length,
        valueRupees: incompleteValue,
        href: GAPS_HREF,
        severity: 'medium',
      },
    )
  }

  return items
}

export const OVERVIEW_CTAS = {
  followDemo: {
    label: 'Open batch',
    href: INTENT_HREF,
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
    href: INTENT_HREF,
  },
} as const
