/** zord-evidence HTTP JSON shapes (list + full pack). Optional fields match extended deployments. */

export type ApiEvidenceItem = {
  type: string
  ref: string
  hash?: string
  schema_version: string
  leaf_hash?: string
}

export type EvidencePackSummaryRow = {
  evidence_pack_id: string
  tenant_id: string
  intent_id?: string
  /** Client payout reference when returned on pack summary (extension). */
  client_reference?: string
  client_payout_ref?: string
  contract_id?: string
  /** Present when the service lists packs scoped to a batch (extension / migration). */
  batch_id?: string
  mode: string
  pack_status: string
  merkle_root: string
  ruleset_version: string
  supersedes_pack_id?: string
  created_at: string
  /** Extended Service 6 fields (optional per deployment). */
  proof_status?: string
  proof_score?: number
  artifact_count?: number
  leaf_count?: number
  required_leaf_count?: number
  missing_artifact_count?: number
  verification_status?: string | boolean
  last_verified_at?: string
  export_count?: number

  /** Intent / settlement lifecycle metadata returned by intent-pack listings. */
  pack_completeness_score?: number
  settlement_leaf_present_flag?: boolean
  attachment_decision_leaf_present_flag?: boolean
  payment_instruction_received?: string
  canonical_intent_created?: string
  mapping_profile_used?: string
  required_fields_status?: boolean
  tokenization_status?: boolean
  governance_decision?: string
  settlement_record_received?: string
  canonical_settlement_created?: string
  bank_reference?: string
  attachment_decision?: string
  match_confidence?: number
  value_date_check?: boolean
  amount_match?: boolean

  /** Expanded detail fields that may be present in list payloads on some deployments. */
  proof_components?: {
    payment_instruction_available?: boolean
    settlement_record_available?: boolean
    match_decision_available?: boolean
    governance_decision_available?: boolean
    replay_check_passed?: boolean
  }
}

export type ListPacksResponse = {
  packs: EvidencePackSummaryRow[]
  total: number
}

export type EvidenceTimelineEntry = {
  timestamp: string
  event: string
  node_id: string
}

export type EvidencePackTimelineResponse = {
  evidence_pack_id: string
  intent_id: string
  timeline: EvidenceTimelineEntry[]
}

export type EvidenceLineageNode = {
  id: string
  label: string
  node_type?: string
  leaf_hash?: string
  item_ref?: string
  schema_version?: string
}

export type EvidenceLineageEdge = {
  from: string
  to: string
  label?: string
}

export type EvidencePackLineageGraphResponse = {
  evidence_pack_id: string
  tenant_id?: string
  intent_id?: string
  merkle_root?: string
  nodes: EvidenceLineageNode[]
  edges: EvidenceLineageEdge[]
}

export type EvidencePackVerifyResponse = {
  status: string
  evidence_pack_id: string
  checked_at: string
  stored_root: string
  computed_root?: string
  explanation: string
}

export type EvidencePackFull = {
  evidence_pack_id: string
  tenant_id: string
  intent_id: string
  /** Optional metadata extensions (deployment-dependent). */
  batch_id?: string
  client_reference?: string
  client_payout_ref?: string
  amount?: string | number | null
  amount_minor?: string | number | null
  contract_id: string
  mode: string
  pack_status: string
  items: ApiEvidenceItem[]
  merkle_root: string
  ruleset_version: string
  schema_versions?: Record<string, string> & {
    intent?: string
    outcome?: string
    contract?: string
    attachment?: string
    intent_schema?: string
    outcome_schema?: string
    contract_schema?: string
    attachment_schema?: string
  }
  signatures?: { signer: string; alg: string; sig: string; signed_at: string }[]
  supersedes_pack_id?: string
  created_at: string
  proof_status?: string
  proof_score?: number
  artifact_count?: number
  leaf_count?: number
  required_leaf_count?: number
  missing_artifact_count?: number
  verification_status?: string | boolean
  last_verified_at?: string
  export_count?: number
  generated_by?: string

  /** Service-extended fields for proof reasoning and lifecycle. */
  pack_completeness_score?: number
  settlement_leaf_present_flag?: boolean
  attachment_decision_leaf_present_flag?: boolean
  payment_instruction_received?: string
  canonical_intent_created?: string
  mapping_profile_used?: string
  required_fields_status?: boolean
  tokenization_status?: boolean
  governance_decision?: string
  settlement_record_received?: string
  canonical_settlement_created?: string
  bank_reference?: string
  attachment_decision?: string
  match_confidence?: number
  value_date_check?: boolean
  amount_match?: boolean

  proof_score_breakdown?: {
    score?: number
    components?: Array<{
      check?: string
      weight?: number
      passed?: boolean
      deduction?: number
    }>
    deductions?: unknown
  }
  proof_components?: {
    payment_instruction_available?: boolean
    settlement_record_available?: boolean
    match_decision_available?: boolean
    governance_decision_available?: boolean
    replay_check_passed?: boolean
  }
  cryptographic_signatures?: {
    raw_intent_hash?: string
    raw_settlement_hash?: string
    canonical_settlement_hash?: string
    attachment_decision_hash?: string
    governance_decision_hash?: string
    final_evidence_view_hash?: string
  }
}
