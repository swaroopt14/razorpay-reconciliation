package persistence_test

// action_contract_phase5_test.go — Phase 5 (refactor) integration tests for
// the action_contracts/actuation_outbox hardening columns. TEST_DB_URL-gated
// (see setupTestDB in projection_repo_test.go).

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// TestActionContractRepo_Phase5FieldsRoundTrip verifies every new Phase 5
// (refactor) column survives an InsertIfNew → GetByID round trip intact —
// the same guarantee Phase 3's projection_meta round-trip tests establish
// for projection_state.
func TestActionContractRepo_Phase5FieldsRoundTrip(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	repo := persistence.NewActionContractRepo(pool)

	signedAt := time.Now().UTC().Truncate(time.Microsecond)
	mappingID := "mp_1"

	ac := models.ActionContract{
		ActionID:       "act_" + uuid.New().String(),
		TenantID:       uniqueTenant("ac_phase5"),
		PolicyID:       "P_TEST_ROUNDTRIP",
		PolicyVersion:  1,
		ScopeRefs:      models.ScopeRefs{IntentID: "int_1"},
		InputRefsJSON:  `{"projection_key":"leakage.total","value":785000}`,
		Decision:       models.DecisionEscalate,
		Confidence:     0.9,
		PayloadJSON:    `{"severity":"HIGH"}`,
		IntegrityDigest: "devsig:abc123",
		IdempotencyKey: uuid.New().String(),
		ContractStatus: models.ContractStatusActive,
		CreatedAt:      time.Now().UTC(),

		PolicyRegistryID:            "", // left empty on purpose — no policy_definitions row for this synthetic test id
		PolicySource:                "zpi_seed",
		PolicyDigest:                "digestABC",
		ScopeType:                   "INTENT",
		ScopeRef:                    "int_1",
		TriggerEventID:              "trig_1",
		TriggerEventSource:          "zord-relay",
		TriggerEventType:            "outcome.event.normalized",
		TriggerEventVersion:         "legacy",
		InputFactsHash:              "inputHash123",
		PayloadHash:                 "payloadHash123",
		PayloadSchemaVersion:        "legacy",
		MappingProfileID:            &mappingID,
		SignatureAlgorithm:          "DEV_SHA256",
		SignatureKeyID:              "dev-key-1",
		SignaturePayloadHash:        "sigPayloadHash123",
		CanonicalizationVersion:     "v1",
		SignedAt:                    &signedAt,
		SignatureVerificationStatus: "UNVERIFIED",
	}

	if err := repo.InsertIfNew(ctx, ac); err != nil {
		t.Fatalf("InsertIfNew: %v", err)
	}

	got, err := repo.GetByID(ctx, ac.ActionID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got == nil {
		t.Fatal("GetByID returned nil for a just-inserted action contract")
	}

	checks := []struct {
		name      string
		got, want string
	}{
		{"PolicySource", got.PolicySource, ac.PolicySource},
		{"PolicyDigest", got.PolicyDigest, ac.PolicyDigest},
		{"ScopeType", got.ScopeType, ac.ScopeType},
		{"ScopeRef", got.ScopeRef, ac.ScopeRef},
		{"TriggerEventID", got.TriggerEventID, ac.TriggerEventID},
		{"TriggerEventSource", got.TriggerEventSource, ac.TriggerEventSource},
		{"TriggerEventType", got.TriggerEventType, ac.TriggerEventType},
		{"TriggerEventVersion", got.TriggerEventVersion, ac.TriggerEventVersion},
		{"InputFactsHash", got.InputFactsHash, ac.InputFactsHash},
		{"PayloadHash", got.PayloadHash, ac.PayloadHash},
		{"PayloadSchemaVersion", got.PayloadSchemaVersion, ac.PayloadSchemaVersion},
		{"SignatureAlgorithm", got.SignatureAlgorithm, ac.SignatureAlgorithm},
		{"SignatureKeyID", got.SignatureKeyID, ac.SignatureKeyID},
		{"SignaturePayloadHash", got.SignaturePayloadHash, ac.SignaturePayloadHash},
		{"CanonicalizationVersion", got.CanonicalizationVersion, ac.CanonicalizationVersion},
		{"SignatureVerificationStatus", got.SignatureVerificationStatus, ac.SignatureVerificationStatus},
	}
	for _, c := range checks {
		if c.got != c.want {
			t.Errorf("%s = %q, want %q", c.name, c.got, c.want)
		}
	}
	if got.MappingProfileID == nil || *got.MappingProfileID != mappingID {
		t.Errorf("MappingProfileID = %v, want %q", got.MappingProfileID, mappingID)
	}
	if got.SignedAt == nil || !got.SignedAt.Equal(signedAt) {
		t.Errorf("SignedAt = %v, want %v", got.SignedAt, signedAt)
	}
}

// TestOutboxRepo_Phase5FieldsRoundTrip verifies actuation_outbox's new
// tenant/scope/payload_hash columns survive an InsertTx → FetchPending round
// trip, and that MarkFailed persists last_error.
func TestOutboxRepo_Phase5FieldsRoundTrip(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	actionRepo := persistence.NewActionContractRepo(pool)
	outboxRepo := persistence.NewOutboxRepo(pool)

	tenantID := uniqueTenant("outbox_phase5")
	actionID := "act_" + uuid.New().String()
	ac := models.ActionContract{
		ActionID: actionID, TenantID: tenantID, PolicyID: "P_TEST_OUTBOX", PolicyVersion: 1,
		ScopeRefs: models.ScopeRefs{IntentID: "int_1"}, InputRefsJSON: `{}`,
		Decision: models.DecisionEscalate, Confidence: 1.0, PayloadJSON: `{}`,
		IntegrityDigest: "devsig:abc", IdempotencyKey: uuid.New().String(),
		ContractStatus: models.ContractStatusActive, CreatedAt: time.Now().UTC(),
		ScopeType: "INTENT", ScopeRef: "int_1",
	}
	if err := actionRepo.InsertIfNew(ctx, ac); err != nil {
		t.Fatalf("InsertIfNew action contract: %v", err)
	}

	entry := models.ActuationOutbox{
		EventID: "evt_" + uuid.New().String(), ActionID: actionID,
		EventType: string(models.DecisionEscalate), Payload: `{"severity":"HIGH"}`,
		Status: models.OutboxStatusPending, Attempts: 0,
		NextRetryAt: time.Now().UTC().Add(-time.Second), // already due
		CreatedAt:   time.Now().UTC(),
		TenantID:    tenantID, ScopeType: "INTENT", ScopeRef: "int_1",
		PayloadHash: "outboxPayloadHash123", PayloadSchemaVersion: "legacy",
	}
	if err := outboxRepo.Insert(ctx, entry); err != nil {
		t.Fatalf("Insert outbox: %v", err)
	}

	entries, err := outboxRepo.FetchPending(ctx, 50)
	if err != nil {
		t.Fatalf("FetchPending: %v", err)
	}
	var found *models.ActuationOutbox
	for i := range entries {
		if entries[i].EventID == entry.EventID {
			found = &entries[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("FetchPending did not return the just-inserted entry %s among %d entries", entry.EventID, len(entries))
	}
	if found.TenantID != tenantID {
		t.Errorf("TenantID = %q, want %q", found.TenantID, tenantID)
	}
	if found.ScopeType != "INTENT" || found.ScopeRef != "int_1" {
		t.Errorf("ScopeType/ScopeRef = %q/%q, want INTENT/int_1", found.ScopeType, found.ScopeRef)
	}
	if found.PayloadHash != "outboxPayloadHash123" {
		t.Errorf("PayloadHash = %q, want outboxPayloadHash123", found.PayloadHash)
	}

	// MarkFailed must persist the error message into last_error.
	if err := outboxRepo.MarkFailed(ctx, entry.EventID, "kafka: connection refused"); err != nil {
		t.Fatalf("MarkFailed: %v", err)
	}
	var lastError *string
	if err := pool.QueryRow(ctx, `SELECT last_error FROM actuation_outbox WHERE event_id = $1`, entry.EventID).Scan(&lastError); err != nil {
		t.Fatalf("select last_error: %v", err)
	}
	if lastError == nil || *lastError != "kafka: connection refused" {
		t.Errorf("last_error = %v, want %q", lastError, "kafka: connection refused")
	}
}
