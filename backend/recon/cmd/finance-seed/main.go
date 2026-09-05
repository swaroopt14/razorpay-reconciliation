package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"zord-outcome-engine/internal/dataset"

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
	truncate := flag.Bool("truncate", false, "delete existing tenant data first")
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

	res, err := dataset.Seed(context.Background(), db, dataset.SeedConfig{
		TenantID: *tenant, ConnectorID: *connector, BatchID: *batch, AccountID: *account,
		Profile: *profile, Limit: *limit, Truncate: *truncate,
	})
	if err != nil {
		log.Fatal(err)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(res)
	fmt.Fprintf(os.Stderr, "seeded %d records (%d clean, %d exception-bearing) tenant=%s connector=%s batch=%s\n",
		res.Records, res.Clean, res.Exceptions, res.TenantID, res.ConnectorID, res.BatchID)
}
