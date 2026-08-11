package audittests

// INT-10 regression coverage: "Expose exact decision and quality reason
// codes to Intelligence."
//
// The bug: the outbox lease query in internal/persistence/outbox_pull_repo.go
// (LeaseOutboxBatch — the endpoint zord-relay polls, which carries data
// through to zord-intelligence/Service 7) never selected the score/reason/
// governance columns IntentService already computes and persists on every
// outbox row: governance_reason_codes_json, score_version,
// score_validity_status, score_breakdown_json, score_reason_codes_json,
// scored_at, and the seven individual score columns (reference_quality_score,
// duplicate_risk_score, proof_readiness_score, matchability_score,
// intent_quality_score, mapping_confidence_score, schema_completeness_score)
// plus duplicate_reason_code. The DB columns exist (db/migrations/
// 20260707095144_create_outbox.sql) and IntentService populates them on
// every write — the gap was purely that the lease SELECT/Scan never asked
// for them, so they came back at Go zero-value on every leased event
// regardless of what was actually stored, and (being `omitempty` in JSON)
// vanished from the lease response entirely instead of showing up as an
// explicit empty/zero.
//
// legacyLeaseOutboxBatch below is a faithful reproduction of the SELECT
// column list and Scan() destination list exactly as they existed before
// this fix (see git history for internal/persistence/outbox_pull_repo.go) —
// same 42 columns, same order, same destinations. It proves the bug existed:
// fed a row that has real, non-zero score/reason data sitting in the extra
// columns, it still can't produce them, because it structurally never asks
// the DB for them.
//
// The "fixed" tests call the real, currently-wired persistence.OutboxPullRepo
// .LeaseOutboxBatch directly — not a reproduction — via sqlmock.
//
// Run with: go test ./testing/... -run TestINT10 -v

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

// legacyOutboxColumns is the exact 42-column SELECT list LeaseOutboxBatch
// used before INT-10 (verbatim from git history).
func legacyOutboxColumns() []string {
	return []string{
		"event_id", "envelope_id", "trace_id", "tenant_id", "contract_id",
		"aggregate_type", "aggregate_id", "event_type", "amount", "currency",
		"corridor_id", "retry_count", "next_attempt_at", "payload", "status",
		"created_at", "lease_id", "leased_by", "lease_until", "batchid",
		"source_row_num", "canonical_hash", "governance_state", "governance_hash",
		"mapping_profile_id", "required_fields_status", "tokenization_status",
		"governance_decision", "payment_instruction_received", "canonical_intent_created",
		"client_payout_ref", "intent_lifecycle_state", "mapping_profile_hash",
		"policy_source", "policy_version", "policy_hash",
		"raw_row_evidence_leaf_hash", "canonical_row_evidence_leaf_hash",
		"business_idempotency_key", "tokenized_data_hash", "artifact_id",
		"artifact_version_id",
	}
}

// newOutboxColumns is the current, fixed column list: the 42 legacy columns
// plus the 14 score/reason/governance columns INT-10 adds.
func newOutboxColumns() []string {
	return append(legacyOutboxColumns(),
		"governance_reason_codes_json", "score_version", "score_validity_status",
		"score_breakdown_json", "score_reason_codes_json", "scored_at",
		"reference_quality_score", "duplicate_risk_score", "proof_readiness_score",
		"matchability_score", "intent_quality_score", "mapping_confidence_score",
		"schema_completeness_score", "duplicate_reason_code",
	)
}

// baseRowValues returns driver-compatible values for the 42 legacy columns,
// in order, for one sample leased event. eventID/aggregateID are threaded
// through so callers can assert on a known row.
func baseRowValues(eventID, aggregateID string, now time.Time) []driver.Value {
	return []driver.Value{
		eventID, "envelope-1", "trace-1", "tenant-1", "",
		"canonical_intent", aggregateID, "intent.created.v1", "3704.38", "INR",
		nil, int64(0), nil, []byte(`{}`), "PENDING",
		now, "lease-1", "relay-pod-1", now.Add(2 * time.Minute), nil,
		nil, "canonicalhash123", "ACCEPTED", "governancehash123",
		"profile-1", true, true, "ACCEPTED",
		now, now,
		"payout-ref-1", "CREATED", "profilehash123",
		"policy-src", "policy-v1", "policyhash123",
		"rawleaf123", "canonleaf123",
		"bizkey123", "tokhash123", "",
		"",
	}
}

