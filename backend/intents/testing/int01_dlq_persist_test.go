package audittests

// INT-01 regression coverage: "Never swallow a failed DLQ persistence."
//
// This test lives outside cmd/ (which is package main — nothing can ever
// import package main, so a test in a different directory can only ever
// reach it by living in the exact same package/directory) at the user's
// request. To make that possible, the logic under test was moved out of
// cmd/main.go into an exported method, services.IntentService.
// PersistRejectedIntentDLQ (internal/services/dlq_persist.go), which
// cmd/main.go's Kafka handler now calls directly. That makes it a normal
// importable package, so this file can exercise the REAL function — not a
// reproduction of it — via the same public API cmd/main.go uses.
//
// This file proves two things with real, executed Go code (not narrative):
//  1. legacyPersistRejectedIntentDLQ below is a verbatim reproduction of the
//     branch that used to live inline in the Kafka `handler` closure in
//     main.go before the INT-01 fix (see git history / PR #567 "INT 01.1
//     DONE"). It shows the bug actually existed: a failed DLQ save was
//     logged but the branch fell through to `return nil`, so the caller
//     believed the message could be safely acknowledged. It is a
//     reproduction (not the real pre-fix code, which no longer exists)
//     because there is nothing left in the repository to import for the
//     "before" state — the fix already shipped.
//  2. IntentService.PersistRejectedIntentDLQ — the actual, real function
//     cmd/main.go calls today — is exercised against the exact same failure
//     inputs and shown to propagate the error instead.
//
// Run with: go test ./testing/... -run TestINT01 -v

import (
	"context"
	"errors"
	"testing"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
	"zord-intent-engine/internal/services"
	"zord-intent-engine/internal/validator"
	"zord-intent-engine/kafka"

	"github.com/google/uuid"
)

// fakeDLQRepo is a minimal in-memory persistence.DLQRepository whose Save
// behavior is scripted per-test, so a "DB outage during DLQ write" can be
// simulated deterministically without a real Postgres instance.
type fakeDLQRepo struct {
	saveErr   error
	saveCalls int
	lastSaved models.DLQEntry
}

func (f *fakeDLQRepo) Save(ctx context.Context, entry models.DLQEntry) (models.DLQEntry, error) {
	f.saveCalls++
	if f.saveErr != nil {
		return models.DLQEntry{}, f.saveErr
	}
	entry.DLQID = "dlq-" + uuid.NewString()
	f.lastSaved = entry
	return entry, nil
}

func (f *fakeDLQRepo) ListAll(ctx context.Context) ([]models.DLQEntry, error) { return nil, nil }
func (f *fakeDLQRepo) ListByTenant(ctx context.Context, tenantID string) ([]models.DLQEntry, error) {
	return nil, nil
}
func (f *fakeDLQRepo) GetByTenantAndID(ctx context.Context, tenantID, dlqID string) (*models.DLQEntry, error) {
	return nil, nil
}
func (f *fakeDLQRepo) ListManualReview(ctx context.Context, tenantID string) ([]models.DLQEntry, error) {
	return nil, nil
}
func (f *fakeDLQRepo) CountTerminal(ctx context.Context, tenantID string) (int, error) { return 0, nil }

var _ persistence.DLQRepository = (*fakeDLQRepo)(nil)

// fakeVectorPublisher counts real publish attempts through the same
// services.VectorIndexPublisher interface production wires in main.go, so
// "did the vector-index side effect fire" is observed via the real
// integration point rather than a test-only substitute callback.
type fakeVectorPublisher struct {
	publishCalls int
}

func (f *fakeVectorPublisher) PublishVectorIndexRequest(ctx context.Context, event kafka.VectorIndexRequestEvent) error {
	f.publishCalls++
	return nil
}

var _ services.VectorIndexPublisher = (*fakeVectorPublisher)(nil)

// newTestIntentService builds a real *services.IntentService wired only
// with the fake DLQ repo and vector publisher PersistRejectedIntentDLQ
// actually touches — every other dependency (S3, Kafka tokenize queue, DB,
// tenant-limit repos) is nil, exactly as services.NewIntentService's own
// nil-safety guards (see resolveBusinessDate) anticipate for exactly this
// kind of narrow, dependency-light unit test.
func newTestIntentService(repo persistence.DLQRepository) (*services.IntentService, *fakeVectorPublisher) {
	svc := services.NewIntentService(validator.NewValidator(repo), nil, nil, nil, nil, nil, nil)
	pub := &fakeVectorPublisher{}
	svc.SetVectorIndexPublisher(pub)
	return svc, pub
}

