//go:build integration

package persistence_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"zord-outcome-engine/internal/paymenttruth"
	"zord-outcome-engine/internal/persistence"
	"zord-outcome-engine/internal/poll/providers/razorpay"

	"github.com/google/uuid"
)

func TestCanonicalPaymentsSchemaPresent(t *testing.T) {
	db := testDB(t)
	var name string
	if err := db.QueryRow(`SELECT to_regclass($1)`, "canonical_payments").Scan(&name); err != nil || name == "" {
		t.Fatalf("missing canonical_payments: %v", err)
	}
	var hasHash bool
	if err := db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name='provider_payment_observation_events' AND column_name='observation_identity_hash'
		)`).Scan(&hasHash); err != nil {
		t.Fatal(err)
	}
	if !hasHash {
		t.Fatal("observation_identity_hash missing")
	}
}

func TestProcessIdentityUniqueAndGET(t *testing.T) {
	db := testDB(t)
	store := persistence.NewSQLStore(db)
	p := paymenttruth.NewProcessor(store)
	ctx := context.Background()
	tenant := "11111111-1111-1111-1111-111111111111"
	connector := "22222222-2222-2222-2222-222222222222"
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	item := razorpay.NeutralPayment{
		PaymentID: "pay_phase4_" + suffix, AmountMinor: 100, Currency: "INR",
		Status: "authorized", PayloadHash: "sha256:auth4:" + suffix, CreatedAt: time.Now().UTC(),
	}
	evt := "evt_phase4_" + suffix
	res, err := p.ProcessNeutral(ctx, tenant, connector, "razorpay", "test", "webhook", evt, "", item, false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Kind != paymenttruth.KindInserted {
		t.Fatalf("kind=%s", res.Kind)
	}
	dup, err := p.ProcessNeutral(ctx, tenant, connector, "razorpay", "test", "webhook", evt, "", item, false)
	if err != nil {
		t.Fatal(err)
	}
	if dup.Kind != paymenttruth.KindDuplicate {
		t.Fatalf("dup kind=%s", dup.Kind)
	}
	item.Status = "captured"
	item.Captured = true
	item.PayloadHash = "sha256:cap4:" + suffix
	upd, err := p.ProcessNeutral(ctx, tenant, connector, "razorpay", "test", "api_backfill", "", "", item, false)
	if err != nil {
		t.Fatal(err)
	}
	if upd.Canonical.CanonicalStatus != "captured" {
		t.Fatalf("status=%s", upd.Canonical.CanonicalStatus)
	}
	pay, ok, err := store.GetCanonicalPayment(ctx, tenant, connector, item.PaymentID)
	if err != nil || !ok {
		t.Fatalf("get canonical ok=%v err=%v", ok, err)
	}
	if pay.CanonicalStatus != "captured" {
		t.Fatalf("canonical=%s", pay.CanonicalStatus)
	}
	events, err := store.ListObservationEvents(ctx, tenant, connector, item.PaymentID)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) < 2 {
		t.Fatalf("events=%d", len(events))
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM canonical_payments WHERE tenant_id=$1 AND payment_id=$2`, tenant, item.PaymentID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("canonical rows=%d", n)
	}
}

func TestCanonicalRollbackDoesNotWrite(t *testing.T) {
	db := testDB(t)
	store := persistence.NewSQLStore(db)
	p := paymenttruth.NewProcessor(store)
	ctx := context.Background()
	tenant := "cccccccc-cccc-cccc-cccc-cccccccccccc"
	connector := "dddddddd-dddd-dddd-dddd-dddddddddddd"
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	item := razorpay.NeutralPayment{
		PaymentID: "pay_phase4_rollback_" + suffix, AmountMinor: 50, Currency: "INR",
		Status: "captured", Captured: true, PayloadHash: "sha256:rb:" + suffix, CreatedAt: time.Now().UTC(),
	}
	err := store.RunInTx(ctx, func(ctx context.Context) error {
		if _, err := p.ProcessNeutral(ctx, tenant, connector, "razorpay", "test", "webhook", "evt_rb_"+suffix, "", item, false); err != nil {
			return err
		}
		return errors.New("boom")
	})
	if err == nil {
		t.Fatal("expected rollback")
	}
	_, ok, err := store.GetCanonicalPayment(ctx, tenant, connector, item.PaymentID)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("canonical wrote after rollback")
	}
}

func TestCanonicalIntentLinkExactOrderID(t *testing.T) {
	db := testDB(t)
	store := persistence.NewSQLStore(db)
	p := paymenttruth.NewProcessor(store)
	ctx := context.Background()
	tenant := "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
	connector := "ffffffff-ffff-ffff-ffff-ffffffffffff"
	intentID := uuid.Must(uuid.NewV7()).String()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	orderID := "order_phase4_link_" + suffix
	if _, err := db.Exec(`
		INSERT INTO canonical_intents (
			intent_id, tenant_id, client_payout_ref, amount, currency_code,
			canonical_hash, governance_state
		) VALUES ($1,$2,$3, 100.00, 'INR', $4, 'VALID')`,
		intentID, tenant, orderID, "hash-phase4-"+suffix,
	); err != nil {
		t.Fatal(err)
	}
	linked := razorpay.NeutralPayment{
		PaymentID: "pay_phase4_link_" + suffix, OrderID: orderID, AmountMinor: 10000, Currency: "INR",
		Status: "captured", Captured: true, PayloadHash: "sha256:link:" + suffix, CreatedAt: time.Now().UTC(),
	}
	res, err := p.ProcessNeutral(ctx, tenant, connector, "razorpay", "test", "webhook", "evt_link_"+suffix, "", linked, false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Canonical.IntentLink != paymenttruth.IntentLinked || res.Canonical.IntentID != intentID {
		t.Fatalf("link=%s id=%s", res.Canonical.IntentLink, res.Canonical.IntentID)
	}
	unlinked := razorpay.NeutralPayment{
		PaymentID: "pay_phase4_nolink_" + suffix, OrderID: "order_other_" + suffix, AmountMinor: 10000, Currency: "INR",
		Status: "captured", Captured: true, PayloadHash: "sha256:nolink:" + suffix, CreatedAt: time.Now().UTC(),
	}
	res2, err := p.ProcessNeutral(ctx, tenant, connector, "razorpay", "test", "webhook", "evt_nolink_"+suffix, "", unlinked, false)
	if err != nil {
		t.Fatal(err)
	}
	if res2.Canonical.IntentLink != paymenttruth.IntentUnlinked || res2.Canonical.IntentID != "" {
		t.Fatalf("expected unlinked, got link=%s id=%s", res2.Canonical.IntentLink, res2.Canonical.IntentID)
	}
}
