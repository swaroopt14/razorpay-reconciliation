package poll

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
)

type fakeProvider struct {
	payments    []razorpay.NeutralPayment
	pageSize    int
	calls       int
	failOnCall  int
	failErr     error
	settlements []razorpay.NeutralSettlementLine
}

func (f *fakeProvider) ListPaymentsPage(_ context.Context, _, _ time.Time, skip, count int) (razorpay.NeutralPage[razorpay.NeutralPayment], error) {
	f.calls++
	if f.failOnCall != 0 && f.calls == f.failOnCall {
		return razorpay.NeutralPage[razorpay.NeutralPayment]{}, f.failErr
	}
	if count <= 0 {
		count = 100
	}
	if skip > len(f.payments) {
		skip = len(f.payments)
	}
	end := skip + count
	if end > len(f.payments) {
		end = len(f.payments)
	}
	items := f.payments[skip:end]
	return razorpay.NeutralPage[razorpay.NeutralPayment]{
		Items:   items,
		Skip:    skip,
		Count:   count,
		HasMore: end < len(f.payments),
		Meta: razorpay.ResponseMeta{
			Status:    200,
			Hash:      fmt.Sprintf("sha256:page-%d", skip),
			Path:      "/payments",
			QueryHash: fmt.Sprintf("q-%d", skip),
		},
	}, nil
}

func (f *fakeProvider) ListSettlementDay(_ context.Context, _ razorpay.CivilDate, skip, count int) (razorpay.NeutralPage[razorpay.NeutralSettlementLine], error) {
	f.calls++
	if skip >= len(f.settlements) {
		return razorpay.NeutralPage[razorpay.NeutralSettlementLine]{Meta: razorpay.ResponseMeta{Status: 200, Path: "/settlements/recon/combined"}}, nil
	}
	end := skip + count
	if end > len(f.settlements) {
		end = len(f.settlements)
	}
	items := f.settlements[skip:end]
	return razorpay.NeutralPage[razorpay.NeutralSettlementLine]{
		Items:   items,
		HasMore: end < len(f.settlements),
		Meta:    razorpay.ResponseMeta{Status: 200, Hash: "sha256:s", Path: "/settlements/recon/combined", QueryHash: "qs"},
	}, nil
}

type staticCreds struct{}

func (staticCreds) Resolve(context.Context, string, string, string) (razorpay.Config, error) {
	cfg := razorpay.DefaultConfig()
	cfg.KeyID = "rzp_test_x"
	cfg.KeySecret = "secret"
	return cfg, nil
}

func testWindow() (time.Time, time.Time) {
	from := time.Date(2026, 8, 26, 0, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	return from, to
}

func payment(id string) razorpay.NeutralPayment {
	from, _ := testWindow()
	return razorpay.NeutralPayment{
		PaymentID: id, OrderID: "order_1", AmountMinor: 100000, Currency: "INR",
		Status: "captured", Captured: true, PayloadHash: "sha256:" + id, CreatedAt: from.Add(time.Minute),
	}
}

func newService(t *testing.T, provider *fakeProvider, webhooks []WebhookReceiptRef) (*BackfillService, *MemoryStore) {
	t.Helper()
	store := NewMemoryStore()
	fresh := NewFreshnessService(store, MemoryWebhookIndex{Receipts: webhooks})
	svc := NewBackfillService(store, fresh, staticCreds{}, func(razorpay.Config) (BackfillProvider, error) {
		return provider, nil
	})
	svc.now = func() time.Time { return time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC) }
	return svc, store
}

