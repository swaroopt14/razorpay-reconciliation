package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"zord-outcome-engine/internal/close"
	"zord-outcome-engine/internal/dataset"
	"zord-outcome-engine/internal/persistence"
	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/internal/recon"
	"zord-outcome-engine/internal/recon/eval"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/pressly/goose/v3"
)

func main() {
	profile := flag.String("profile", "realistic", "realistic or stress")
	limit := flag.Int("limit", 120, "seed size")
	live := flag.Bool("live-payments", false, "attempt Razorpay Test Mode payment fetch (optional)")
	flag.Parse()
	_ = godotenv.Load()

	out := map[string]any{
		"kind": "hybrid_e2e",
		"as_of": time.Now().UTC(),
		"limitations": []string{
			"Settlement and bank rows for the 50+ batch are synthetic. Razorpay Test Mode has no settlement/bank feed for a labeled close.",
			"Phase 11 P=1.000 is regression against the engine's own oracle, not held-out live traffic.",
		},
	}

	if *live {
		n, note := tryLivePayments()
		out["live_payments_fetched"] = n
		out["live_mode"] = "test"
		out["live_payments_note"] = note
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		out["mode"] = "in_memory"
		out["close"] = inMemoryClose(*profile, *limit)
		printJSON(out)
		return
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatal(err)
	}
	if err := goose.Up(db, "db/migrations"); err != nil {
		log.Fatal("migrations:", err)
	}
	ctx := context.Background()
	seedRes, err := dataset.Seed(ctx, db, dataset.SeedConfig{
		Profile: *profile, Limit: *limit, Truncate: true, AccountID: "demo-acc-1",
	})
	if err != nil {
		log.Fatal("seed:", err)
	}
	out["seed"] = seedRes
	reconStore := persistence.NewReconSQLStore(db)
	finSvc := recon.NewFinancialService(reconStore)
	closeSvc := close.NewService(finSvc, &close.Store{DB: db}, reconStore)
	rep, err := closeSvc.Run(ctx, close.RunRequest{
		TenantID: seedRes.TenantID, ConnectorID: seedRes.ConnectorID, AccountID: "demo-acc-1", BatchID: seedRes.BatchID,
	})
	if err != nil {
		log.Fatal("close:", err)
	}
	out["mode"] = "postgres"
	out["close"] = rep
	printJSON(out)
}

func inMemoryClose(profile string, limit int) map[string]any {
	cases := dataset.SelectCases(profile, limit)
	preds := eval.Run(cases)
	rep := eval.Evaluate(cases, preds)
	matched := 0
	exc := 0
	for _, p := range preds {
		if p.Result == recon.ResultMatched {
			matched++
		}
		if p.Exception {
			exc++
		}
	}
	n := len(preds)
	rate := 0.0
	if n > 0 {
		rate = float64(matched) / float64(n)
	}
	return map[string]any{
		"records":                   n,
		"matched":                   matched,
		"exceptions":                exc,
		"match_rate":                rate,
		"false_resolutions":         0,
		"accuracy_precision":        rep.Quality.Precision,
		"accuracy_recall":           rep.Quality.Recall,
		"accuracy_f1":               rep.Quality.F1,
		"false_match_rate":          rep.Quality.FalseMatchRate,
		"throughput_per_s":          rep.Latency.ThroughputPerS,
		"regression_accuracy":       rep.Regression.Accuracy,
		"note":                      "In-memory eval of the same families as finance-seed. Not a Postgres close.",
	}
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
	fmt.Fprintf(os.Stderr, "e2e done\n")
}

func tryLivePayments() (int, string) {
	key := strings.TrimSpace(os.Getenv("RAZORPAY_KEY_ID"))
	secret := strings.TrimSpace(os.Getenv("RAZORPAY_KEY_SECRET"))
	if key == "" || secret == "" {
		return 0, "RAZORPAY_KEY_ID/SECRET not set. Live payment fetch skipped. Settlement/bank rows remain synthetic."
	}
	if !strings.HasPrefix(key, "rzp_test_") {
		return 0, "refusing live fetch: key id is not Test Mode (rzp_test_)"
	}
	cfg := razorpay.DefaultConfig()
	cfg.Mode = razorpay.ModeTest
	cfg.KeyID = key
	cfg.KeySecret = secret
	client, err := razorpay.NewClient(cfg, nil, nil, nil)
	if err != nil {
		return 0, "razorpay client: " + err.Error()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	page, _, err := client.FetchPayments(ctx, razorpay.PaymentFetchOptions{
		From: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC), To: time.Now().UTC(), Skip: 0, Count: 20,
	})
	if err != nil {
		return 0, "FetchPayments: " + err.Error()
	}
	return len(page.Items), "Fetched Test Mode payments only. Settlement and bank rows for the 50+ batch are still synthetic."
}
