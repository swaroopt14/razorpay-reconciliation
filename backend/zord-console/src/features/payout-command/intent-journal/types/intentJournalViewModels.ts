import type { JournalBatchRecord, JournalFailureRow, JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import type { IntentBatchMetrics } from '../selectors/deriveIntentBatchMetrics'

/** Composed view-model for Intent Journal main column (batch selected). */
export type IntentJournalBatchViewModel = {
  batch: JournalBatchRecord | null
  metrics: IntentBatchMetrics | null
  intentRows: JournalIntentRow[]
  reviewRows: JournalFailureRow[]
  loading: boolean
}