func TestBackfillMissingWebhookAndIdempotentRerun(t *testing.T) {
	from, to := testWindow()
	provider := &fakeProvider{
		payments: []razorpay.NeutralPayment{payment("pay_1"), payment("pay_2"), payment("pay_3"), payment("pay_4"), payment("pay_5")},
		pageSize: 3,
	}
	webhooks := []WebhookReceiptRef{
		{ProviderEntityID: "pay_1", ReceivedAt: from.Add(2 * time.Minute)},
		{ProviderEntityID: "pay_2", ReceivedAt: from.Add(2 * time.Minute)},
		{ProviderEntityID: "pay_3", ReceivedAt: from.Add(2 * time.Minute)},
	}
	svc, store := newService(t, provider, webhooks)
	job, err := svc.CreateJob(context.Background(), CreateBackfillRequest{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		Mode: "test", ResourceType: ResourcePayments, WindowFrom: from, WindowTo: to, TriggerType: TriggerManual,
	})
	if err != nil {
		t.Fatal(err)
	}
	provider.pageSize = 3
	// fake uses skip/count: set count via cursor page_count which defaults 100, so one page.
	// Force two pages by using a tiny page size in the fake: skip/count from cursor.PageCount=100 would be one page.
	// Override by making fake page by skip with count from argument — cursor.PageCount is 100 so all 5 in one page.
	// That's fine for missing-webhook assertion.
	summary, err := svc.RunPayments(context.Background(), job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if summary.FetchedCount != 5 || summary.InsertedCount != 5 {
		t.Fatalf("summary=%+v", summary)
	}
	if summary.MissingWebhookCount != 2 {
		t.Fatalf("want 2 missing webhooks, got %d", summary.MissingWebhookCount)
	}
	if len(store.Payments) != 5 {
		t.Fatalf("stored %d", len(store.Payments))
	}

	summary2, err := svc.RunPayments(context.Background(), job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if summary2.SkippedDuplicateCount < 5 && len(store.Payments) != 5 {
		t.Fatalf("rerun must not duplicate financial records: %+v store=%d", summary2, len(store.Payments))
	}
	if len(store.Payments) != 5 {
		t.Fatalf("duplicate financial records: %d", len(store.Payments))
	}
}

func TestBackfillTwoPagesResumeAfterFailure(t *testing.T) {
	from, to := testWindow()
	provider := &fakeProvider{
		payments: []razorpay.NeutralPayment{payment("pay_1"), payment("pay_2"), payment("pay_3"), payment("pay_4"), payment("pay_5")},
	}
	svc, store := newService(t, provider, nil)

	// Shrink page size by wrapping: use a small-count provider via cursor. We'll set page count after create.
	job, err := svc.CreateJob(context.Background(), CreateBackfillRequest{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		Mode: "test", ResourceType: ResourcePayments, WindowFrom: from, WindowTo: to,
	})
	if err != nil {
		t.Fatal(err)
	}
	for k, c := range store.Cursors {
		c.PageCount = 3
		store.Cursors[k] = c
	}

	provider.failOnCall = 2
	provider.failErr = &razorpay.ProviderError{Kind: razorpay.ErrProvider, Code: "RAZORPAY_SERVER_ERROR", Retryable: true, HTTPStatus: 500}
	_, err = svc.RunPayments(context.Background(), job.ID)
	if err == nil {
		t.Fatal("expected page 2 failure")
	}
	if len(store.Payments) != 3 {
		t.Fatalf("page 1 should persist 3 payments, got %d", len(store.Payments))
	}

	provider.failOnCall = 0
	provider.calls = 0
	summary, err := svc.Resume(context.Background(), job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(store.Payments) != 5 {
		t.Fatalf("resume should complete remaining payments, got %d", len(store.Payments))
	}
	if summary.Status != JobSucceeded && summary.Status != JobPartial {
		t.Fatalf("status=%s", summary.Status)
	}
}

func TestBackfillUnauthorizedFailsJob(t *testing.T) {
	from, to := testWindow()
	provider := &fakeProvider{
		payments:   []razorpay.NeutralPayment{payment("pay_1")},
		failOnCall: 1,
		failErr:    &razorpay.ProviderError{Kind: razorpay.ErrUnauthorized, Code: "RAZORPAY_AUTH_FAILED", HTTPStatus: 401},
	}
	svc, store := newService(t, provider, nil)
	job, err := svc.CreateJob(context.Background(), CreateBackfillRequest{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		Mode: "test", ResourceType: ResourcePayments, WindowFrom: from, WindowTo: to,
	})
	if err != nil {
		t.Fatal(err)
	}
	summary, err := svc.RunPayments(context.Background(), job.ID)
	if err == nil {
		t.Fatal("expected auth failure")
	}
	if summary.Status != JobFailed {
		t.Fatalf("status=%s", summary.Status)
	}
	if len(store.Payments) != 0 {
		t.Fatal("401 must not persist payments")
	}
}

func TestOverlappingWindowsSafe(t *testing.T) {
	from, to := testWindow()
	provider := &fakeProvider{payments: []razorpay.NeutralPayment{payment("pay_1")}}
	svc, store := newService(t, provider, nil)
	req := CreateBackfillRequest{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		Mode: "test", ResourceType: ResourcePayments, WindowFrom: from, WindowTo: to,
	}
	job1, _ := svc.CreateJob(context.Background(), req)
	_, _ = svc.RunPayments(context.Background(), job1.ID)

	req.WindowFrom = from.Add(-time.Minute)
	job2, err := svc.CreateJob(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.RunPayments(context.Background(), job2.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(store.Payments) != 1 {
		t.Fatalf("overlapping windows must upsert same payment, got %d", len(store.Payments))
	}
}

func TestCreateJobReusesActive(t *testing.T) {
	from, to := testWindow()
	svc, _ := newService(t, &fakeProvider{}, nil)
	req := CreateBackfillRequest{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		Mode: "test", ResourceType: ResourcePayments, WindowFrom: from, WindowTo: to, TriggerType: TriggerAirflow,
	}
	a, err := svc.CreateJob(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.CreateJob(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if a.ID != b.ID {
		t.Fatalf("expected reused job, %s vs %s", a.ID, b.ID)
	}
}

func TestFreshnessAPIOnlyVsWebhookOnly(t *testing.T) {
	from, to := testWindow()
	store := NewMemoryStore()
	_, _ = store.UpsertPayment(context.Background(), PaymentObservation{
		TenantID: "t1", ConnectorID: "c1", Item: payment("pay_api"),
	})
	_, _ = store.UpsertPayment(context.Background(), PaymentObservation{
		TenantID: "t1", ConnectorID: "c1", Item: payment("pay_api_only"),
	})
	fresh := NewFreshnessService(store, MemoryWebhookIndex{Receipts: []WebhookReceiptRef{
		{ProviderEntityID: "pay_api", ReceivedAt: from.Add(time.Minute)},
		{ProviderEntityID: "pay_hook_only", ReceivedAt: from.Add(time.Minute)},
	}})
	report, err := fresh.CompareWindow(context.Background(), "t1", "c1", TimeWindow{From: from, To: to})
	if err != nil {
		t.Fatal(err)
	}
	if report.MatchedRecords != 1 || report.WebhookOnlyMissingAPI != 1 || report.APIOnlyMissingWebhook != 1 {
		t.Fatalf("report=%+v", report)
	}
}

func TestValidateWindow(t *testing.T) {
	now := time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC)
	if err := ValidateWindow(now, now, now); err == nil {
		t.Fatal("equal bounds should fail")
	}
	from, to := FreezeWindow(now.Add(-time.Hour), now.Add(time.Hour), now)
	if to.After(now) {
		t.Fatal("window_to must freeze at now")
	}
	if !from.Before(to) {
		t.Fatal("frozen window inverted")
	}
}

func TestHashChangeUpdatesSnapshot(t *testing.T) {
	from, to := testWindow()
	p := payment("pay_1")
	provider := &fakeProvider{payments: []razorpay.NeutralPayment{p}}
	svc, store := newService(t, provider, nil)
	req := CreateBackfillRequest{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		Mode: "test", ResourceType: ResourcePayments, WindowFrom: from, WindowTo: to,
	}
	job, err := svc.CreateJob(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RunPayments(context.Background(), job.ID); err != nil {
		t.Fatal(err)
	}
	provider.payments[0].PayloadHash = "sha256:changed"
	req.WindowFrom = from.Add(-time.Minute)
	job2, err := svc.CreateJob(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := svc.RunPayments(context.Background(), job2.ID)
	if err != nil {
		t.Fatal(err)
	}
	if summary.UpdatedCount != 1 {
		t.Fatalf("hash change should update, got %+v", summary)
	}
	if len(store.Payments) != 1 {
		t.Fatalf("still one identity, got %d", len(store.Payments))
	}
}

func TestDecodeErrorDoesNotAdvanceCursor(t *testing.T) {
	from, to := testWindow()
	provider := &fakeProvider{
		payments:   []razorpay.NeutralPayment{payment("pay_1")},
		failOnCall: 1,
		failErr:    &razorpay.ProviderError{Kind: razorpay.ErrDecode, Code: "RAZORPAY_DECODE", HTTPStatus: 200},
	}
	svc, store := newService(t, provider, nil)
	job, err := svc.CreateJob(context.Background(), CreateBackfillRequest{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		Mode: "test", ResourceType: ResourcePayments, WindowFrom: from, WindowTo: to,
	})
	if err != nil {
		t.Fatal(err)
	}
	summary, err := svc.RunPayments(context.Background(), job.ID)
	if err == nil {
		t.Fatal("expected decode failure")
	}
	if summary.Status != JobFailed {
		t.Fatalf("status=%s", summary.Status)
	}
	if len(store.Payments) != 0 {
		t.Fatal("decode error must not persist observations")
	}
	for _, c := range store.Cursors {
		if c.PageSkip != 0 {
			t.Fatalf("cursor advanced on decode error: %+v", c)
		}
	}
}

func TestRateLimitedPartialThenResume(t *testing.T) {
	from, to := testWindow()
	provider := &fakeProvider{
		payments: []razorpay.NeutralPayment{payment("pay_1"), payment("pay_2"), payment("pay_3"), payment("pay_4")},
	}
	svc, store := newService(t, provider, nil)
	job, err := svc.CreateJob(context.Background(), CreateBackfillRequest{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		Mode: "test", ResourceType: ResourcePayments, WindowFrom: from, WindowTo: to,
	})
	if err != nil {
		t.Fatal(err)
	}
	for k, c := range store.Cursors {
		c.PageCount = 2
		store.Cursors[k] = c
	}
	provider.failOnCall = 2
	provider.failErr = &razorpay.ProviderError{Kind: razorpay.ErrRateLimited, Code: "RAZORPAY_RATE_LIMITED", Retryable: true, HTTPStatus: 429}
	summary, err := svc.RunPayments(context.Background(), job.ID)
	if err == nil {
		t.Fatal("expected 429")
	}
	if summary.Status != JobPartial {
		t.Fatalf("429 should be partial, got %s", summary.Status)
	}
	if len(store.Payments) != 2 {
		t.Fatalf("page 1 should persist, got %d", len(store.Payments))
	}
	provider.failOnCall = 0
	provider.calls = 0
	summary, err = svc.Resume(context.Background(), job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(store.Payments) != 4 {
		t.Fatalf("resume after 429, got %d", len(store.Payments))
	}
	if summary.Status != JobSucceeded {
		t.Fatalf("status=%s", summary.Status)
	}
}

func TestFreshnessPayloadChanged(t *testing.T) {
	from, to := testWindow()
	store := NewMemoryStore()
	item := payment("pay_api")
	_, _ = store.UpsertPayment(context.Background(), PaymentObservation{
		TenantID: "t1", ConnectorID: "c1", Item: item,
	})
	fresh := NewFreshnessService(store, MemoryWebhookIndex{Receipts: []WebhookReceiptRef{
		{ProviderEntityID: "pay_api", ReceivedAt: from.Add(time.Minute), RawBodyHash: "sha256:other"},
	}})
	report, err := fresh.CompareWindow(context.Background(), "t1", "c1", TimeWindow{From: from, To: to})
	if err != nil {
		t.Fatal(err)
	}
	if report.PayloadConflicts != 1 || report.MatchedRecords != 0 {
		t.Fatalf("expected payload conflict, got %+v", report)
	}
}

func TestEdgeReceiptClientUsesRelayToken(t *testing.T) {
	from, to := testWindow()
	var gotToken, gotTenant, gotConnector string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotToken = r.Header.Get("X-Relay-Token")
		gotTenant = r.URL.Query().Get("tenant_id")
		gotConnector = r.URL.Query().Get("connector_id")
		if r.URL.Path != "/internal/webhooks/receipts/index" {
			t.Errorf("path=%s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"receipts":[{"provider_entity_id":"pay_1","event_id":"evt_1","event_type":"payment.captured","received_at":"2026-08-26T00:01:00Z"}]}`)
	}))
	defer server.Close()
	client := NewEdgeReceiptClient(server.URL, "relay-secret")
	refs, err := client.ListReceipts(context.Background(), "t1", "c1", from, to)
	if err != nil {
		t.Fatal(err)
	}
	if gotToken != "relay-secret" || gotTenant != "t1" || gotConnector != "c1" {
		t.Fatalf("request token=%s tenant=%s connector=%s", gotToken, gotTenant, gotConnector)
	}
	if len(refs) != 1 || refs[0].ProviderEntityID != "pay_1" {
		t.Fatalf("refs=%+v", refs)
	}
}

