// Types for Validation & Safety pages

// Schema Registry Types
export type SchemaFormat = 'JSON_SCHEMA' | 'AVRO' | 'PROTOBUF'
export type SchemaStatus = 'ACTIVE' | 'DEPRECATED' | 'DRAFT'

export interface Schema {
  schema_name: string
  version: string
  format: SchemaFormat
  status: SchemaStatus
  used_by: string
  created_at: string
  updated_at: string
}

export interface BreakingChange {
  field: string
  change_type: string
  impact: string
}

export interface SchemaDetail extends Schema {
  // Version Metadata
  canonical_version: string
  hash: string
  schema_format_version: string
  description?: string
  created_by: string
  
  // Usage & Enforcement
  used_by_service: string
  enforced_at_stage: string
  active_tenants: number
  intents_validated: number
  failures_24h: number
  
  // Canonical Mapping
  intent_type: string
  maps_to_table: string
  required_fields: string[]
  
  // Schema Content
  schema_content: object
  
  // Compatibility & Evolution
  compatibility: {
    backward_compatible: boolean
    forward_compatible: boolean
    breaking_changes_count: number
    breaking_changes: BreakingChange[]
  }
  
  // Enforcement & Failure Impact
  enforcement: {
    validation_stage: string
    on_failure_actions: string[]
    dlq_stage_code: string
    dlq_reason_codes: string[]
    envelope_parse_status: string
  }
  
  // Audit & Evidence
  audit: {
    schema_immutable: boolean
    changes_allowed_in_prod: boolean
    evidence_stored: boolean
    evidence_type: string
    evidence_ref?: string
  }
}

export interface SchemaRegistrySummary {
  total_schemas: number
  active_schemas: number
  deprecated_schemas: number
  supported_formats: SchemaFormat[]
}

export interface SchemaListResponse {
  items: Schema[]
  summary: SchemaRegistrySummary
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

// Idempotency Store Types
export type IdempotencyStatus = 'CONSUMED' | 'REJECTED' | 'PENDING' | 'EXPIRED'

export interface IdempotencyKey {
  tenant: string
  idempotency_key: string
  status: IdempotencyStatus
  first_seen: string
  expires_at?: string
}

export interface ReplayAttempt {
  timestamp: string
  outcome: 'blocked' | 'allowed'
  source_ip?: string
  envelope_id?: string
}

export interface IdempotencyKeyDetail extends IdempotencyKey {
  first_envelope_id: string
  canonical_intent_id?: string
  tenant_id: string
  response_snapshot: object
  request_hash: string
  replay_count: number
  duplicates_blocked: number
  last_replay_at?: string
  final_outcome: 'ACCEPTED' | 'REJECTED' | 'PENDING'
  
  // Replay attempts detail
  replay_attempts: ReplayAttempt[]
  
  // Enforcement semantics
  enforcement: {
    scope: string
    enforced_by: string
    checked_at_stage: string
    on_replay_actions: string[]
  }
  
  // Audit & Evidence
  audit: {
    record_immutable: boolean
    stored_in_worm: boolean
    evidence_ref?: string
    evidence_receipt_id?: string
  }
}

export interface IdempotencyStoreSummary {
  active_keys: number
  duplicates_blocked_24h: number
  replays_allowed: number
  expired_keys_24h: number
}

export interface IdempotencyListResponse {
  items: IdempotencyKey[]
  summary: IdempotencyStoreSummary
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

// Pre-ACC Guard Types
export type GuardStage = 
  | 'SCHEMA_VALIDATION'
  | 'IDEMPOTENCY_CHECK'
  | 'PII_TOKENIZATION'
  | 'BENEFICIARY_VALIDATION'
  | 'AMOUNT_CURRENCY_SANITY'
  | 'DEADLINE_CONSTRAINTS'

export type GuardReasonCode = 
  | 'INVALID_FIELD'
  | 'MISSING_FIELD'
  | 'SCHEMA_MISMATCH'
  | 'DUPLICATE_REQUEST'
  | 'TOKENIZATION_FAIL'
  | 'INVALID_BENEFICIARY'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'DEADLINE_EXCEEDED'
  | 'UNKNOWN_ERROR'

export interface GuardRule {
  name: string
  stage: GuardStage
  description: string
  enforced_by: string
  failure_stage_code: string
  enabled: boolean
}

export interface GuardFailure {
  dlq_id: string
  envelope_id: string
  stage: GuardStage
  reason_code: GuardReasonCode
  created_at: string
  replayable: boolean
}

export type FailureSeverity = 'HARD_BLOCK' | 'SOFT_RETRY'
export type FinancialRisk = 'HIGH' | 'MEDIUM' | 'LOW'

export interface GuardPipelineStep {
  stage: string
  status: 'PASS' | 'FAIL' | 'SKIPPED'
  is_failure_point: boolean
}

export interface AccessLogEntry {
  timestamp: string
  action: string
  actor: string
  details?: string
}

export interface DLQItemDetail extends GuardFailure {
  // Error details
  error_message: string
  error_detail: string
  schema_path?: string
  expected_type?: string
  actual_value?: string
  raw_payload_hash?: string
  raw_payload_snippet?: string
  
  // Failure classification
  failure_type: string
  guard_layer: string
  severity: FailureSeverity
  financial_risk: FinancialRisk
  cross_tenant_impact: string
  
  // Guard stage breakdown
  executed_by: string
  execution_order: number
  total_stages: number
  schema_version?: string
  pipeline_steps: GuardPipelineStep[]
  
  // Linked objects (chain of custody)
  linked_envelope?: {
    envelope_id: string
    source: string
    ingress_method: string
    received_at: string
    source_ip?: string
    correlation_id?: string
  }
  linked_intent_id?: string
  tenant_id: string
  tenant_name: string
  
  // Replay eligibility
  replay_reason?: string
  manual_intervention_required: boolean
  safe_replay_path?: string[]
  
  // Evidence & audit
  envelope_persisted: boolean
  failure_recorded: boolean
  evidence_status: 'GENERATED' | 'PENDING' | 'NONE'
  evidence_ref?: string
  evidence_receipt_id?: string
  
  // Internal access log
  access_log: AccessLogEntry[]
  
  // Replay tracking
  replay_attempts: number
  last_replay_at?: string
  metadata: Record<string, string>
}

export interface PreAccGuardSummary {
  intents_evaluated_24h: number
  passed_guards_24h: number
  rejected_24h: number
  sent_to_dlq_24h: number
}

export interface GuardFailureListResponse {
  items: GuardFailure[]
  summary: PreAccGuardSummary
  rules: GuardRule[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}
