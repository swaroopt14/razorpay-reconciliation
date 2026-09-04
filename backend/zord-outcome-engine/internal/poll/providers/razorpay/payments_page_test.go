package razorpay

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"
)

func paymentJSON(id string, created int64) map[string]any {
	return map[string]any{
		"id": id, "entity": "payment", "amount": 100000, "currency": "INR",
		"status": "captured", "order_id": "order_1", "captured": true,
		"fee": 2900, "tax": 522, "created_at": created,
	}
}

func collection(items []map[string]any) string {
	body, _ := json.Marshal(map[string]any{"entity": "collection", "count": len(items), "items": items})
	return string(body)
}

func TestListPaymentsPageUnixAndCaps(t *testing.T) {
	var gotFrom, gotTo, gotCount, gotSkip string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotFrom = r.URL.Query().Get("from")
		gotTo = r.URL.Query().Get("to")
		gotCount = r.URL.Query().Get("count")
		gotSkip = r.URL.Query().Get("skip")
		w.WriteHeader(200)
		fmt.Fprint(w, collection(nil))
	}))
	defer server.Close()

	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, _ := NewClient(cfg, nil, nil, nil)

	from := time.Unix(1700000000, 0).UTC()
	to := time.Unix(1700003600, 0).UTC()
	_, meta, err := client.ListPaymentsPage(context.Background(), TimeWindow{From: from, To: to}, 0, 500)
	if err != nil {
		t.Fatal(err)
	}
	if gotFrom != "1700000000" || gotTo != "1700003600" {
		t.Fatalf("unix conversion failed from=%s to=%s", gotFrom, gotTo)
	}
	if gotCount != "100" {
		t.Fatalf("count must cap at 100, got %s", gotCount)
	}
	if gotSkip != "" {
		t.Fatalf("skip=0 should be omitted, got %s", gotSkip)
	}
	if meta.Hash == "" || meta.Status != 200 {
		t.Fatalf("expected hashed 200 response, got %+v", meta)
	}
}

func TestListPaymentsPageSkipAdvances(t *testing.T) {
	var skips []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		skips = append(skips, r.URL.Query().Get("skip"))
		skip, _ := strconv.Atoi(r.URL.Query().Get("skip"))
		items := []map[string]any{paymentJSON(fmt.Sprintf("pay_%d", skip), 1700000000)}
		w.WriteHeader(200)
		fmt.Fprint(w, collection(items))
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, _ := NewClient(cfg, nil, nil, nil)
	window := TimeWindow{From: time.Unix(1, 0), To: time.Unix(2, 0)}
	_, _, err := client.ListPaymentsPage(context.Background(), window, 100, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(skips) != 1 || skips[0] != "100" {
		t.Fatalf("expected skip=100, got %v", skips)
	}
}

func TestListPaymentsPageUnauthorizedNoRetryStorm(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(401)
		fmt.Fprint(w, `{"error":{"code":"BAD_REQUEST_ERROR"}}`)
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	cfg.MaxRetries = 3
	client, _ := NewClient(cfg, nil, nil, nil)
	_, _, err := client.ListPaymentsPage(context.Background(), TimeWindow{From: time.Unix(1, 0), To: time.Unix(2, 0)}, 0, 100)
	if err == nil {
		t.Fatal("expected 401")
	}
	pErr, ok := err.(*ProviderError)
	if !ok || pErr.Kind != ErrUnauthorized || pErr.Retryable {
		t.Fatalf("expected non-retryable unauthorized, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("401 must not retry, calls=%d", calls)
	}
}

func TestListPaymentsPageRateLimitRetryable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(429)
		fmt.Fprint(w, `{"error":"rate"}`)
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	cfg.MaxRetries = 0
	client, _ := NewClient(cfg, nil, nil, nil)
	_, _, err := client.ListPaymentsPage(context.Background(), TimeWindow{From: time.Unix(1, 0), To: time.Unix(2, 0)}, 0, 10)
	pErr, _ := err.(*ProviderError)
	if pErr == nil || pErr.Kind != ErrRateLimited || !pErr.Retryable {
		t.Fatalf("expected retryable 429, got %v", err)
	}
}

func TestListPaymentsPageDecodeError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprint(w, `not-json`)
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, _ := NewClient(cfg, nil, nil, nil)
	_, meta, err := client.ListPaymentsPage(context.Background(), TimeWindow{From: time.Unix(1, 0), To: time.Unix(2, 0)}, 0, 10)
	pErr, _ := err.(*ProviderError)
	if pErr == nil || pErr.Kind != ErrDecode {
		t.Fatalf("expected decode error, got %v", err)
	}
	if meta.Hash == "" {
		t.Fatal("decode failures must still hash the raw body")
	}
}

