//go:build integration

package persistence_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"
	"time"

	"zord-outcome-engine/internal/persistence"
	"zord-outcome-engine/internal/poll"
	"zord-outcome-engine/internal/poll/providers/razorpay"

	"github.com/lib/pq"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	db, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	return db
}

func TestPhase3SchemaPresent(t *testing.T) {
	db := testDB(t)
	for _, table := range []string{
		"provider_payment_observations",
		"backfill_jobs",
		"backfill_cursors",
		"provider_payment_observation_events",
	} {
		var name string
		if err := db.QueryRow(`SELECT to_regclass($1)`, table).Scan(&name); err != nil || name == "" {
			t.Fatalf("missing table %s: %v", table, err)
		}
	}
	var hasSources, hasWebhookMissing bool
	if err := db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name='provider_payment_observations' AND column_name='sources'
		), EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name='provider_payment_observations' AND column_name='webhook_missing'
		)`).Scan(&hasSources, &hasWebhookMissing); err != nil {
		t.Fatal(err)
	}
	if !hasSources || !hasWebhookMissing {
		t.Fatal("provenance columns missing")
	}
}

func TestUniquePaymentIdentityAndSources(t *testing.T) {
	db := testDB(t)
	store := persistence.NewSQLStore(db)
	ctx := context.Background()
	tenant := "11111111-1111-1111-1111-111111111111"
	connector := "22222222-2222-2222-2222-222222222222"
	item := razorpay.NeutralPayment{
		PaymentID: "pay_phase3_unique", OrderID: "order_1", AmountMinor: 100, Currency: "INR",
		Status: "authorized", PayloadHash: "sha256:auth", CreatedAt: time.Now().UTC(),
	}
	if _, err := store.UpsertPayment(ctx, poll.PaymentObservation{
		TenantID: tenant, ConnectorID: connector, Provider: "razorpay", ProviderMode: "test",
		Item: item, Source: poll.SourceWebhook,
	}); err != nil {
		t.Fatal(err)
	}
	item.Status = "captured"
	item.Captured = true
	item.PayloadHash = "sha256:cap"
	if _, err := store.UpsertPayment(ctx, poll.PaymentObservation{
		TenantID: tenant, ConnectorID: connector, Provider: "razorpay", ProviderMode: "test",
		Item: item, Source: poll.SourceAPIBackfill, WebhookMissing: true,
	}); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`, tenant, connector, item.PaymentID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("want 1 row, got %d", n)
	}
	var sources pq.StringArray
	var webhookMissing bool
	var status string
	if err := db.QueryRow(`
		SELECT sources, webhook_missing, status FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`, tenant, connector, item.PaymentID).
		Scan(&sources, &webhookMissing, &status); err != nil {
		t.Fatal(err)
	}
	if status != "captured" {
		t.Fatalf("status=%s", status)
	}
	if webhookMissing {
		t.Fatal("webhook source should clear webhook_missing")
	}
	if !containsSource(sources, poll.SourceWebhook) || !containsSource(sources, poll.SourceAPIBackfill) {
		t.Fatalf("sources=%v", []string(sources))
	}
	var events int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM provider_payment_observation_events
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`, tenant, connector, item.PaymentID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if events < 2 {
		t.Fatalf("history=%d", events)
	}

	row, err := poll.PaymentOutboxRow(tenant, connector, item.PaymentID, poll.SourceAPIBackfill, item)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.InsertOutbox(ctx, row); err != nil {
		t.Fatal(err)
	}
	dup := row
	dup.EventID = row.EventID
	if err := store.InsertOutbox(ctx, dup); err != nil {
		t.Fatalf("duplicate outbox key should be ignored: %v", err)
	}
	var outboxN int
	if err := db.QueryRow(`SELECT COUNT(*) FROM outcome_outbox WHERE idempotency_key=$1`, row.IdempotencyKey).Scan(&outboxN); err != nil {
		t.Fatal(err)
	}
	if outboxN != 1 {
		t.Fatalf("outbox rows for key=%d", outboxN)
	}
}

func TestCursorNotAdvancedOnTxRollback(t *testing.T) {
	db := testDB(t)
	store := persistence.NewSQLStore(db)
	ctx := context.Background()
	tenant := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	connector := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	from := time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	cursor, err := store.EnsureCursor(ctx, poll.BackfillCursor{
		TenantID: tenant, ConnectorID: connector, ResourceType: poll.ResourcePayments,
		WindowFrom: from, WindowTo: to, PageSkip: 0, PageCount: 100, Status: poll.CursorActive,
	})
	if err != nil {
		t.Fatal(err)
	}
	err = store.RunInTx(ctx, func(ctx context.Context) error {
		cursor.PageSkip = 50
		if err := store.AdvanceCursor(ctx, cursor); err != nil {
			return err
		}
		return errors.New("boom")
	})
	if err == nil {
		t.Fatal("expected rollback")
	}
	got, err := store.GetCursor(ctx, tenant, connector, poll.ResourcePayments, from, to)
	if err != nil {
		t.Fatal(err)
	}
	if got.PageSkip != 0 {
		t.Fatalf("cursor advanced after rollback: skip=%d", got.PageSkip)
	}
}

func containsSource(sources []string, want string) bool {
	for _, s := range sources {
		if s == want {
			return true
		}
	}
	return false
}
