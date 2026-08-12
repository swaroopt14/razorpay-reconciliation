package persistence

import "strings"

// INT-09: "test ... lease ... schemas." LeaseOutboxBatch's query used to
// hand-maintain the SAME 56-column list twice in one query string: once as
// `<expr> AS <alias>` inside the UPDATE...RETURNING clause, and again as
// the bare `<alias>` list in the outer SELECT that reads from it. Nothing
// tied those two lists together — a column added to one and forgotten in
// the other would silently break the lease response (RETURNING controls
// what the CTE actually produces; SELECT controls what the caller's Scan()
// destinations receive).
//
// outboxLeaseColumns is now the single source of truth: each entry's expr
// drives the RETURNING clause, its alias drives both the RETURNING "AS" and
// the outer SELECT — one list instead of two.
type outboxLeaseColumn struct {
	expr  string // the RETURNING-side expression (may be a plain "o.<col>", a COALESCE(...), a cast, or a literal like "NULL")
	alias string // the column name Scan() reads by position — must match models.OutboxEvent's Scan order in LeaseOutboxBatch
}

var outboxLeaseColumns = []outboxLeaseColumn{
	{"o.event_id::text", "event_id"},
	{"COALESCE(o.envelope_id::text, '')", "envelope_id"},
	{"COALESCE(o.trace_id::text, '')", "trace_id"},
	{"COALESCE(o.tenant_id::text, '')", "tenant_id"},
	{"COALESCE(o.contract_id::text, '')", "contract_id"},
	{"o.aggregate_type", "aggregate_type"},
	{"o.aggregate_id", "aggregate_id"},
	{"o.event_type", "event_type"},
	{"o.amount", "amount"},
	{"o.currency", "currency"},
	{"NULL", "corridor_id"},
	{"o.retry_count", "retry_count"},
	{"o.next_attempt_at", "next_attempt_at"},
	{"o.payload", "payload"},
	{"o.status", "status"},
	{"o.created_at", "created_at"},
	{"COALESCE(o.lease_id::text, '')", "lease_id"},
	{"COALESCE(o.leased_by, '')", "leased_by"},
	{"o.lease_until", "lease_until"},
	{"o.batchid", "batchid"},
	{"o.source_row_num", "source_row_num"},
	{"o.canonical_hash", "canonical_hash"},
	{"o.governance_state", "governance_state"},
	{"o.governance_hash", "governance_hash"},
	{"o.mapping_profile_id", "mapping_profile_id"},
	{"o.required_fields_status", "required_fields_status"},
	{"o.tokenization_status", "tokenization_status"},
	{"o.governance_decision", "governance_decision"},
	{"o.payment_instruction_received", "payment_instruction_received"},
	{"o.canonical_intent_created", "canonical_intent_created"},
	{"COALESCE(o.client_payout_ref, '')", "client_payout_ref"},
	{"COALESCE(o.intent_lifecycle_state, '')", "intent_lifecycle_state"},
	{"COALESCE(o.mapping_profile_hash, '')", "mapping_profile_hash"},
	{"COALESCE(o.policy_source, '')", "policy_source"},
	{"COALESCE(o.policy_version, '')", "policy_version"},
	{"COALESCE(o.policy_hash, '')", "policy_hash"},
	{"COALESCE(o.raw_row_evidence_leaf_hash, '')", "raw_row_evidence_leaf_hash"},
	{"COALESCE(o.canonical_row_evidence_leaf_hash, '')", "canonical_row_evidence_leaf_hash"},
	{"COALESCE(o.business_idempotency_key, '')", "business_idempotency_key"},
	{"COALESCE(o.tokenized_data_hash, '')", "tokenized_data_hash"},
	{"COALESCE(o.artifact_id, '')", "artifact_id"},
	{"COALESCE(o.artifact_version_id, '')", "artifact_version_id"},
	// INT-10: decision/quality reason codes and score fields are computed by
	// IntentService (see intent_service.go computeScores/
	// aggregateGovernanceReasons) and persisted on every outbox row.
	{"COALESCE(o.governance_reason_codes_json, '{}'::jsonb)", "governance_reason_codes_json"},
	{"COALESCE(o.score_version, '')", "score_version"},
	{"COALESCE(o.score_validity_status, '')", "score_validity_status"},
	{"COALESCE(o.score_breakdown_json, '{}'::jsonb)", "score_breakdown_json"},
	{"COALESCE(o.score_reason_codes_json, '[]'::jsonb)", "score_reason_codes_json"},
	{"o.scored_at", "scored_at"},
	{"COALESCE(o.reference_quality_score, 0)", "reference_quality_score"},
	{"COALESCE(o.duplicate_risk_score, 0)", "duplicate_risk_score"},
	{"COALESCE(o.proof_readiness_score, 0)", "proof_readiness_score"},
	{"COALESCE(o.matchability_score, 0)", "matchability_score"},
	{"COALESCE(o.intent_quality_score, 0)", "intent_quality_score"},
	{"COALESCE(o.mapping_confidence_score, 0)", "mapping_confidence_score"},
	{"COALESCE(o.schema_completeness_score, 0)", "schema_completeness_score"},
	{"COALESCE(o.duplicate_reason_code, '')", "duplicate_reason_code"},
}

// OutboxLeaseColumnAliases returns just the alias list, in order — the
// exact order LeaseOutboxBatch's rows.Scan() destinations must follow, and
// the contract inventory's record of what the lease response carries.
func OutboxLeaseColumnAliases() []string {
	aliases := make([]string, len(outboxLeaseColumns))
	for i, c := range outboxLeaseColumns {
		aliases[i] = c.alias
	}
	return aliases
}

// buildOutboxLeaseReturningSQL generates the RETURNING clause's
// "<expr> AS <alias>, ..." list from outboxLeaseColumns.
func buildOutboxLeaseReturningSQL() string {
	parts := make([]string, len(outboxLeaseColumns))
	for i, c := range outboxLeaseColumns {
		parts[i] = c.expr + " AS " + c.alias
	}
	return strings.Join(parts, ",\n\t\t")
}

// buildOutboxLeaseSelectSQL generates the outer SELECT's bare alias list
// from the same outboxLeaseColumns — so it can never list a different
// column, in a different order, than what RETURNING actually produced.
func buildOutboxLeaseSelectSQL() string {
	return strings.Join(OutboxLeaseColumnAliases(), ",\n\t")
}