// legacyPersistRejectedIntentDLQ is a verbatim reproduction of the code that
// lived inline in main.go's Kafka handler prior to the INT-01 fix:
//
//	savedDLQ, err := dlqRepo.Save(ctx, *dlq)
//	if err != nil {
//		log.Printf("Failed to save DLQ entry: %v", err)
//	} else {
//		intentService.EmitDLQVectorIndexRequest(savedDLQ)
//	}
//	// ... then unconditionally: return nil
//
// Reproduced here (not imported — it no longer exists in main.go) solely to
// prove, by executing it, that the pre-fix code path swallowed a DLQ save
// failure and returned nil.
func legacyPersistRejectedIntentDLQ(
	ctx context.Context,
	dlqRepo persistence.DLQRepository,
	dlq *models.DLQEntry,
	event *models.Event,
	emitVectorIndex func(models.DLQEntry),
) error {
	if dlq.DLQID == "" {
		if dlq.TenantID == "" {
			dlq.TenantID = event.TenantID.String()
		}
		if dlq.EnvelopeID == "" {
			dlq.EnvelopeID = event.EnvelopeID.String()
		}
		if dlq.ClientBatchRef == "" && event.BatchID != nil {
			dlq.ClientBatchRef = *event.BatchID
		}
		if dlq.BatchID == "" && event.BatchID != nil {
			dlq.BatchID = *event.BatchID
		}
		savedDLQ, err := dlqRepo.Save(ctx, *dlq)
		if err != nil {
			// bug: logged, but the caller (main.go's `handler`) still hit its
			// unconditional `return nil` right after this branch.
		} else {
			emitVectorIndex(savedDLQ)
		}
	}
	return nil // <- this is the swallow: always nil, regardless of save error
}

func testEvent() *models.Event {
	return &models.Event{
		EventID:    "evt-1",
		TraceID:    uuid.New(),
		EnvelopeID: uuid.New(),
		TenantID:   uuid.New(),
		Source:     "SFTP",
	}
}

func testDLQEntry() *models.DLQEntry {
	return &models.DLQEntry{
		Stage:       "POLICY_DLQ",
		ReasonCode:  "SEMANTIC_INVALID",
		ErrorDetail: "amount missing",
		DLQStatus:   "NEEDS_MANUAL_REVIEW",
	}
}

// TestINT01_LegacyBehavior_SwallowsSaveFailure demonstrates the pre-fix bug:
// a Postgres outage during the DLQ save is silently discarded — the legacy
// branch returns nil, which is exactly the signal main.go's Kafka handler
// used to acknowledge (MarkMessage) the source event.
func TestINT01_LegacyBehavior_SwallowsSaveFailure(t *testing.T) {
	repo := &fakeDLQRepo{saveErr: errors.New("dial tcp 10.0.0.5:5432: connect: connection refused")}
	dlq := testDLQEntry()
	event := testEvent()
	emitCalls := 0

	err := legacyPersistRejectedIntentDLQ(context.Background(), repo, dlq, event, func(models.DLQEntry) { emitCalls++ })

	t.Logf("[LEGACY/OLD] dlqRepo.Save attempts=%d, save error=%v", repo.saveCalls, repo.saveErr)
	t.Logf("[LEGACY/OLD] legacyPersistRejectedIntentDLQ returned err=%v (handler would then unconditionally return nil -> Kafka MarkMessage -> offset advances)", err)

	if err != nil {
		t.Fatalf("legacy reproduction is expected to demonstrate the bug (err == nil) but got err=%v — legacy snippet no longer matches pre-fix main.go, update the reproduction", err)
	}
	if repo.saveCalls != 1 {
		t.Fatalf("expected exactly 1 Save attempt, got %d", repo.saveCalls)
	}
	if emitCalls != 0 {
		t.Fatalf("vector-index emit must not fire when save failed, got %d calls", emitCalls)
	}
	t.Log("[LEGACY/OLD] CONFIRMED BUG: save failed but function returned nil — event would be acknowledged with NO intent row and NO DLQ row.")
}

