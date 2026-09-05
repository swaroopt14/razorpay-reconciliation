package persistence

import (
	"strconv"
	"strings"

	"zord-intent-engine/internal/models"
)

// INT-09: "Keep the 91-column outbox stable but add an automated contract
// inventory." Before this file existed, the outbox INSERT's column list and
// its per-row argument list were each hand-typed twice — once in Save's
// single-row statement, once in SaveBatch's multi-row statement — four
// independently-maintained lists that had to stay in the exact same order
// by eye, with only a human-written "// $N" comment as a sync aid. A column
// added to one and forgotten in another is exactly the class of bug the
// audit item describes ("manual changes can break INSERT ... mapping").
//
// OutboxInsertColumns and OutboxInsertArgs are now the single source of
// truth: both Save and SaveBatch build their query text and argument lists
// from these, so there is exactly one place to update when a column is
// added, and the query's placeholder count can never drift from the column
// list or the argument count — they're derived from the same list, not
// re-typed.
//
// Column order here is unchanged from the pre-refactor query text (verified
// byte-for-byte against the original inline query in
// TestINT09_SingleRowInsertQuery_MatchesPreRefactorQueryText).
var OutboxInsertColumns = []string{
	"trace_id", "envelope_id", "tenant_id", "contract_id",
	"aggregate_type", "aggregate_id", "event_type", "schema_version",
	"amount", "currency", "idempotency_key", "salient_hash",
	"intent_type", "canonical_version", "intended_execution_at",
	"constraints", "beneficiary_type", "pii_tokens", "beneficiary",
	"intent_status", "confidence_score", "canonical_hash",
	"canonical_snapshot_ref", "nir_snapshot_ref", "governance_snapshot_ref", "governance_hash",
	"client_payout_ref", "provider_hint", "request_fingerprint", "routing_hints_json",
	"governance_state", "business_state", "duplicate_risk_flag",
	"mapping_profile_id", "mapping_profile_version", "source_system",
	"business_idempotency_key", "beneficiary_fingerprint",
	"proof_readiness_score", "matchability_score", "intent_quality_score",
	"mapping_confidence_score", "schema_completeness_score",
	"governance_reason_codes_json", "duplicate_reason_code",
	"client_batch_ref", "payload", "payload_hash", "status",
	"retry_count", "next_attempt_at", "created_at", "batchid",
	"source_row_num", "aggregate_confidence_score",
	"required_fields_status", "tokenization_status", "governance_decision",
	"payment_instruction_received", "canonical_intent_created",
	"intent_lifecycle_state", "mapping_profile_hash",
	"policy_source", "policy_version", "policy_hash",
	"reference_quality_score", "duplicate_risk_score", "score_version",
	"score_validity_status", "score_breakdown_json", "score_reason_codes_json", "scored_at",
	"source_row_ref", "canonical_row_hash",
	"input_facts_hash", "tokenized_data_hash",
	"raw_row_evidence_leaf_hash", "canonical_row_evidence_leaf_hash",
	"raw_row_hash",
	"artifact_id", "artifact_version_id",
}

// OutboxDeprecatedColumns are the five R-10 batch-aggregate columns that
// still exist on the outbox table (DB-comment-flagged as deprecated in
// db/migrations/20260723070000_deprecate_outbox_batch_aggregate_columns.sql)
// but must never reappear as an OutboxEvent Go field or an INSERT column —
// the live, actively-written per-batch versions of these same metrics
// belong on CanonicalBatch/canonical_batches instead (see outbox_model.go's
// doc comment). Recorded here so a test can assert both OutboxInsertColumns
// and models.OutboxEvent never reintroduce one of these names.
var OutboxDeprecatedColumns = []string{
	"batch_quality_score",
	"avg_reference_quality",
	"avg_duplicate_risk",
	"low_matchability_count",
	"duplicate_risk_count",
}

