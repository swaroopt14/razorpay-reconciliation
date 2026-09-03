'use client'

import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'
import { useJournalBatchMetrics } from '../hooks/useJournalBatchMetrics'
import { intentJournalCopy } from '../copy/intentJournalCopy'
import { fmtInrFromMinorExact } from '../../command-center/commandCenterFormat'
import { formatConfidencePct } from '../intentJournalSidebarUtils'
import { useDlqManualReviewCount } from '../hooks/useDlqManualReviewCount'
import { IntentJournalExportMenu } from './IntentJournalExportMenu'

type IntentJournalHeroBannerProps = {
  onExportIntents: () => void
  onExportReviewItems: () => void
  exportDisabled?: boolean
  intentExportCount?: number
  reviewExportCount?: number
  /** Spec 7.6 - pre-dispatch blocked value (major INR units). */
  blockedValue?: number | null
  blockedCount?: number | null
  sealEligibleCount?: number | null
  onSealEligible?: () => void
  onOpenReviewQueue?: () => void
  onValidateBatch?: () => void
  onApplyPolicy?: () => void
}

function formatApiCount(count: number | null | undefined, loading: boolean): string {
  if (count != null) return count.toLocaleString('en-IN')
  return loading ? '…' : '-'
}

function formatMajorInr(value: number | null | undefined, loading: boolean): string {
  if (loading && value == null) return '-'
  if (value == null) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

export function IntentJournalHeroBanner({
  onExportIntents,
  onExportReviewItems,
  exportDisabled,
  intentExportCount = 0,
  reviewExportCount = 0,
  blockedValue = null,
  blockedCount = null,
  sealEligibleCount = null,
  onSealEligible,
  onOpenReviewQueue,
  onValidateBatch,
  onApplyPolicy,
}: IntentJournalHeroBannerProps) {
  const { selectedBatchId, journalEnabled } = useJournalBatchSelection()
  const { batch, metrics, loading } = useJournalBatchMetrics(selectedBatchId, journalEnabled)
  const totalAmount = batch?.totalValue ?? metrics?.intendedValue ?? null
  const { displayCount: manualReviewCount, loading: manualReviewLoading } = useDlqManualReviewCount(
    journalEnabled,
    selectedBatchId,
  )

  const instructionCount = metrics?.instructionCount ?? null
  const instructionCountDisplay = formatApiCount(instructionCount, loading)
  const valueLabel =
    loading && totalAmount == null
      ? '-'
      : totalAmount != null
        ? fmtInrFromMinorExact(totalAmount)
        : '-'

  const qualityPct = formatConfidencePct(metrics?.batchAggregateConfidenceScore ?? null)
  const eligible = sealEligibleCount ?? 0
  const totalForReadiness = instructionCount ?? 0
  const readinessSub =
    totalForReadiness > 0
      ? `${eligible.toLocaleString('en-IN')} of ${totalForReadiness.toLocaleString('en-IN')} ready to seal`
      : intentJournalCopy.kpi.readinessTooltip

  const needsReviewDisplay =
    manualReviewCount != null ? manualReviewCount.toLocaleString('en-IN') : manualReviewLoading ? '…' : '-'

  const buckets = [
    {
      label: intentJournalCopy.kpi.instructions,
      value: instructionCountDisplay,
      sub:
        instructionCount != null
          ? `${instructionCount.toLocaleString('en-IN')} in this batch`
          : loading
            ? 'Loading…'
            : '-',
    },
    {
      label: intentJournalCopy.kpi.readiness,
      value: qualityPct,
      sub: readinessSub,
    },
    {
      label: intentJournalCopy.kpi.blockedValue,
      value: formatMajorInr(blockedValue, loading),
      sub:
        blockedCount != null && blockedCount > 0
          ? `${blockedCount} blocked · ${intentJournalCopy.kpi.blockedValueHint}`
          : intentJournalCopy.kpi.blockedValueHint,
    },
    {
      label: intentJournalCopy.kpi.needsReview,
      value: needsReviewDisplay,
      sub: 'Open the review queue',
    },
  ] as const

  return (
    <div className="mb-4 space-y-3">
      <header className="border border-[#E2E8F0] bg-white px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
              {intentJournalCopy.pageTitle}
            </h1>
            <p className="mt-0.5 text-[13px] text-[#64748B]">{intentJournalCopy.pageSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onValidateBatch}
              className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
            >
              {intentJournalCopy.actions.validate}
            </button>
            <button
              type="button"
              onClick={onApplyPolicy}
              className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
            >
              {intentJournalCopy.actions.applyPolicy}
            </button>
            <button
              type="button"
              onClick={onOpenReviewQueue}
              className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
            >
              {intentJournalCopy.actions.openReview}
            </button>
            <button
              type="button"
              onClick={onSealEligible}
              disabled={!sealEligibleCount}
              className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
            >
              {intentJournalCopy.actions.sealEligible}
              {sealEligibleCount ? (
                <span className="ml-1.5 tabular-nums opacity-80">({sealEligibleCount})</span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <JournalIntelligenceKpiHero
        eyebrow={intentJournalCopy.hero.label}
        value={valueLabel}
        subcopy={`${selectedBatchId || intentJournalCopy.sidebar.selectBatch} · ${instructionCountDisplay} ${intentJournalCopy.sidebar.instructions}`}
        buckets={buckets}
        testId="intent-kpi-hero"
        footer={
          <IntentJournalExportMenu
            onExportIntents={onExportIntents}
            onExportReviewItems={onExportReviewItems}
            disabled={exportDisabled || !selectedBatchId}
            intentCount={intentExportCount}
            reviewCount={reviewExportCount}
          />
        }
      />
    </div>
  )
}
