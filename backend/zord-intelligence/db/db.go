package db

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/config"
)

// Connect opens a PostgreSQL connection pool and returns it.
func Connect(cfg *config.Config) *pgxpool.Pool {
	ctx := context.Background()

	pgxCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: failed to parse database connection string: %v", err)
	}

	pgxCfg.MaxConns = 150
	pgxCfg.MinConns = 20
	pgxCfg.MaxConnLifetime = 1 * time.Hour
	pgxCfg.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, pgxCfg)
	if err != nil {
		log.Fatalf("db: failed to create connection pool: %v", err)
	}

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("db: failed to ping database: %v", err)
	}

	log.Println("db: connected to PostgreSQL successfully")
	return pool
}

// ValidateSchema checks that critical columns in the live DB match the types the
// Go code expects. Fatals on mismatch so a stale Docker volume is caught at startup.
func ValidateSchema(ctx context.Context, pool *pgxpool.Pool) {
	if ctx == nil {
		ctx = context.Background()
	}

	expectedColumnTypes := map[string]map[string]string{
		"batch_contracts": {
			"total_intended_amount_minor":  "numeric",
			"total_confirmed_amount_minor": "numeric",
			"total_variance_minor":         "numeric",
		},
		"projection_state": {
			"scope_type":        "text",
			"scope_ref":         "text",
			"metric_key":        "text",
			"window_type":       "text",
			"projection_source": "text",
			"value_hash":        "text",
			"retention_class":   "text",
			"expires_at":        "timestamp with time zone",
		},
		"action_contracts": {
			"policy_registry_id":  "uuid",
			"scope_type":          "text",
			"scope_ref":           "text",
			"payload_hash":        "text",
			"signature_algorithm": "text",
		},
		"actuation_outbox": {
			"tenant_id":    "text",
			"scope_type":   "text",
			"payload_hash": "text",
			"last_error":   "text",
		},
	}

	for table, columns := range expectedColumnTypes {
		for column, wantType := range columns {
			var gotType string
			err := pool.QueryRow(ctx, `
				SELECT data_type
				FROM information_schema.columns
				WHERE table_name = $1 AND column_name = $2
			`, table, column).Scan(&gotType)
			if err != nil {
				log.Fatalf("db: schema validation failed — could not read column %s.%s: %v", table, column, err)
			}
			if gotType != wantType {
				log.Fatalf("db: schema mismatch on %s.%s — live DB has %q but code expects %q. "+
					"Run: ALTER TABLE %s ALTER COLUMN %s TYPE %s USING %s::%s",
					table, column, gotType, wantType,
					table, column, wantType, column, wantType)
			}
		}
	}
	log.Println("db: schema validation passed")
}
