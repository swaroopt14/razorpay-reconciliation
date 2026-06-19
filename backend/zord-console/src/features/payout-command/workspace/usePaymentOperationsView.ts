'use client'

import { useCallback, useMemo } from 'react'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useDlqManualReviewCount } from '../intent-journal/hooks/useDlqManualReviewCount'
import { commandPeriodToDateRange } from '../command-center/commandCenterPeriod'
import { fmtInrFromMinorExact, parseMinorField } from '../command-center/commandCenterFormat'
import { derivePaymentCommandDataState } from '../command-center/paymentCommandDataState'
import { usePaymentCommandDataSources } from '../command-center/usePaymentCommandDataSources'
import type { DataSourceBadgeStatus } from '../command-center/usePaymentCommandDataSources'
import { normalizePercentRatio } from '../evidence/utils/evidencePercent'
import { PAYMENT_OPERATIONS, WORKSPACE_HERO_COPY } from './paymentOperationsCopy'
import type {
  OperationalQueueRow,
  PaymentOperationsViewModel,
  ReviewBreakdownRow,
  SourceHealthRow,
} from './paymentOperationsTypes'

function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

const STATUS_DISPLAY: Record<DataSourceBadgeStatus, string> = {
  received: 'Received',
  missing: 'Missing',
  partial: 'Partial',
  ready: 'Ready',
  processing: 'Processing',
}

function sourceIssue(status: DataSourceBadgeStatus): string {
  if (status === 'received' || status === 'ready') return 'None'
  if (status === 'partial') return 'Needs confirmation'
  if (status === 'processing') return 'Processing'
  return 'Upload required'
}

