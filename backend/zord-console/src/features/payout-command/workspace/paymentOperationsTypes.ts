import type { PaymentCommandLifecycleState } from '../command-center/paymentCommandDataState'
import type { DataSourceBadgeStatus } from '../command-center/usePaymentCommandDataSources'

export type SourceHealthRow = {
  source: string
  type: string
  status: string
  lastReceived: string
  issue: string
}

export type PaymentClarityRow = {
  label: string
  value: string
}

export type HealthMetricRow = {
  label: string
  value: string
  pct: number
}

export type ReviewBreakdownRow = {
  label: string
  value: string
}

export type OperationalQueueRow = {
  label: string
  value: string
}

export type PaymentOperationsSummary = {
  inScope: string
  inScopeSub: string
  paymentInstructionValue: string
  paymentInstructionSub: string
  settlementValueObserved: string
  settlementObservedSub: string
  unmatchedIntentValue: string
  unmatchedIntentSub: string
  matchConfidence: string
  matchConfidenceSub: string
  proofReadiness: string
  proofReadinessSub: string
}

export type PaymentOperationsHero = {
  label: string
  value: string
  subtitle: string
  showIntentMissing: boolean
}

export type PaymentOperationsViewModel = {
  summary: PaymentOperationsSummary
  hero: PaymentOperationsHero
  lifecycle: PaymentCommandLifecycleState
  sourceRows: SourceHealthRow[]
  clarityRows: PaymentClarityRow[]
  clarityHero: string
  clarityState: 'complete' | 'incomplete' | 'intent_missing'
  healthBrief: {
    cleanCount: string
    needsReview: string
    proofReady: string
    metrics: HealthMetricRow[]
  }
  operationalQueues: OperationalQueueRow[]
  reviewBreakdown: ReviewBreakdownRow[]
  showRoutingNotice: boolean
  lastUpdatedIso: string | null
  dataSources: {
    intentStatus: DataSourceBadgeStatus
    settlementStatus: DataSourceBadgeStatus
    bankStatementStatus: DataSourceBadgeStatus
    evidenceStatus: DataSourceBadgeStatus
  }
  hasLiveData: boolean
  reviewMinor: number | null
  ambiguousIntentCount: number
  matchConfidencePct: number | null
  refCompletenessPct: number | null
}