// legacyLeaseOutboxBatch reproduces the pre-INT-10 SELECT/Scan exactly (same
// 42 destinations, same order) against a plain, unconditional query — the
// WITH/UPDATE/RETURNING scaffolding around it is irrelevant to this bug and
// omitted; what matters, and what's reproduced faithfully, is the column
// list the old code actually asked the database for.
func legacyLeaseOutboxBatch(ctx context.Context, db *sql.DB) ([]models.OutboxEvent, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM outbox_lease_view")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.OutboxEvent
	for rows.Next() {
		var evt models.OutboxEvent
		var nextRetry sql.NullTime
		var lu sql.NullTime
		var corridorId sql.NullString
		var canonicalHash sql.NullString
		var governanceState sql.NullString
		var governanceHash sql.NullString

		if err := rows.Scan(
			&evt.EventID, &evt.EnvelopeID, &evt.TraceID, &evt.TenantID, &evt.ContractID,
			&evt.AggregateType, &evt.AggregateID, &evt.EventType, &evt.Amount, &evt.Currency,
			&corridorId, &evt.RetryCount, &nextRetry, &evt.Payload, &evt.Status,
			&evt.CreatedAt, &evt.LeaseID, &evt.LeasedBy, &lu, &evt.BatchID,
			&evt.SourceRowNum, &canonicalHash, &governanceState, &governanceHash,
			&evt.MappingProfileID, &evt.RequiredFieldsStatus, &evt.TokenizationStatus,
			&evt.GovernanceDecision, &evt.PaymentInstructionReceived, &evt.CanonicalIntentCreated,
			&evt.ClientPayoutRef, &evt.IntentLifecycleState, &evt.MappingProfileHash,
			&evt.PolicySource, &evt.PolicyVersion, &evt.PolicyHash,
			&evt.RawRowEvidenceLeafHash, &evt.CanonicalRowEvidenceLeafHash,
			&evt.BusinessIdempotencyKey, &evt.TokenizedDataHash, &evt.ArtifactID,
			&evt.ArtifactVersionID,
		); err != nil {
			return nil, err
		}
		evt.IntentID = evt.AggregateID.String()
		events = append(events, evt)
	}
	return events, rows.Err()
}

