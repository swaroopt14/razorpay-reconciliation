'use client'

import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'
import { useJournalBatchMetrics } from '../hooks/useJournalBatchMetrics'
import { intentJournalCopy } from '../copy/intentJournalCopy'
import { fmtInrFromMinorExact } from '../../command-center/commandCenterFormat'
import { formatConfidencePct } from '../intentJournalSidebarUtils'
import { useDlqManualReviewCount } from '../hooks/useDlqManualReviewCount'
import { IntentJournalExportMenu } from './IntentJournalExportMenu'

const INTENDED_VALUE_SUB = 'Sum of payment instruction amounts'

type IntentJournalHeroBannerProps = {
  onExportIntents: () => void
  onExportReviewItems: () => void
  exportDisabled?: boolean
  intentExportCount?: number
  reviewExportCount?: number
}

function formatApiCount(count: number | null | undefined, loading: boolean): string {
  if (count != null) return count.toLocaleString('en-IN')
  return loading ? '…' : '—'
}

export function IntentJournalHeroBanner({
  onExportIntents,
  onExportReviewItems,
  exportDisabled,
  intentExportCount = 0,
  reviewExportCount = 0,
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
      ? '—'
      : totalAmount != null
        ? fmtInrFromMinorExact(totalAmount)
        : '—'
  const intendedValueSub = totalAmount != null ? INTENDED_VALUE_SUB : '—'
  const qualityPct = formatConfidencePct(metrics?.batchAggregateConfidenceScore ?? null)
  const needsReviewDisplay =
    manualReviewCount != null ? manualReviewCount.toLocaleString('en-IN') : manualReviewLoading ? '…' : '—'
  const needsReviewSub =
    manualReviewCount != null
      ? 'Items in manual-review DLQ queue'
      : manualReviewLoading
        ? 'Loading manual-review count…'
        : '—'

  const buckets = [
    {
      label: intentJournalCopy.kpi.paymentWorkflow,
      value: 'Payment batch',
      sub: 'Payment instructions',
    },
    {
      label: intentJournalCopy.kpi.instructionsCreated,
      value: instructionCountDisplay,
      sub:
        instructionCount != null && instructionCount > 0
          ? `${instructionCount.toLocaleString('en-IN')} payment instruction${instructionCount === 1 ? '' : 's'}`
          : instructionCount === 0
            ? 'No instructions yet'
            : loading
              ? 'Loading instruction count…'
              : '—',
    },
    {
      label: intentJournalCopy.kpi.readiness,
      value: qualityPct,
      sub: 'Batch aggregate confidence score',
    },
    {
      label: intentJournalCopy.kpi.needsReview,
      value: needsReviewDisplay,
      sub: needsReviewSub,
    },
  ] as const

  return (
    <JournalIntelligenceKpiHero
      className="mb-4"
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
  )
}
