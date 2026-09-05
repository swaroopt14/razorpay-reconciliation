package paymenttruth_test

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"zord-outcome-engine/internal/paymenttruth"
	"zord-outcome-engine/internal/poll"
	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/internal/recon"
	"zord-outcome-engine/models"
)

func testIDs() (tenant, connector string) {
	return "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
}

func processItem(t *testing.T, store *poll.MemoryStore, source, eventID string, item razorpay.NeutralPayment) paymenttruth.Result {
	t.Helper()
	p := paymenttruth.NewProcessor(store)
	tenant, connector := testIDs()
	res, err := p.ProcessNeutral(context.Background(), tenant, connector, "razorpay", "test", source, eventID, "33333333-3333-3333-3333-333333333333", item, false)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestProcessNewPayment(t *testing.T) {
	store := poll.NewMemoryStore()
	item := razorpay.NeutralPayment{PaymentID: "pay_ABC", AmountMinor: 100, Currency: "INR", Status: "captured", Captured: true, PayloadHash: "sha256:cap"}
	res := processItem(t, store, "webhook", "evt_1", item)
	if res.Kind != paymenttruth.KindInserted {
		t.Fatalf("kind=%s", res.Kind)
	}
	if res.Canonical.CanonicalStatus != recon.PaymentCaptured {
		t.Fatalf("status=%s", res.Canonical.CanonicalStatus)
	}
	if len(store.Canonicals) != 1 {
		t.Fatalf("canonicals=%d", len(store.Canonicals))
	}
}

func TestProcessDuplicateWebhook(t *testing.T) {
	store := poll.NewMemoryStore()
	item := razorpay.NeutralPayment{PaymentID: "pay_ABC", AmountMinor: 100, Currency: "INR", Status: "authorized", PayloadHash: "sha256:a"}
	processItem(t, store, "webhook", "evt_1", item)
	res := processItem(t, store, "webhook", "evt_1", item)
	if res.Kind != paymenttruth.KindDuplicate {
		t.Fatalf("kind=%s", res.Kind)
	}
	if len(store.Events) != 1 {
		t.Fatalf("events=%d", len(store.Events))
	}
}

func TestProcessWebhookAndAPITwoEventsOneCanonical(t *testing.T) {
	store := poll.NewMemoryStore()
	auth := razorpay.NeutralPayment{PaymentID: "pay_ABC", AmountMinor: 100, Currency: "INR", Status: "authorized", PayloadHash: "sha256:auth"}
	cap := razorpay.NeutralPayment{PaymentID: "pay_ABC", AmountMinor: 100, Currency: "INR", Status: "captured", Captured: true, PayloadHash: "sha256:cap"}
	processItem(t, store, "webhook", "evt_auth", auth)
	res := processItem(t, store, "api_backfill", "", cap)
	if res.Kind != paymenttruth.KindUpdated {
		t.Fatalf("kind=%s", res.Kind)
	}
	if len(store.Canonicals) != 1 {
		t.Fatalf("canonicals=%d", len(store.Canonicals))
	}
	if len(store.Events) != 2 {
		t.Fatalf("events=%d", len(store.Events))
	}
	var sources []string
	for _, c := range store.Canonicals {
		sources = c.Sources
		if c.CanonicalStatus != recon.PaymentCaptured {
			t.Fatalf("status=%s", c.CanonicalStatus)
		}
	}
	if len(sources) != 2 {
		t.Fatalf("sources=%v", sources)
	}
}

func TestProcessConcurrentOneCanonical(t *testing.T) {
	store := poll.NewMemoryStore()
	p := paymenttruth.NewProcessor(store)
	tenant, connector := testIDs()
	item := razorpay.NeutralPayment{PaymentID: "pay_ABC", AmountMinor: 100, Currency: "INR", Status: "captured", Captured: true, PayloadHash: "sha256:cap"}
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := p.ProcessNeutral(context.Background(), tenant, connector, "razorpay", "test", "webhook", "evt_same", "", item, false)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(store.Canonicals) != 1 {
		t.Fatalf("canonicals=%d", len(store.Canonicals))
	}
	if len(store.Events) != 1 {
		t.Fatalf("events=%d", len(store.Events))
	}
}

func TestProcessTenantIsolation(t *testing.T) {
	store := poll.NewMemoryStore()
	p := paymenttruth.NewProcessor(store)
	item := razorpay.NeutralPayment{PaymentID: "pay_123", AmountMinor: 100, Currency: "INR", Status: "captured", Captured: true, PayloadHash: "sha256:x"}
	if _, err := p.ProcessNeutral(context.Background(), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "11111111-1111-1111-1111-111111111111", "razorpay", "test", "webhook", "evt_a", "", item, false); err != nil {
		t.Fatal(err)
	}
	if _, err := p.ProcessNeutral(context.Background(), "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "22222222-2222-2222-2222-222222222222", "razorpay", "test", "webhook", "evt_b", "", item, false); err != nil {
		t.Fatal(err)
	}
	if len(store.Canonicals) != 2 {
		t.Fatalf("canonicals=%d", len(store.Canonicals))
	}
}

func TestProcessOutboxHasNoSecrets(t *testing.T) {
	store := poll.NewMemoryStore()
	item := razorpay.NeutralPayment{
		PaymentID: "pay_ABC", AmountMinor: 100, Currency: "INR", Status: "captured", Captured: true,
		PayloadHash: "sha256:cap", Email: "hidden@example.com", Contact: "+910000000000",
	}
	processItem(t, store, "webhook", "evt_1", item)
	for _, row := range store.Outbox {
		raw := string(row.Payload)
		if strings.Contains(raw, "hidden@example.com") || strings.Contains(raw, "+910000000000") {
			t.Fatalf("secret in outbox: %s", raw)
		}
		var payload map[string]any
		if err := json.Unmarshal(row.Payload, &payload); err != nil {
			t.Fatal(err)
		}
		if _, ok := payload["email"]; ok {
			t.Fatal("email field in outbox")
		}
		if _, ok := payload["contact"]; ok {
			t.Fatal("contact field in outbox")
		}
	}
	foundCanon := false
	for _, row := range store.Outbox {
		if row.EventType == models.EventTypePaymentCanonicalUpdatedV1 {
			foundCanon = true
		}
	}
	if !foundCanon {
		t.Fatal("missing canonical outbox")
	}
}

func TestProcessIntentLinkExactOrderID(t *testing.T) {
	store := poll.NewMemoryStore()
	tenant, connector := testIDs()
	store.SetIntent(tenant, "order_1", "99999999-9999-9999-9999-999999999999")
	item := razorpay.NeutralPayment{PaymentID: "pay_ABC", OrderID: "order_1", AmountMinor: 100, Currency: "INR", Status: "captured", Captured: true, PayloadHash: "sha256:cap"}
	res := processItem(t, store, "webhook", "evt_1", item)
	if res.Canonical.IntentLink != paymenttruth.IntentLinked || res.Canonical.IntentID == "" {
		t.Fatalf("link=%s id=%s", res.Canonical.IntentLink, res.Canonical.IntentID)
	}
	unlinked := razorpay.NeutralPayment{PaymentID: "pay_DEF", OrderID: "order_other", AmountMinor: 100, Currency: "INR", Status: "captured", Captured: true, PayloadHash: "sha256:d"}
	res2, err := paymenttruth.NewProcessor(store).ProcessNeutral(context.Background(), tenant, connector, "razorpay", "test", "webhook", "evt_2", "", unlinked, false)
	if err != nil {
		t.Fatal(err)
	}
	if res2.Canonical.IntentLink != paymenttruth.IntentUnlinked {
		t.Fatalf("expected unlinked, got %s", res2.Canonical.IntentLink)
	}
}

func TestProcessCapturedThenAuthorizedNoRegression(t *testing.T) {
	store := poll.NewMemoryStore()
	cap := razorpay.NeutralPayment{PaymentID: "pay_ABC", AmountMinor: 100, Currency: "INR", Status: "captured", Captured: true, PayloadHash: "sha256:cap"}
	auth := razorpay.NeutralPayment{PaymentID: "pay_ABC", AmountMinor: 100, Currency: "INR", Status: "authorized", PayloadHash: "sha256:auth"}
	processItem(t, store, "api_backfill", "", cap)
	res := processItem(t, store, "webhook", "evt_late", auth)
	if res.Canonical.CanonicalStatus != recon.PaymentCaptured {
		t.Fatalf("regressed to %s", res.Canonical.CanonicalStatus)
	}
	for _, pmt := range store.Payments {
		if pmt.Item.Status != recon.PaymentCaptured {
			t.Fatalf("snapshot status=%s", pmt.Item.Status)
		}
	}
}

func TestIdentityHashStable(t *testing.T) {
	a := paymenttruth.ObservationIdentityHash("t", "c", "razorpay", "pay_1", "webhook", "evt_1", "hash")
	b := paymenttruth.ObservationIdentityHash("t", "c", "razorpay", "pay_1", "webhook", "evt_1", "hash")
	if a != b || a == "" {
		t.Fatalf("%s vs %s", a, b)
	}
	c := paymenttruth.ObservationIdentityHash("t", "c", "razorpay", "pay_1", "api_backfill", "", "hash")
	if a == c {
		t.Fatal("webhook and api must differ")
	}
}

func TestProcessRejectsNegativeAmount(t *testing.T) {
	store := poll.NewMemoryStore()
	p := paymenttruth.NewProcessor(store)
	tenant, connector := testIDs()
	_, err := p.ProcessNeutral(context.Background(), tenant, connector, "razorpay", "test", "webhook", "evt", "", razorpay.NeutralPayment{PaymentID: "pay_1", AmountMinor: -5, Currency: "INR", Status: "captured"}, false)
	if err == nil {
		t.Fatal("expected error")
	}
}
