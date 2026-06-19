'use client'

import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'
import { useJournalBatchMetrics } from '../hooks/useJournalBatchMetrics'
import { fmtInrFromMinorExact } from '../../command-center/commandCenterFormat'
import { formatConfidencePct } from '../intentJournalSidebarUtils'
import { useDlqManualReviewCount } from '../hooks/useDlqManualReviewCount'
import { intentJournalCopy } from '../copy/intentJournalCopy'

const INTENDED_VALUE_SUB = 'Sum of payment instruction amounts'

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article className={`relative ${COMMAND_CENTER_KPI_CARD} !p-4`}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{label}</p>
      <p className={`relative mt-2 text-[22px] font-extrabold tabular-nums leading-none tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
        {value}
      </p>
      <p className={`relative mt-1 ${HOME_BODY_IMPERIAL_SM}`}>{sub}</p>
    </article>
  )
}

const KPI_GRID_CLASS = 'mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5'

function formatApiCount(count: number | null | undefined, loading: boolean): string {
  if (count != null) return count.toLocaleString('en-IN')
  return loading ? '…' : '—'
}

export function IntentJournalKpiStrip() {
  const { selectedBatchId, journalEnabled, tenantReady } = useJournalBatchSelection()
  const feedEnabled = journalEnabled && tenantReady
  const { batch, metrics, loading } = useJournalBatchMetrics(selectedBatchId, feedEnabled)
  const totalAmount = batch?.totalValue ?? metrics?.intendedValue ?? null
  const { displayCount: manualReviewCount, loading: manualReviewLoading } = useDlqManualReviewCount(
    feedEnabled,
    selectedBatchId,
  )

  const copy = intentJournalCopy.kpi
  const placeholderLabels = [copy.paymentWorkflow, copy.instructionsCreated, copy.intendedValue, copy.readiness, copy.needsReview]

  if (!selectedBatchId) {
    return (
      <div className={KPI_GRID_CLASS}>
        {placeholderLabels.map((label) => (
          <KpiCard key={label} label={label} value="—" sub={intentJournalCopy.sidebar.selectBatch} />
        ))}
      </div>
    )
  }

  if (loading && !metrics) {
    return (
      <p className={`mb-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 ${HOME_BODY_IMPERIAL_SM}`}>
        Loading batch KPIs…
      </p>
    )
  }

  const instructionCount = metrics?.instructionCount ?? null
  const instructionCountDisplay = formatApiCount(instructionCount, loading)
  const intendedValueDisplay =
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

  return (
    <div className={KPI_GRID_CLASS}>
      <KpiCard label={copy.paymentWorkflow} value="Payment batch" sub="Payment instructions" />
      <KpiCard
        label={copy.instructionsCreated}
        value={instructionCountDisplay}
        sub={
          instructionCount != null && instructionCount > 0
            ? `${instructionCount.toLocaleString('en-IN')} payment instruction${instructionCount === 1 ? '' : 's'}`
            : instructionCount === 0
              ? 'No instructions yet'
              : loading
                ? 'Loading instruction count…'
                : '—'
        }
      />
      <KpiCard label={copy.intendedValue} value={intendedValueDisplay} sub={intendedValueSub} />
      <KpiCard label={copy.readiness} value={qualityPct} sub="Batch aggregate confidence score" />
      <KpiCard label={copy.needsReview} value={needsReviewDisplay} sub={needsReviewSub} />
    </div>
  )
}
