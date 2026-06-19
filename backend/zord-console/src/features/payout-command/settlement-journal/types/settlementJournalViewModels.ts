import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'
import type { SettlementDataHealthMetrics } from '../selectors/deriveSettlementDataHealth'
import type { SettlementSidebarOutcome } from '../settlementJournalSidebarUtils'

export type SettlementJournalBatchViewModel = {
  clientBatchId: string
  rows: SettlementObservationTableRow[]
  outcome: SettlementSidebarOutcome
  dataHealth: SettlementDataHealthMetrics
  loading: boolean
}
