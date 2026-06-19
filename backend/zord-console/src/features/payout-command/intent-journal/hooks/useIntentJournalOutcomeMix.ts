'use client'

import type { JournalMixLegendItem } from '../../journal/JournalBatchMixCardLayout'
import { useJournalBatchFromList } from './useJournalBatchFromList'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'

export const INTENT_OUTCOME_MIX_COLORS = ['#5eead4', '#a3e635', '#a78bfa', '#52525b']

function confidenceLabel(batch: { aggregateConfidenceScore?: number; highConfidenceCount: number }): string {
  if (typeof batch.aggregateConfidenceScore === 'number' && Number.isFinite(batch.aggregateConfidenceScore)) {
    const pct = batch.aggregateConfidenceScore <= 1 ? batch.aggregateConfidenceScore * 100 : batch.aggregateConfidenceScore
    return `${pct.toFixed(0)}% avg`
  }
  return '—'
}

export function useIntentJournalOutcomeMix() {
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

  const legend: JournalMixLegendItem[] = batch
    ? [
        { label: 'Confirmed', value: batch.confirmedCount.toLocaleString('en-IN'), color: INTENT_OUTCOME_MIX_COLORS[0] },
        { label: 'Avg confidence', value: confidenceLabel(batch), color: INTENT_OUTCOME_MIX_COLORS[1] },
        { label: 'Mismatches', value: batch.mismatchCount.toLocaleString('en-IN'), color: INTENT_OUTCOME_MIX_COLORS[2] },
        { label: 'Unresolved', value: batch.unresolvedCount.toLocaleString('en-IN'), color: INTENT_OUTCOME_MIX_COLORS[3] },
      ]
    : []

  return {
    selectedBatchId,
    slices,
    legend,
    loading,
    hasData: slices.length > 0 || legend.length > 0,
  }
}