export function usePaymentOperationsView(batchId?: string): {
  viewModel: PaymentOperationsViewModel
  loading: boolean
  refresh: () => Promise<void>
} {
  const { tenantReady } = useSessionTenant()
  const { displayCount: manualReviewCount, loading: manualReviewLoading, refetch: refetchManualReview } = useDlqManualReviewCount(
    tenantReady,
    batchId,
  )
  const dateQuery = useMemo(() => commandPeriodToDateRange('month'), [])

  const intelligence = useIntelligenceKpis({ tenantReady, batchId, dateQuery })
  const { refresh: refreshIntelligence, loading: intelligenceLoading } = intelligence
  const leakage = intelligence.leakage
  const ambiguity = intelligence.ambiguity
  const defensibility = intelligence.defensibility
  const patterns = intelligence.patterns
  const recommendations = intelligence.recommendations

  const leakageOk = isDataAvailable(leakage)
  const ambiguityOk = isDataAvailable(ambiguity)
  const defensibilityOk = isDataAvailable(defensibility)
  const patternsOk = isDataAvailable(patterns)
  const recommendationsOk = isDataAvailable(recommendations)

  const evidenceRate = defensibilityOk ? defensibility.evidence_pack_rate : null
  const auditReady = defensibilityOk ? defensibility.audit_ready_pct : null

  const dataSources = usePaymentCommandDataSources({
    tenantReady,
    evidencePackRate: evidenceRate,
    auditReadyPct: normalizePercentRatio(auditReady),
  })
  const { refresh: refreshDataSources, loading: dataSourcesLoading } = dataSources

  const viewModel = useMemo((): PaymentOperationsViewModel => {
    const intendedMinor = leakageOk ? parseMinorField(leakage.total_intended_amount_minor) : 0
    const settledMinor = leakageOk
      ? parseMinorField(leakage.total_observed_settled_amount_minor ?? 0)
      : 0
    const unmatched = leakageOk ? parseMinorField(leakage.unmatched_amount_minor) : 0
    const under = leakageOk ? parseMinorField(leakage.under_settlement_amount_minor) : 0
    const reversal = leakageOk ? parseMinorField(leakage.reversal_exposure_minor) : 0
    const orphan = leakageOk ? parseMinorField(leakage.orphan_amount_minor) : 0
    const unlinkedSettlement = orphan
    const reviewMinor = leakageOk ? unmatched : null

    const lifecycleState = derivePaymentCommandDataState({
      intendedMinor: leakageOk ? intendedMinor : null,
      confirmedMinor: leakageOk ? settledMinor : null,
      reviewMinor,
      hasAmbiguitySignal: ambiguityOk,
      hasPatternsSignal: patternsOk,
    })

    const intentMissing = intendedMinor <= 0 && settledMinor > 0
    const ingestIncomplete =
      dataSources.intentStatus === 'missing' && dataSources.settlementStatus === 'missing'

    let hero: (typeof WORKSPACE_HERO_COPY)[keyof typeof WORKSPACE_HERO_COPY] =
      WORKSPACE_HERO_COPY.empty
    if (intentMissing) hero = WORKSPACE_HERO_COPY.intentMissing
    else if (lifecycleState.lifecycle === 'settlement_only') hero = WORKSPACE_HERO_COPY.settlementOnly
    else if (lifecycleState.lifecycle === 'intent_only') hero = WORKSPACE_HERO_COPY.intentOnly
    else if (lifecycleState.lifecycle === 'full_lifecycle') hero = WORKSPACE_HERO_COPY.full

    const inScopeCount = patternsOk ? patterns.total_count : null

    const matchConf = ambiguityOk ? ambiguity.avg_attachment_confidence : null
    const refCompleteness =
      ambiguityOk && ambiguity.carrier_completeness_rate != null
        ? ambiguity.carrier_completeness_rate
        : null

    const proofRate = defensibilityOk ? defensibility.evidence_pack_rate : null
    const governance = defensibilityOk ? defensibility.governance_coverage_pct : null
    const replay = defensibilityOk ? defensibility.replayability_pct : null
    const disputeReady = defensibilityOk ? defensibility.dispute_ready_pct : null

    const lastUpdatedIso =
      (leakageOk && leakage.computed_at) ||
      (ambiguityOk && ambiguity.computed_at) ||
      (patternsOk && patterns.computed_at) ||
      intelligence.lastFetchedAt?.toISOString() ||
      null

    const sourceRows: SourceHealthRow[] = [
      {
        source: 'Intent file / API',
        type: 'Intent source',
        status: STATUS_DISPLAY[dataSources.intentStatus],
        lastReceived: dataSources.intentStatus === 'received' ? 'Received' : '—',
        issue: sourceIssue(dataSources.intentStatus),
      },
      {
        source: 'Settlement file',
        type: 'Settlement source',
        status: STATUS_DISPLAY[dataSources.settlementStatus],
        lastReceived: dataSources.settlementStatus === 'received' ? 'Received' : '—',
        issue: sourceIssue(dataSources.settlementStatus),
      },
      {
        source: 'Bank statement',
        type: 'Bank confirmation',
        status: STATUS_DISPLAY[dataSources.bankStatementStatus],
        lastReceived: dataSources.bankStatementStatus !== 'missing' ? 'Partial' : '—',
        issue: sourceIssue(dataSources.bankStatementStatus),
      },
      {
        source: 'Evidence Packs',
        type: 'Proof',
        status: STATUS_DISPLAY[dataSources.evidenceStatus],
        lastReceived: dataSources.evidenceStatus !== 'missing' ? 'Available' : '—',
        issue: sourceIssue(dataSources.evidenceStatus),
      },
    ]

    const clarityState: PaymentOperationsViewModel['clarityState'] = intentMissing
      ? 'intent_missing'
      : !leakageOk && !ambiguityOk
        ? 'incomplete'
        : 'complete'

    const reviewBreakdown: ReviewBreakdownRow[] = []
    if (ambiguityOk) {
      reviewBreakdown.push({
        label: 'Missing references',
        value: formatPct(ambiguity.provider_ref_missing_rate),
      })
      const lowConf =
        ambiguity.low_confidence_rate ?? Math.max(0, 1 - ambiguity.avg_attachment_confidence)
      reviewBreakdown.push({ label: 'Low confidence matches', value: formatPct(lowConf) })
      if (ambiguity.candidate_collision_rate != null) {
        reviewBreakdown.push({
          label: 'Multiple possible matches',
          value: formatPct(ambiguity.candidate_collision_rate),
        })
      }
    }
    if (patternsOk && patterns.value_date_mismatch_count != null && patterns.value_date_mismatch_count > 0) {
      reviewBreakdown.push({
        label: 'Value-date mismatches',
        value: formatCount(patterns.value_date_mismatch_count),
      })
    }

    const ingestFailures =
      manualReviewLoading && manualReviewCount == null
        ? '…'
        : manualReviewCount != null
          ? formatCount(manualReviewCount)
          : '—'
    const matchReviewCases = ambiguityOk ? formatCount(ambiguity.ambiguous_intent_count) : '—'
    const financialExceptionCases = '—'
    const openRecommendations = recommendationsOk ? formatCount(recommendations.total_actions) : '—'

    const operationalQueues: OperationalQueueRow[] = [
      { label: 'Ingest failures (DLQ)', value: ingestFailures },
      { label: 'Match review cases', value: matchReviewCases },
      { label: 'Financial exception cases', value: financialExceptionCases },
      { label: 'Open recommendations', value: openRecommendations },
    ]

    const hasLiveData =
      leakageOk ||
      ambiguityOk ||
      defensibilityOk ||
      patternsOk ||
      recommendationsOk ||
      manualReviewCount != null

    return {
      summary: {
        inScope: hasLiveData && inScopeCount != null ? formatCount(inScopeCount) : '—',
        inScopeSub: patternsOk ? `${patterns.success_count} confirmed` : 'Upload data to populate',
        paymentInstructionValue:
          leakageOk && intendedMinor > 0 ? fmtInrFromMinorExact(intendedMinor) : '—',
        paymentInstructionSub: leakageOk ? 'From payment instructions' : '—',
        settlementValueObserved:
          leakageOk && settledMinor > 0 ? fmtInrFromMinorExact(settledMinor) : '—',
        settlementObservedSub: leakageOk ? 'From bank/settlement confirmation' : '—',
        unmatchedIntentValue: reviewMinor != null ? fmtInrFromMinorExact(reviewMinor) : '—',
        unmatchedIntentSub:
          reviewMinor == null
            ? 'No unmatched intent data available'
            : reviewMinor <= 0
              ? PAYMENT_OPERATIONS.reviewZeroHint
              : 'Unmatched intent value from leakage dashboard',
        matchConfidence: matchConf != null ? formatPct(matchConf) : '—',
        matchConfidenceSub: ambiguityOk ? 'Average attachment confidence' : '—',
        proofReadiness: proofRate != null ? formatPct(proofRate) : '—',
        proofReadinessSub:
          defensibilityOk
            ? `Governance ${Math.round((normalizePercentRatio(governance) ?? 0) * 100)}% · Replay ${Math.round((normalizePercentRatio(replay) ?? 0) * 100)}%`
            : '—',
      },
      hero: {
        label: hero.label,
        value: hasLiveData && inScopeCount != null ? formatCount(inScopeCount) : '—',
        subtitle: hero.subtitle,
        showIntentMissing: intentMissing,
      },
      lifecycle: lifecycleState.lifecycle,
      sourceRows,
      clarityRows: leakageOk
        ? [
            { label: 'Payment instruction value', value: fmtInrFromMinorExact(intendedMinor) },
            { label: 'Settlement value observed', value: fmtInrFromMinorExact(settledMinor) },
            { label: 'Unmatched intent value', value: fmtInrFromMinorExact(unmatched) },
            { label: 'Short-settled value', value: fmtInrFromMinorExact(under) },
            { label: 'Unlinked settlement', value: fmtInrFromMinorExact(unlinkedSettlement) },
            { label: 'Reversal exposure', value: fmtInrFromMinorExact(reversal) },
          ]
        : [],
      clarityHero: reviewMinor != null ? fmtInrFromMinorExact(reviewMinor) : '—',
      clarityState,
      healthBrief: {
        cleanCount: patternsOk ? formatCount(patterns.success_count) : '—',
        needsReview: ingestFailures,
        proofReady:
          disputeReady != null && patternsOk
            ? formatCount(Math.round(patterns.success_count * (normalizePercentRatio(disputeReady) ?? 0)))
            : disputeReady != null
              ? formatPct(normalizePercentRatio(disputeReady) ?? 0)
              : '—',
        metrics: [
          {
            label: 'Reference completeness',
            value: refCompleteness != null ? formatPct(refCompleteness) : '—',
            pct: refCompleteness != null ? refCompleteness * 100 : 0,
          },
          {
            label: 'Match confidence',
            value: matchConf != null ? formatPct(matchConf) : '—',
            pct: matchConf != null ? matchConf * 100 : 0,
          },
          {
            label: 'Evidence coverage',
            value: proofRate != null ? formatPct(normalizePercentRatio(proofRate) ?? 0) : '—',
            pct: proofRate != null ? (normalizePercentRatio(proofRate) ?? 0) * 100 : 0,
          },
        ],
      },
      operationalQueues,
      reviewBreakdown,
      showRoutingNotice: true,
      lastUpdatedIso,
      dataSources: {
        intentStatus: dataSources.intentStatus,
        settlementStatus: dataSources.settlementStatus,
        bankStatementStatus: dataSources.bankStatementStatus,
        evidenceStatus: dataSources.evidenceStatus,
      },
      hasLiveData,
      reviewMinor,
      ambiguousIntentCount: ambiguityOk ? ambiguity.ambiguous_intent_count : 0,
      matchConfidencePct: matchConf != null ? matchConf * 100 : null,
      refCompletenessPct: refCompleteness != null ? refCompleteness * 100 : 0,
    }
  }, [
    leakage,
    ambiguity,
    defensibility,
    patterns,
    recommendations,
    dataSources,
    intelligence.lastFetchedAt,
    leakageOk,
    ambiguityOk,
    defensibilityOk,
    patternsOk,
    recommendationsOk,
    manualReviewCount,
    manualReviewLoading,
  ])

  const refresh = useCallback(async () => {
    if (!tenantReady) return
    await Promise.all([
      refreshIntelligence(),
      refreshDataSources(),
      refetchManualReview(),
    ])
  }, [tenantReady, refreshIntelligence, refreshDataSources, refetchManualReview])

  return {
    viewModel,
    loading: intelligenceLoading || dataSourcesLoading || manualReviewLoading,
    refresh,
  }
}
