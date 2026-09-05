package razorpay

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFetchRefund(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/refunds/rfnd_1" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		w.WriteHeader(200)
		fmt.Fprintf(w, `{"id":"rfnd_1","entity":"refund","payment_id":"pay_1","amount":2000,"currency":"INR","status":"processed"}`)
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, err := NewClient(cfg, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	got, err := client.FetchRefund(ctx, "rfnd_1")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "rfnd_1" || got.PaymentID != "pay_1" || got.Amount != 2000 {
		t.Fatalf("%+v", got)
	}
}

func TestListRefundsPage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/refunds" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		w.WriteHeader(200)
		fmt.Fprintf(w, `{"entity":"collection","count":1,"items":[{"id":"rfnd_1","entity":"refund","payment_id":"pay_1","amount":500,"currency":"INR","status":"processed"}]}`)
	}))
	defer server.Close()
	cfg := testConfig()
	cfg.BaseURL = server.URL
	client, err := NewClient(cfg, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	page, err := client.ListRefundsPage(context.Background(), 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if page.Count != 1 || len(page.Items) != 1 || page.Items[0].ID != "rfnd_1" {
		t.Fatalf("%+v", page)
	}
}
