'use client'

import type { JournalMixLegendItem } from '../../journal/JournalBatchMixCardLayout'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from './useSettlementBatchSummary'

export const SETTLEMENT_OUTCOME_MIX_COLORS = ['#5eead4', '#f43f5e', '#52525b']

export function useSettlementJournalOutcomeMix() {
  const { selectedClientBatchId } = useSettlementBatchSelection()
  const { rows, loading, outcome } = useSettlementBatchSummary()

  const other = Math.max(0, outcome.total - outcome.settled - outcome.failed)
  const slices = [
    { name: 'Settled', value: outcome.settled },
    { name: 'Failed', value: outcome.failed },
    { name: 'Other', value: other },
  ].filter((s) => s.value > 0)

  const legend: JournalMixLegendItem[] = [
    { label: 'Settled', value: outcome.settled.toLocaleString('en-US'), color: SETTLEMENT_OUTCOME_MIX_COLORS[0] },
    { label: 'Failed', value: outcome.failed.toLocaleString('en-US'), color: SETTLEMENT_OUTCOME_MIX_COLORS[1] },
    { label: 'Other', value: other.toLocaleString('en-US'), color: SETTLEMENT_OUTCOME_MIX_COLORS[2] },
  ]

  return {
    selectedClientBatchId,
    slices,
    legend,
    loading,
    hasData: slices.length > 0,
  }
}
