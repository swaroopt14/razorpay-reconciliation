package persistence_test

// outbox_p1_07_test.go — corrective-action-report P1-07 (real outbox
// dead-letter). TEST_DB_URL-gated (see setupTestDB in projection_repo_test.go).
//
// The full Kafka round-trip (outbox_worker.go publishing an OutboxDLQRecord
// to TopicOutboxDLQ) needs a live broker and is verified against the
// docker-compose stack separately, the same way P0-02's inbound DLQ was.
// This test covers the deterministic persistence-layer contract the worker
// depends on: MarkFailed's terminal transition, and MarkDeadLettered being
// the actual "stop retrying forever" signal (not status='FAILED' alone).

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

func TestOutboxRepo_P1_07_TerminalTransitionAndDeadLetter(t *testing.T) {
	pool, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()
	actionRepo := persistence.NewActionContractRepo(pool)
	outboxRepo := persistence.NewOutboxRepo(pool)

	tenantID := uniqueTenant("outbox_p1_07")
	actionID := "act_" + uuid.New().String()
	ac := models.ActionContract{
		ActionID: actionID, TenantID: tenantID, PolicyID: "P_TEST_P1_07", PolicyVersion: 1,
		ScopeRefs: models.ScopeRefs{IntentID: "int_1"}, InputRefsJSON: `{}`,
		Decision: models.DecisionEscalate, Confidence: 1.0, PayloadJSON: `{}`,
		IntegrityDigest: "devsig:abc", IdempotencyKey: uuid.New().String(),
		ContractStatus: models.ContractStatusActive, CreatedAt: time.Now().UTC(),
		ScopeType: "INTENT", ScopeRef: "int_1",
	}
	if err := actionRepo.InsertIfNew(ctx, ac); err != nil {
		t.Fatalf("InsertIfNew action contract: %v", err)
	}

	eventID := "evt_" + uuid.New().String()
	entry := models.ActuationOutbox{
		EventID: eventID, ActionID: actionID,
		EventType: string(models.DecisionEscalate), Payload: `{"severity":"HIGH"}`,
		Status: models.OutboxStatusPending, Attempts: 0,
		NextRetryAt: time.Now().UTC().Add(-time.Second), // already due
		CreatedAt:   time.Now().UTC(),
		TenantID:    tenantID, ScopeType: "INTENT", ScopeRef: "int_1",
	}
	if err := outboxRepo.Insert(ctx, entry); err != nil {
		t.Fatalf("Insert outbox: %v", err)
	}

	// Attempts 1-4: not yet terminal. Each MarkFailed call schedules
	// next_retry_at via exponential backoff (30s/2m/8m/32m) — force it back
	// into the past after each attempt to simulate "time has passed and
	// this is due again", the same way the real 5s-tick outbox_worker would
	// eventually observe it. Without this, FetchPending correctly excludes
	// a not-yet-due row, which is desired backoff behavior, not something
	// this test is trying to verify.
	forceNextRetryDue := func() {
		t.Helper()
		if _, err := pool.Exec(ctx, `UPDATE actuation_outbox SET next_retry_at = now() - interval '1 second' WHERE event_id = $1`, eventID); err != nil {
			t.Fatalf("force next_retry_at due: %v", err)
		}
	}
	for i := 1; i <= 4; i++ {
		terminal, err := outboxRepo.MarkFailed(ctx, eventID, "kafka: connection refused")
		if err != nil {
			t.Fatalf("MarkFailed attempt %d: %v", i, err)
		}
		if terminal {
			t.Fatalf("MarkFailed attempt %d: terminal=true, want false (attempts=%d)", i, i)
		}
		forceNextRetryDue()
	}
	entries, err := outboxRepo.FetchPending(ctx, 50)
	if err != nil {
		t.Fatalf("FetchPending after 4 failures: %v", err)
	}
	if !containsEventID(entries, eventID) {
		t.Fatalf("entry %s should still be fetchable after 4 failed attempts (not yet terminal)", eventID)
	}

	// Attempt 5: crosses the terminal threshold. MarkFailed's backoff CASE
	// only updates next_retry_at while attempts+1 < 5, so this call leaves
	// it exactly where forceNextRetryDue() last put it (in the past) —
	// no need to force it again.
	terminal, err := outboxRepo.MarkFailed(ctx, eventID, "kafka: connection refused")
	if err != nil {
		t.Fatalf("MarkFailed attempt 5: %v", err)
	}
	if !terminal {
		t.Fatalf("MarkFailed attempt 5: terminal=false, want true (5th attempt)")
	}

	// Terminal (status=FAILED) but not yet dead-lettered — must still be
	// fetchable, so outbox_worker.go's deliver() can retry the DLQ hand-off.
	entries, err = outboxRepo.FetchPending(ctx, 50)
	if err != nil {
		t.Fatalf("FetchPending after terminal transition: %v", err)
	}
	if !containsEventID(entries, eventID) {
		t.Fatalf("terminally-failed entry %s must remain fetchable until dead-lettered (DLQ hand-off retry)", eventID)
	}

	// Once the DLQ hand-off is confirmed, the entry must stop being
	// redelivered forever — this is the actual bug P1-07 fixes: before this
	// column existed, a FAILED row with a frozen past next_retry_at was
	// fetched by every tick indefinitely.
	if err := outboxRepo.MarkDeadLettered(ctx, eventID); err != nil {
		t.Fatalf("MarkDeadLettered: %v", err)
	}
	entries, err = outboxRepo.FetchPending(ctx, 50)
	if err != nil {
		t.Fatalf("FetchPending after dead-lettering: %v", err)
	}
	if containsEventID(entries, eventID) {
		t.Fatalf("dead-lettered entry %s must never be fetched again", eventID)
	}
}

func containsEventID(entries []models.ActuationOutbox, eventID string) bool {
	for _, e := range entries {
		if e.EventID == eventID {
			return true
		}
	}
	return false
}
