// Hash Chain Verifier Types for Forensic Tool Page

export type VerificationMode = 'RANGE' | 'INTENT_ID' | 'ENVELOPE_ID'
export type VerificationStatus = 'VERIFIED' | 'FAILED' | 'PENDING' | 'IN_PROGRESS'
export type ChainRecordStatus = 'STORED_EQUALS_COMPUTED' | 'CHAIN_HEAD' | 'MISMATCH' | 'MISSING'

export interface VerificationRequest {
  mode: VerificationMode
  start_id?: string
  end_id?: string
  intent_id?: string
  envelope_id?: string
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512'
}

export interface ChainRecord {
  sequence: number
  evidence_id: string
  evidence_type: 'ENVELOPE' | 'INTENT' | 'DLQ' | 'CONTRACT'
  stored_hash: string
  computed_hash: string
  previous_hash: string
  status: ChainRecordStatus
  timestamp: string
  payload_size_bytes: number
}

export interface VerificationMismatch {
  record_sequence: number
  evidence_id: string
  expected_hash: string
  computed_hash: string
  previous_hash: string
  error_type: 'HASH_MISMATCH' | 'CHAIN_BREAK' | 'MISSING_RECORD' | 'ORDERING_ERROR'
  description: string
}

export interface VerificationResult {
  verification_id: string
  status: VerificationStatus
  mode: VerificationMode
  algorithm: string
  start_id: string
  end_id: string
  total_records: number
  verified_records: number
  chain_breaks: number
  verification_time_ms: number
  started_at: string
  completed_at: string
  performed_by: string
  chain_head_hash: string
  chain_tail_hash: string
  records: ChainRecord[]
  mismatches: VerificationMismatch[]
}

export interface VerificationHistoryItem {
  verification_id: string
  timestamp: string
  mode: VerificationMode
  status: VerificationStatus
  records_verified: number
  chain_breaks: number
  performed_by: string
  duration_ms: number
}

export interface HashVerifierResponse {
  recent_verifications: VerificationHistoryItem[]
  chain_head: {
    hash: string
    evidence_id: string
    timestamp: string
    sequence: number
  }
  chain_stats: {
    total_records: number
    oldest_record: string
    newest_record: string
    algorithm: string
  }
}
