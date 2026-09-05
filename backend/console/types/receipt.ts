export type ReceiptStatus = 
  | 'RECEIVED'
  | 'RAW_STORED'
  | 'VALIDATING'
  | 'CANONICALIZED'
  | 'FAILED'

export interface Receipt {
  id: string
  receiptId: string
  source: string
  tenant: string
  receivedAt: string // ISO 8601
  status: ReceiptStatus
  batchId?: string
  error?: string
  errorType?: 'MISSING_FIELD' | 'INVALID_VALUE' | 'UNSUPPORTED_FORMAT' | 'POLICY_RESTRICTION'
  evidenceExists: boolean
  amount?: number
  currency?: string
  instrumentType?: string
}

export interface ReceiptTimelineEvent {
  status: ReceiptStatus
  timestamp: string
  message?: string
}
