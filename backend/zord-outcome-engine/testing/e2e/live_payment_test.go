package e2e_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
)

// Live Test Mode payment fetch. Skipped unless RAZORPAY_E2E=1 and Test Mode keys are set.
// Settlement + bank for the 50+ labeled batch are not available from Test Mode.
func TestLiveTestModePaymentFetch(t *testing.T) {
	if os.Getenv("RAZORPAY_E2E") != "1" {
		t.Skip("set RAZORPAY_E2E=1 and Test Mode keys to run live payment fetch")
	}
	key := strings.TrimSpace(os.Getenv("RAZORPAY_KEY_ID"))
	secret := strings.TrimSpace(os.Getenv("RAZORPAY_KEY_SECRET"))
	if key == "" || secret == "" || !strings.HasPrefix(key, "rzp_test_") {
		t.Skip("RAZORPAY_KEY_ID/SECRET Test Mode keys not set")
	}
	cfg := razorpay.DefaultConfig()
	cfg.Mode = razorpay.ModeTest
	cfg.KeyID = key
	cfg.KeySecret = secret
	client, err := razorpay.NewClient(cfg, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	page, _, err := client.FetchPayments(ctx, razorpay.PaymentFetchOptions{
		From: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC), To: time.Now().UTC(), Skip: 0, Count: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("live_payments_fetched=%d live_mode=test", len(page.Items))
}
