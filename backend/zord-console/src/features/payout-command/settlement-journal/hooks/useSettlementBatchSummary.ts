'use client'

import { useMemo } from 'react'
import { computeSettlementBatchSummary } from '../settlementJournalSidebarUtils'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementObservationRows } from './useSettlementObservationRows'

/** Hero / KPI / donut widgets — shares observation fetch with table via cache dedupe. */
export function useSettlementBatchSummary() {
  const { selectedClientBatchId, journalEnabled, tenantReady } = useSettlementBatchSelection()
  const { rows, observationTotal, loading } = useSettlementObservationRows(
    selectedClientBatchId,
    journalEnabled && tenantReady,
    { fetchAll: true },
  )

  return useMemo(
    () => ({
      rows,
      observationTotal,
      loading,
      ...computeSettlementBatchSummary(rows),
    }),
    [rows, observationTotal, loading],
  )
}