func TestListSettlementReconDayQuery(t *testing.T) {
	var path string
	var q url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		q = r.URL.Query()
		w.WriteHeader(200)
		fmt.Fprint(w, `{"entity":"collection","count":1,"items":[{"entity_id":"pay_1","type":"payment","amount":100000,"credit":96578,"settlement_id":"setl_1","settlement_utr":"utr_1"}]}`)
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, _ := NewClient(cfg, nil, nil, nil)
	page, _, err := client.ListSettlementReconDay(context.Background(), CivilDate{Year: 2026, Month: 8, Day: 26}, 0, 5000)
	if err != nil {
		t.Fatal(err)
	}
	if path != "/settlements/recon/combined" {
		t.Fatalf("path=%s", path)
	}
	if q.Get("year") != "2026" || q.Get("month") != "08" || q.Get("day") != "26" {
		t.Fatalf("date query=%v", q)
	}
	if q.Get("count") != "1000" {
		t.Fatalf("recon count cap=%s", q.Get("count"))
	}
	if len(page.Items) != 1 || page.Items[0].SettlementUTR != "utr_1" {
		t.Fatalf("items=%+v", page.Items)
	}
}

func TestListPaymentsPageContextCancel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(200)
		fmt.Fprint(w, collection(nil))
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, _ := NewClient(cfg, nil, nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()
	_, _, err := client.ListPaymentsPage(ctx, TimeWindow{From: time.Unix(1, 0), To: time.Unix(2, 0)}, 0, 10)
	if err == nil {
		t.Fatal("expected cancellation")
	}
}

func TestFetchPaymentsAliasAndOptionalFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprint(w, collection([]map[string]any{{
			"id": "pay_x", "entity": "payment", "amount": 50000, "currency": "INR",
			"status": "captured", "order_id": "order_9", "method": "upi",
			"captured": true, "fee": 100, "tax": 18, "created_at": 1700000000,
			"captured_at": 1700000060, "email": "payer@example.com", "contact": "+91000",
			"notes": map[string]string{"invoice": "inv_1"},
		}}))
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, _ := NewClient(cfg, nil, nil, nil)
	page, _, err := client.FetchPayments(context.Background(), PaymentFetchOptions{
		From: time.Unix(1, 0), To: time.Unix(2, 0), Count: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("items=%d", len(page.Items))
	}
	got := page.Items[0]
	if got.Method != "upi" || got.Email != "payer@example.com" || got.Contact != "+91000" {
		t.Fatalf("optional fields missing: %+v", got)
	}
	if got.Notes["invoice"] != "inv_1" || got.CapturedAt != 1700000060 {
		t.Fatalf("notes/captured_at=%+v", got)
	}
	adapter := NewBackfillAdapter(client)
	neutral, err := adapter.ListPaymentsPage(context.Background(), time.Unix(1, 0), time.Unix(2, 0), 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(neutral.Items) != 1 || neutral.Items[0].Status != "captured" || neutral.Items[0].Method != "upi" {
		t.Fatalf("neutral=%+v", neutral.Items)
	}
}

func TestNormalizePaymentStatusUnknown(t *testing.T) {
	if NormalizePaymentStatus("CAPTURED") != "captured" {
		t.Fatal("expected lowercase captured")
	}
	if NormalizePaymentStatus("nope") != "unknown" {
		t.Fatal("expected unknown")
	}
}

func TestListPaymentsPageEmptyStops(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprint(w, collection(nil))
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, _ := NewClient(cfg, nil, nil, nil)
	page, _, err := client.ListPaymentsPage(context.Background(), TimeWindow{From: time.Unix(1, 0), To: time.Unix(2, 0)}, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 0 {
		t.Fatalf("expected empty page, got %d", len(page.Items))
	}
}
