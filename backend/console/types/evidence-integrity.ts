// Evidence Integrity Types for Compliance Monitor Page

export type IntegrityStatus = 'VERIFIED' | 'DEGRADED' | 'FAILED' | 'CHECKING'
export type WORMStatus = 'ENABLED' | 'DISABLED' | 'PARTIAL'
export type ObjectLockStatus = 'ENABLED' | 'DISABLED' | 'GOVERNANCE' | 'COMPLIANCE'

export interface IntegrityOverview {
  status: IntegrityStatus
  total_records: number
  verified_records: number
  integrity_percent: number
  last_check_at: string
  next_check_at: string
  check_frequency_seconds: number
}

export interface CoverageMetrics {
  envelopes_total: number
  envelopes_covered: number
  envelopes_percent: number
  intents_total: number
  intents_covered: number
  intents_percent: number
  dlq_total: number
  dlq_covered: number
  dlq_percent: number
  contracts_total: number
  contracts_covered: number
  contracts_percent: number
}

export interface ComplianceProof {
  storage_mode: 'WORM' | 'STANDARD' | 'ARCHIVE'
  object_lock_status: ObjectLockStatus
  object_lock_mode: 'GOVERNANCE' | 'COMPLIANCE' | 'NONE'
  retention_years: number
  retention_until: string
  early_delete_blocked: boolean
  legal_hold_enabled: boolean
  compliance_standards: string[]
}

export interface HashChainHealth {
  algorithm: string
  chains_verified: number
  chains_total: number
  broken_chains: number
  chain_head_hash: string
  chain_tail_hash: string
  last_block_timestamp: string
  verification_duration_ms: number
}

export interface VerificationEvent {
  event_id: string
  timestamp: string
  event_type: 'VERIFICATION_OK' | 'BATCH_APPENDED' | 'RETENTION_OK' | 'CHAIN_VERIFIED' | 'COMPLIANCE_CHECK' | 'HASH_MISMATCH' | 'CHAIN_BROKEN'
  status: 'success' | 'warning' | 'error'
  description: string
  records_affected: number
  actor: string
  metadata?: Record<string, string>
}

export interface AuditMetrics {
  verifications_24h: number
  verifications_success_rate: number
  batches_appended_24h: number
  compliance_checks_24h: number
  anomalies_detected_24h: number
  last_anomaly_at: string | null
}

export interface EvidenceIntegrityResponse {
  integrity: IntegrityOverview
  coverage: CoverageMetrics
  compliance: ComplianceProof
  hash_chain: HashChainHealth
  recent_events: VerificationEvent[]
  audit_metrics: AuditMetrics
}
