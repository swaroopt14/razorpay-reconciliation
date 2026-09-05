/** Returned by `/api/payout-command/external-sync/*` until tenant connectors are configured. */
export type ExternalBatchSyncCode = 'INTEGRATION_NOT_CONFIGURED'

export type ExternalBatchSyncOperation =
  | 'loan_system_pull'
  | 'settlement_feed_pull'
  | 'mandate_nach_pull'

export type ExternalBatchSyncContext = {
  tenant_id: string | null
  batch_id: string | null
  psp: string | null
}

export type ExternalBatchSyncResponse = {
  ok: boolean
  connected: boolean
  code?: ExternalBatchSyncCode | string
  operation?: ExternalBatchSyncOperation | string
  message?: string
  hint?: string
  context?: ExternalBatchSyncContext
  request_id?: string
  received_at?: string
}
