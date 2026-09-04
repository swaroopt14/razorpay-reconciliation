package db

import (
	"context"
	"database/sql"
	_ "embed"
	"log"
	"time"

	_ "github.com/lib/pq"
)

//go:embed init.sql
var schemaSQL string

// Connect opens a PostgreSQL connection pool and retries until the DB
// is reachable or the retry budget is exhausted.
// maxOpen and maxIdle should be sized to match the total worker count
// across all loops — not arbitrarily large.
func Connect(dbURL string, maxOpen, maxIdle int) *sql.DB {
	conn, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("db: failed to open connection: %v", err)
	}

	conn.SetMaxOpenConns(maxOpen)
	conn.SetMaxIdleConns(maxIdle)
	conn.SetConnMaxLifetime(10 * time.Minute)
	conn.SetConnMaxIdleTime(5 * time.Minute)

	for attempt := 1; attempt <= 30; attempt++ {
		if err = conn.Ping(); err == nil {
			log.Printf("db: connected (attempt %d)", attempt)
			return conn
		}
		log.Printf("db: ping failed (attempt %d/30): %v — retrying in 2s", attempt, err)
		time.Sleep(2 * time.Second)
	}

	log.Fatalf("db: failed to connect after 30 attempts: %v", err)
	return nil
}

// EnsureSchema applies the relay schema so Kubernetes deployments do not
// depend on docker-compose init script mounts.
func EnsureSchema(ctx context.Context, conn *sql.DB) {
	if ctx == nil {
		ctx = context.Background()
	}
	if _, err := conn.ExecContext(ctx, schemaSQL); err != nil {
		log.Fatalf("db: failed to apply relay schema: %v", err)
	}
	log.Println("db: relay schema ensured")
}