// OutboxInsertArgs returns the bind values for one outbox row, in exactly
// the order OutboxInsertColumns declares. The single source of truth both
// Save and SaveBatch use instead of a hand-typed copy each.
func OutboxInsertArgs(outbox models.OutboxEvent) []any {
	return []any{
		outbox.TraceID, outbox.EnvelopeID, outbox.TenantID, outbox.ContractID,
		outbox.AggregateType, outbox.AggregateID, outbox.EventType, outbox.SchemaVersion,
		outbox.Amount, outbox.Currency, outbox.IdempotencyKey, outbox.SalientHash,
		outbox.IntentType, outbox.CanonicalVersion, outbox.IntendedExecutionAt,
		outbox.Constraints, outbox.BeneficiaryType, outbox.PIITokens, outbox.Beneficiary,
		outbox.IntentStatus, outbox.ConfidenceScore, outbox.CanonicalHash,
		outbox.CanonicalSnapshotRef, outbox.NIRSnapshotRef, outbox.GovernanceSnapshotRef, outbox.GovernanceHash,
		outbox.ClientPayoutRef, outbox.ProviderHint, outbox.RequestFingerprint, outbox.RoutingHintsJSON,
		outbox.GovernanceState, outbox.BusinessState, outbox.DuplicateRiskFlag,
		outbox.MappingProfileID, outbox.MappingProfileVersion, outbox.SourceSystem,
		outbox.BusinessIdempotencyKey, outbox.BeneficiaryFingerprint,
		outbox.ProofReadinessScore, outbox.MatchabilityScore, outbox.IntentQualityScore,
		outbox.MappingConfidenceScore, outbox.SchemaCompletenessScore,
		outbox.GovernanceReasonCodesJSON, outbox.DuplicateReasonCode,
		outbox.ClientBatchRef, outbox.Payload, outbox.PayloadHash, outbox.Status,
		outbox.RetryCount, outbox.NextRetryAt, outbox.CreatedAt, outbox.BatchID,
		outbox.SourceRowNum, outbox.AggregateConfidenceScore,
		outbox.RequiredFieldsStatus, outbox.TokenizationStatus, outbox.GovernanceDecision,
		outbox.PaymentInstructionReceived, outbox.CanonicalIntentCreated,
		outbox.IntentLifecycleState, outbox.MappingProfileHash,
		outbox.PolicySource, outbox.PolicyVersion, outbox.PolicyHash,
		outbox.ReferenceQualityScore, outbox.DuplicateRiskScore, outbox.ScoreVersion,
		outbox.ScoreValidityStatus, outbox.ScoreBreakdownJSON, outbox.ScoreReasonCodesJSON, outbox.ScoredAt,
		outbox.SourceRowRef, outbox.CanonicalRowHash,
		outbox.GovernanceInputFactsHash, outbox.TokenizedDataHash,
		outbox.RawRowEvidenceLeafHash, outbox.CanonicalRowEvidenceLeafHash,
		outbox.RawRowHash,
		outbox.ArtifactID, outbox.ArtifactVersionID,
	}
}

// buildOutboxInsertQuerySingle generates the single-row
// "INSERT INTO outbox (...) VALUES ($1,...,$N)" statement from
// OutboxInsertColumns, so the column list and its placeholder count can
// never drift apart — there is only one list, not two.
func buildOutboxInsertQuerySingle() string {
	placeholders := make([]string, len(OutboxInsertColumns))
	for i := range OutboxInsertColumns {
		placeholders[i] = "$" + strconv.Itoa(i+1)
	}
	return "INSERT INTO outbox (\n    " +
		strings.Join(OutboxInsertColumns, ",\n    ") +
		"\n) VALUES (\n    " +
		strings.Join(placeholders, ",") +
		"\n)"
}

// buildOutboxInsertQueryBatch generates the multi-row
// "INSERT INTO outbox (...) VALUES ($1,...,$N),($N+1,...,$2N),..."
// statement for rowCount rows, from the same OutboxInsertColumns list
// buildOutboxInsertQuerySingle uses.
func buildOutboxInsertQueryBatch(rowCount int) (query string, argsPerRow int) {
	argsPerRow = len(OutboxInsertColumns)
	rowPlaceholders := make([]string, rowCount)
	for r := 0; r < rowCount; r++ {
		base := r * argsPerRow
		ph := make([]string, argsPerRow)
		for c := 0; c < argsPerRow; c++ {
			ph[c] = "$" + strconv.Itoa(base+c+1)
		}
		rowPlaceholders[r] = "(" + strings.Join(ph, ",") + ")"
	}
	query = "INSERT INTO outbox (\n    " +
		strings.Join(OutboxInsertColumns, ",\n    ") +
		"\n) VALUES " +
		strings.Join(rowPlaceholders, ",")
	return query, argsPerRow
}