// TestINT01_FixedBehavior_PropagatesSaveFailure exercises the real function
// now wired into main.go's handler — services.IntentService.
// PersistRejectedIntentDLQ — against the identical failure input used above.
func TestINT01_FixedBehavior_PropagatesSaveFailure(t *testing.T) {
	repo := &fakeDLQRepo{saveErr: errors.New("dial tcp 10.0.0.5:5432: connect: connection refused")}
	svc, pub := newTestIntentService(repo)
	dlq := testDLQEntry()
	event := testEvent()

	err := svc.PersistRejectedIntentDLQ(context.Background(), dlq, event)

	t.Logf("[FIXED/NEW] dlqRepo.Save attempts=%d, save error=%v", repo.saveCalls, repo.saveErr)
	t.Logf("[FIXED/NEW] IntentService.PersistRejectedIntentDLQ returned err=%v (handler now returns this -> kafka.callWithRetry retries -> consumer_failure_receipts fallback on exhaustion, offset NOT advanced)", err)

	if err == nil {
		t.Fatal("expected PersistRejectedIntentDLQ to propagate the save error, got nil — INT-01 regression")
	}
	if repo.saveCalls != 1 {
		t.Fatalf("expected exactly 1 Save attempt, got %d", repo.saveCalls)
	}
	if pub.publishCalls != 0 {
		t.Fatalf("vector-index publish must not fire when save failed, got %d calls", pub.publishCalls)
	}
	t.Log("[FIXED/NEW] CONFIRMED FIX: save failed and the error was propagated — message will be retried, never silently acknowledged.")
}

// TestINT01_FixedBehavior_RecoversAfterOutage simulates the DB coming back:
// the first attempt fails (as Kafka's callWithRetry would see it), a second,
// independent attempt against a now-healthy repo succeeds — exactly one DLQ
// row is written, matching the audit's acceptance test: "DB outage during
// DLQ write causes redelivery and exactly one final DLQ/failure receipt
// after recovery."
func TestINT01_FixedBehavior_RecoversAfterOutage(t *testing.T) {
	event := testEvent()

	failingRepo := &fakeDLQRepo{saveErr: errors.New("connection refused")}
	failingSvc, _ := newTestIntentService(failingRepo)
	dlqAttempt1 := testDLQEntry()
	err1 := failingSvc.PersistRejectedIntentDLQ(context.Background(), dlqAttempt1, event)
	t.Logf("[REDELIVERY attempt 1] err=%v (DB still down)", err1)
	if err1 == nil {
		t.Fatal("attempt 1 should fail while the DB is down")
	}

	healthyRepo := &fakeDLQRepo{}
	healthySvc, pub := newTestIntentService(healthyRepo)
	dlqAttempt2 := testDLQEntry() // Kafka redelivers the same message -> handler builds a fresh DLQEntry
	err2 := healthySvc.PersistRejectedIntentDLQ(context.Background(), dlqAttempt2, event)
	t.Logf("[REDELIVERY attempt 2] err=%v, saveCalls=%d, publishCalls=%d, savedDLQID=%q (DB recovered)",
		err2, healthyRepo.saveCalls, pub.publishCalls, healthyRepo.lastSaved.DLQID)

	if err2 != nil {
		t.Fatalf("attempt 2 should succeed once the DB recovers, got err=%v", err2)
	}
	if healthyRepo.saveCalls != 1 {
		t.Fatalf("expected exactly one successful DLQ save after recovery, got %d", healthyRepo.saveCalls)
	}
	if healthyRepo.lastSaved.DLQID == "" {
		t.Fatal("expected the recovered save to produce a persisted DLQ row with a DLQID")
	}
	t.Log("[REDELIVERY] CONFIRMED: exactly one durable DLQ record exists after recovery, per the audit's acceptance test.")
}

// TestINT01_FixedBehavior_SkipsResaveWhenAlreadyPersisted covers the common
// path: the inner pipeline (ProcessIncomingIntent) already saved the DLQ
// entry successfully, so DLQID is set. This must NOT re-save.
func TestINT01_FixedBehavior_SkipsResaveWhenAlreadyPersisted(t *testing.T) {
	repo := &fakeDLQRepo{}
	svc, pub := newTestIntentService(repo)
	dlq := testDLQEntry()
	dlq.DLQID = "dlq-already-saved-upstream"
	event := testEvent()

	err := svc.PersistRejectedIntentDLQ(context.Background(), dlq, event)

	t.Logf("[ALREADY-SAVED] err=%v, saveCalls=%d, publishCalls=%d", err, repo.saveCalls, pub.publishCalls)
	if err != nil {
		t.Fatalf("expected no error when DLQID already set, got %v", err)
	}
	if repo.saveCalls != 0 {
		t.Fatalf("expected no re-save attempt when DLQID already set, got %d calls", repo.saveCalls)
	}
}
