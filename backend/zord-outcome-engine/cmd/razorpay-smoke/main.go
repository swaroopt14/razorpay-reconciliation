package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"

	"zord-outcome-engine/internal/persistence"
	"zord-outcome-engine/internal/poll"
	"zord-outcome-engine/internal/poll/providers/razorpay"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load(".env")

	cfg := razorpay.DefaultConfig()
	cfg.Mode = razorpay.ModeTest
	cfg.KeyID = strings.TrimSpace(os.Getenv("RAZORPAY_KEY_ID"))
	cfg.KeySecret = strings.TrimSpace(os.Getenv("RAZORPAY_KEY_SECRET"))
	if err := cfg.Validate(); err != nil {
		fmt.Fprintf(os.Stderr, "config: %v\n", err)
		os.Exit(1)
	}
	if !strings.HasPrefix(cfg.KeyID, "rzp_test_") {
		fmt.Fprintln(os.Stderr, "refusing smoke: key id is not Test Mode (rzp_test_)")
		os.Exit(1)
	}
	if os.Getenv("RAZORPAY_ALLOW_LIVE") == "true" {
		fmt.Fprintln(os.Stderr, "refusing smoke: RAZORPAY_ALLOW_LIVE=true")
		os.Exit(1)
	}

	client, err := razorpay.NewClient(cfg, nil, nil, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "client: %v\n", redact(err))
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	health, err := client.HealthCheck(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "health: %v\n", redact(err))
		os.Exit(1)
	}
	fmt.Printf("health status=%s mode=%s latency_ms=%d http_error=%s\n",
		health.Status, health.Mode, health.LatencyMs, health.ErrorCode)
	if health.Status != "healthy" {
		os.Exit(1)
	}

	to := time.Now().UTC()
	from := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	page, meta, err := client.FetchPayments(ctx, razorpay.PaymentFetchOptions{
		From: from, To: to, Skip: 0, Count: 10,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "fetch: %v\n", redact(err))
		os.Exit(1)
	}
	fmt.Printf("payments window=%s..%s count=%d status=%d hash=%s\n",
		from.Format(time.RFC3339), to.Format(time.RFC3339), len(page.Items), meta.Status, meta.Hash)

	adapter := razorpay.NewBackfillAdapter(client)
	neutral, err := adapter.ListPaymentsPage(ctx, from, to, 0, 10)
	if err != nil {
		fmt.Fprintf(os.Stderr, "normalize: %v\n", redact(err))
		os.Exit(1)
	}
	for i, p := range neutral.Items {
		fmt.Printf("  [%d] id=%s status=%s amount_minor=%d currency=%s captured=%t order=%s method=%s\n",
			i, p.PaymentID, p.Status, p.AmountMinor, p.Currency, p.Captured, p.OrderID, p.Method)
	}

	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		fmt.Println("skip persist: DATABASE_URL unset")
		return
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db open: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := db.PingContext(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "db ping: %v\n", err)
		os.Exit(1)
	}
	store := persistence.NewSQLStore(db)
	tenant := "11111111-1111-1111-1111-111111111111"
	connector := "22222222-2222-2222-2222-222222222222"
	var inserted, updated, dup int
	for _, item := range neutral.Items {
		res, err := store.UpsertPayment(ctx, poll.PaymentObservation{
			TenantID:       tenant,
			ConnectorID:    connector,
			Provider:       "razorpay",
			ProviderMode:   "test",
			Item:           item,
			Source:         poll.SourceAPIBackfill,
			Sources:        []string{poll.SourceAPIBackfill},
			WebhookMissing: true,
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "upsert %s: %v\n", item.PaymentID, err)
			os.Exit(1)
		}
		switch res {
		case poll.UpsertInserted:
			inserted++
		case poll.UpsertUpdated:
			updated++
		default:
			dup++
		}
	}
	fmt.Printf("persist inserted=%d updated=%d duplicates=%d\n", inserted, updated, dup)
}

func redact(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	msg = strings.ReplaceAll(msg, os.Getenv("RAZORPAY_KEY_SECRET"), "[redacted]")
	msg = strings.ReplaceAll(msg, os.Getenv("RAZORPAY_KEY_ID"), "[redacted]")
	return fmt.Errorf("%s", msg)
}
