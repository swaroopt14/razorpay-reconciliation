'use client'

import {
  JOURNAL_INSIGHT_DARK_CARD,
  JOURNAL_INSIGHT_DARK_LABEL,
  JOURNAL_INSIGHT_DARK_MUTED,
} from '../../command-center/homeCommandCenterTokens'
import { JournalBatchMixCardBody } from '../../journal/JournalBatchMixCardLayout'
import { useJournalBatchFromList } from '../hooks/useJournalBatchFromList'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'

const MIX_COLORS = ['#5eead4', '#a3e635', '#a78bfa', '#52525b']

function confidenceLabel(batch: { aggregateConfidenceScore?: number; highConfidenceCount: number }): string {
  if (typeof batch.aggregateConfidenceScore === 'number' && Number.isFinite(batch.aggregateConfidenceScore)) {
    const pct = batch.aggregateConfidenceScore <= 1 ? batch.aggregateConfidenceScore * 100 : batch.aggregateConfidenceScore
    return `${pct.toFixed(0)}% avg`
  }
  return '—'
}

type IntentJournalBatchMixCardProps = {
  showHeader?: boolean
  fillHeight?: boolean
}

export function IntentJournalBatchMixCard({
  showHeader = true,
  fillHeight = false,
}: IntentJournalBatchMixCardProps) {
  const { selectedBatchId, journalEnabled } = useJournalBatchSelection()
  const { batch, loading } = useJournalBatchFromList(selectedBatchId, journalEnabled)

  const slices = batch
    ? [
        { name: 'Confirmed', value: Math.max(0, batch.confirmedCount) },
        { name: 'Mismatches', value: Math.max(0, batch.mismatchCount) },
        { name: 'Unresolved', value: Math.max(0, batch.unresolvedCount) },
        {
          name: 'Other',
          value: Math.max(
            0,
            batch.transactions - batch.confirmedCount - batch.mismatchCount - batch.unresolvedCount,
          ),
        },
      ].filter((s) => s.value > 0)
    : []

  const legend = batch
    ? [
        { label: 'Confirmed', value: batch.confirmedCount.toLocaleString('en-IN'), color: MIX_COLORS[0] },
        { label: 'Avg confidence', value: confidenceLabel(batch), color: MIX_COLORS[1] },
        { label: 'Mismatches', value: batch.mismatchCount.toLocaleString('en-IN'), color: MIX_COLORS[2] },
        { label: 'Unresolved', value: batch.unresolvedCount.toLocaleString('en-IN'), color: MIX_COLORS[3] },
      ]
    : []

  const rootClass = fillHeight
    ? `relative h-full min-h-0 flex flex-col overflow-hidden ${JOURNAL_INSIGHT_DARK_CARD}`
    : `relative overflow-hidden ${JOURNAL_INSIGHT_DARK_CARD}`

  return (
    <article className={rootClass}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <p className={JOURNAL_INSIGHT_DARK_LABEL}>Batch outcome mix</p>
          <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/70">
            Batch
          </span>
        </div>
      ) : fillHeight ? null : (
        <div className="pt-3" />
      )}
      {!selectedBatchId ? (
        <p className={`px-4 pb-4 pt-2 ${JOURNAL_INSIGHT_DARK_MUTED}`}>Select a batch to see outcome mix.</p>
      ) : loading && !batch ? (
        <p className={`px-4 pb-4 pt-2 ${JOURNAL_INSIGHT_DARK_MUTED}`}>Loading…</p>
      ) : (
        <JournalBatchMixCardBody
          slices={slices}
          legend={legend}
          colors={MIX_COLORS}
          fillHeight={fillHeight}
          formatValue={(v) => v.toLocaleString('en-IN')}
        />
      )}
    </article>
  )
}
