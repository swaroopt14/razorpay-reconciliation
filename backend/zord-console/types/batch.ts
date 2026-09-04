import { Receipt } from './receipt'

export interface Batch {
  id: string
  batchId: string
  tenant: string
  uploadedAt: string
  totalRecords: number
  canonicalized: number
  failed: number
  processing: number
  receipts: Receipt[]
  failedRows: FailedRow[]
}

export interface FailedRow {
  receiptId: string
  rowNumber: number
  error: string
  errorType: string
  uploadedAt: string
}
