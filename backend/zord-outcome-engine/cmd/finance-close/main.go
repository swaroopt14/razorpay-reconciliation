package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"zord-outcome-engine/internal/close"
	"zord-outcome-engine/internal/dataset"
	"zord-outcome-engine/internal/persistence"
	"zord-outcome-engine/internal/recon"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/pressly/goose/v3"
	"database/sql"
)

func main() {
	profile := flag.String("profile", "realistic", "realistic or stress")
	limit := flag.Int("limit", 120, "record count")
	tenant := flag.String("tenant", "", "tenant UUID")
	connector := flag.String("connector", "", "connector UUID")
	batch := flag.String("batch", "", "batch id")
	account := flag.String("account", "demo-acc-1", "bank account id")
	seedOnly := flag.Bool("seed-only", false, "seed without close run")
	flag.Parse()

	_ = godotenv.Load()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL required")
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
		TenantID: *tenant, ConnectorID: *connector, BatchID: *batch, AccountID: *account,
		Profile: *profile, Limit: *limit, Truncate: true,
	})
	if err != nil {
		log.Fatal("seed:", err)
	}
	if *seedOnly {
		printJSON(seedRes)
		return
	}

	reconStore := persistence.NewReconSQLStore(db)
	finSvc := recon.NewFinancialService(reconStore)
	closeSvc := close.NewService(finSvc, &close.Store{DB: db}, reconStore)
	rep, err := closeSvc.Run(ctx, close.RunRequest{
		TenantID: seedRes.TenantID, ConnectorID: seedRes.ConnectorID, AccountID: *account, BatchID: seedRes.BatchID,
	})
	if err != nil {
		log.Fatal("close:", err)
	}
	printJSON(rep)
	fmt.Fprintf(os.Stderr, "close complete: %d records, match_rate=%.1f%%, exceptions=%d, throughput=%.0f/s, precision=%.2f recall=%.2f\n",
		rep.Records, rep.MatchRate*100, rep.Exceptions, rep.ThroughputPerS, rep.Accuracy.Precision, rep.Accuracy.Recall)
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}