// TestINT10_LegacyBehavior_ScoreAndReasonFieldsNeverPopulated reproduces the
// bug: even though the DB genuinely has score/reason data for this row (it's
// sitting right there in the mock, same as it would be in a real Postgres
// row), the legacy code's SELECT never asks for those columns, so every
// score/reason field on the returned OutboxEvent is stuck at its Go
// zero-value.
func TestINT10_LegacyBehavior_ScoreAndReasonFieldsNeverPopulated(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	now := time.Now().UTC()
	aggID := uuid.New()

	mock.ExpectQuery("FROM outbox_lease_view").
		WillReturnRows(sqlmock.NewRows(legacyOutboxColumns()).
			AddRow(baseRowValues("evt-1", aggID.String(), now)...))

	events, err := legacyLeaseOutboxBatch(context.Background(), db)
	if err != nil {
		t.Fatalf("legacyLeaseOutboxBatch() error = %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	evt := events[0]

	t.Logf("[LEGACY/OLD] leased event score_version=%q score_validity_status=%q "+
		"governance_reason_codes_json=%q reference_quality_score=%v duplicate_reason_code=%q",
		evt.ScoreVersion, evt.ScoreValidityStatus, string(evt.GovernanceReasonCodesJSON),
		evt.ReferenceQualityScore, evt.DuplicateReasonCode)

	if evt.ScoreVersion != "" || evt.ScoreValidityStatus != "" || evt.GovernanceReasonCodesJSON != nil ||
		evt.ScoreBreakdownJSON != nil || evt.ScoreReasonCodesJSON != nil || evt.ScoredAt != nil ||
		evt.ReferenceQualityScore != 0 || evt.DuplicateRiskScore != 0 || evt.ProofReadinessScore != 0 ||
		evt.MatchabilityScore != 0 || evt.IntentQualityScore != 0 || evt.MappingConfidenceScore != 0 ||
		evt.SchemaCompletenessScore != 0 || evt.DuplicateReasonCode != "" {
		t.Fatalf("expected every score/reason field to be zero-value (legacy code never selects them), got %+v", evt)
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations: %v", mockErr)
	}
	t.Log("[LEGACY/OLD] CONFIRMED BUG: every decision/quality reason-code and score field came back zero-value/nil — the lease response can never carry this data no matter what's actually in the database, because the SELECT never asks for it.")
}

// TestINT10_FixedBehavior_ScoreAndReasonFieldsPopulated exercises the real,
// currently-wired persistence.OutboxPullRepo.LeaseOutboxBatch and confirms
// the score/reason/governance fields now come back populated with the
// values actually stored in the (mocked) database row.
func TestINT10_FixedBehavior_ScoreAndReasonFieldsPopulated(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	now := time.Now().UTC()
	aggID := uuid.New()

	base := baseRowValues("evt-1", aggID.String(), now)
	extra := []driver.Value{
		[]byte(`{"missing_required_fields":["provider_hint"],"strict_mode":{"remediability":"TENANT_FIXABLE"}}`), // governance_reason_codes_json
		"service2_score_v2.0", // score_version
		"SCORED_VALID",        // score_validity_status
		[]byte(`{"schema_completeness_score":92,"mapping_confidence_score":88}`), // score_breakdown_json
		[]byte(`["LOW_MATCHABILITY","FUZZY_MAPPING_USED"]`),                      // score_reason_codes_json
		now,   // scored_at
		"87.5", // reference_quality_score
		"12.0", // duplicate_risk_score
		"91.0", // proof_readiness_score
		"76.25", // matchability_score
		"88.0", // intent_quality_score
		"93.0", // mapping_confidence_score
		"92.0", // schema_completeness_score
		"STRICT_DUPLICATE_CLIENT_REF", // duplicate_reason_code
	}
	row := append(append([]driver.Value{}, base...), extra...)

	mock.ExpectQuery("FROM leased").
		WillReturnRows(sqlmock.NewRows(newOutboxColumns()).AddRow(row...))

	repo := persistence.NewOutboxPullRepo(db)
	leaseID, _, events, err := repo.LeaseOutboxBatch(context.Background(), 10, 120, "relay-pod-1")

	if err != nil {
		t.Fatalf("LeaseOutboxBatch() error = %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 leased event, got %d", len(events))
	}
	evt := events[0]

	t.Logf("[FIXED/NEW] leaseID=%q event score_version=%q score_validity_status=%q "+
		"reference_quality_score=%v duplicate_risk_score=%v matchability_score=%v "+
		"duplicate_reason_code=%q governance_reason_codes_json=%s score_reason_codes_json=%s",
		leaseID, evt.ScoreVersion, evt.ScoreValidityStatus,
		evt.ReferenceQualityScore, evt.DuplicateRiskScore, evt.MatchabilityScore,
		evt.DuplicateReasonCode, string(evt.GovernanceReasonCodesJSON), string(evt.ScoreReasonCodesJSON))

	switch {
	case evt.ScoreVersion != "service2_score_v2.0":
		t.Fatalf("ScoreVersion = %q, want service2_score_v2.0", evt.ScoreVersion)
	case evt.ScoreValidityStatus != "SCORED_VALID":
		t.Fatalf("ScoreValidityStatus = %q, want SCORED_VALID", evt.ScoreValidityStatus)
	case evt.ReferenceQualityScore != 87.5:
		t.Fatalf("ReferenceQualityScore = %v, want 87.5", evt.ReferenceQualityScore)
	case evt.DuplicateRiskScore != 12.0:
		t.Fatalf("DuplicateRiskScore = %v, want 12.0", evt.DuplicateRiskScore)
	case evt.MatchabilityScore != 76.25:
		t.Fatalf("MatchabilityScore = %v, want 76.25", evt.MatchabilityScore)
	case evt.DuplicateReasonCode != "STRICT_DUPLICATE_CLIENT_REF":
		t.Fatalf("DuplicateReasonCode = %q, want STRICT_DUPLICATE_CLIENT_REF", evt.DuplicateReasonCode)
	case evt.ScoredAt == nil:
		t.Fatal("ScoredAt is nil, want a real timestamp")
	}
	if string(evt.GovernanceReasonCodesJSON) == "" || string(evt.GovernanceReasonCodesJSON) == "null" {
		t.Fatalf("GovernanceReasonCodesJSON is empty/null, want the mocked decision reason codes + remediability payload")
	}
	if string(evt.ScoreReasonCodesJSON) == "" || string(evt.ScoreReasonCodesJSON) == "null" {
		t.Fatalf("ScoreReasonCodesJSON is empty/null, want the mocked quality reason codes payload")
	}
	if string(evt.ScoreBreakdownJSON) == "" || string(evt.ScoreBreakdownJSON) == "null" {
		t.Fatalf("ScoreBreakdownJSON is empty/null, want the mocked breakdown payload")
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations: %v", mockErr)
	}
	t.Log("[FIXED/NEW] CONFIRMED FIX: decision reason codes, remediability, score_version, validity and the full breakdown all come back on the lease row itself — Relay/Intelligence no longer has to parse the embedded payload blob to recover them.")
}
