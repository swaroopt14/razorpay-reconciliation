package db

// Why package "db"?
// All files in the db/ folder have "package db"
// main.go imports it as:
//   import "github.com/zord/zord-intelligence/db"
//   pool := db.Connect(cfg)

import (
	"context"
	_ "embed"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/config"
	"time"
)

//go:embed init.sql
var schemaSQL string

// Connect opens a PostgreSQL connection pool and returns it.
//
// A "pool" means Go keeps multiple DB connections open and reuses them.
// Instead of opening a new connection for every query (slow),
// your code borrows one from the pool, uses it, returns it.
//
// Call this once in main.go:
//
//	pool := db.Connect(cfg)
//	defer pool.Close()   ← close pool when service shuts down
//
// Then pass pool to your repositories:
//
//	projRepo := persistence.NewProjectionRepo(pool)
func Connect(cfg *config.Config) *pgxpool.Pool {

	// context.Background() is Go's way of saying "no deadline, no cancellation"
	// We use it here because this is startup code — we want it to run fully
	ctx := context.Background()

	// pgxpool.ParseConfig allows us to define pool size and boundaries
	pgxCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: failed to parse database connection string: %v", err)
	}

	// ── Performance: Pool limits tuned for 1500-2000 events/sec ──────────
	// MaxConns=150 supports up to 20 parallel consumer goroutines × ~5 concurrent
	// DB calls each, plus outbox workers and HTTP handlers.
	// MinConns=20 keeps warm connections ready so burst events never wait for handshake.
	pgxCfg.MaxConns = 150
	pgxCfg.MinConns = 20
	pgxCfg.MaxConnLifetime = 1 * time.Hour
	pgxCfg.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, pgxCfg)

	if err != nil {
		log.Fatalf("db: failed to create connection pool: %v", err)
	}

	// Ping sends a test query to verify the connection actually works
	// Catches problems like: wrong password, DB not running, network issue
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("db: failed to ping database: %v", err)
	}

	log.Println("db: connected to PostgreSQL successfully")

	// Return the pool — main.go will pass this to all repositories
	return pool
}

// EnsureSchema applies the intelligence schema on startup so Kubernetes
// deployments do not rely on external SQL bootstrap steps.
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) {
	if ctx == nil {
		ctx = context.Background()
	}
	if _, err := pool.Exec(ctx, schemaSQL); err != nil {
		log.Fatalf("db: failed to apply intelligence schema: %v", err)
	}
	log.Println("db: intelligence schema ensured")
}

// expectedColumnTypes is the ground truth of what column types the Go code relies on.
// If the live DB diverges (e.g. stale Docker volume from an older schema), the service
// must refuse to start rather than silently writing wrong data.
var expectedColumnTypes = map[string]map[string]string{
	"batch_contracts": {
		"total_intended_amount_minor":  "numeric",
		"total_confirmed_amount_minor": "numeric",
		"total_variance_minor":         "numeric",
	},
	// Phase 3 refactor: the projection_state scope/source/retention metadata
	// must exist before this code writes projections (migrations 008/009 in
	// production; init.sql's ALTER block for dev volumes).
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
	// Phase 5 refactor: policy/action/outbox hardening columns must exist
	// before this code writes them (migrations 010-013 in production;
	// init.sql's ALTER block for dev volumes). "Phase 5 (refactor)" here is
	// this refactor's phase, unrelated to the codebase's own pre-existing
	// "PHASE 5" approval-lifecycle feature naming (see init.sql's note).
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

// productionIndexes lists every index that must be created CONCURRENTLY on
// live production databases. CONCURRENTLY never holds a write lock, so it is
// safe to run against a hot table with millions of rows.
//
// Each entry is executed as a separate pool.Exec so there is no implicit
// transaction — CREATE INDEX CONCURRENTLY is forbidden inside a transaction block.
//
// On a fresh (empty) DB the build is instantaneous.
// On a live DB it may take seconds to minutes; the service starts normally while
// it runs — Postgres allows reads and writes throughout.
var productionIndexes = []struct{ name, sql string }{
	{
		"idx_batch_tenant_amount",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batch_tenant_amount
		 ON batch_contracts (tenant_id, total_intended_amount_minor DESC NULLS LAST)`,
	},
	{
		"idx_snapshots_latest",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_snapshots_latest
		 ON intelligence_snapshots (tenant_id, snapshot_type, created_at DESC)`,
	},
	// ── Phase 3 refactor: projection_state scoped-metadata indexes ─────────
	// Mirrored in db/migrations/008 (prod k8s Job) and init.sql (fresh DBs) —
	// listed here so a live dev/prod table that somehow missed both still gets
	// them without a write lock.
	{
		"uq_projection_v2",
		`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_projection_v2
		 ON projection_state (tenant_id, scope_type, scope_ref, projection_family, metric_key,
		                      window_type, window_start, projection_source, projection_version)`,
	},
	{
		"idx_projection_scope_family_metric",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projection_scope_family_metric
		 ON projection_state (tenant_id, scope_type, scope_ref, projection_family, metric_key)`,
	},
	{
		"idx_projection_family_window",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projection_family_window
		 ON projection_state (tenant_id, projection_family, window_end DESC)`,
	},
	{
		"idx_projection_retention_expiry",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projection_retention_expiry
		 ON projection_state (retention_class, expires_at)
		 WHERE expires_at IS NOT NULL`,
	},
	// ── Phase 5 (refactor): policy/action/outbox hardening indexes ─────────
	// Mirrored in db/migrations/010-013 (prod k8s Job) and init.sql (fresh DBs).
	{
		"idx_ac_scope_type_ref",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ac_scope_type_ref
		 ON action_contracts (tenant_id, scope_type, scope_ref, created_at DESC)`,
	},
	{
		"idx_ac_policy_registry",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ac_policy_registry
		 ON action_contracts (policy_registry_id)`,
	},
	{
		"idx_outbox_tenant_scope",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outbox_tenant_scope
		 ON actuation_outbox (tenant_id, scope_type, scope_ref, created_at DESC)`,
	},
	{
		"idx_policy_def_trigger",
		`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_policy_def_trigger
		 ON policy_definitions (policy_family, trigger_type, trigger_value, policy_source, policy_version)`,
	},
}

// EnsureProductionIndexes builds every index in productionIndexes using
// CREATE INDEX CONCURRENTLY IF NOT EXISTS.
//
// Call this from main.go immediately after EnsureSchema.
// It is non-fatal: a failure is logged and the service continues (the index
// may already be in-flight from a previous startup attempt).
func EnsureProductionIndexes(ctx context.Context, pool *pgxpool.Pool) {
	if ctx == nil {
		ctx = context.Background()
	}
	for _, idx := range productionIndexes {
		if _, err := pool.Exec(ctx, idx.sql); err != nil {
			// Non-fatal: log and continue. Common cause: concurrent build already
			// in progress from a parallel pod startup (safe to ignore).
			log.Printf("db: EnsureProductionIndexes: %s skipped: %v", idx.name, err)
		} else {
			log.Printf("db: production index ensured (concurrent): %s", idx.name)
		}
	}
}

// ValidateSchema checks that critical columns in the live DB match the types the
// Go code expects. Call this immediately after EnsureSchema in main.go.
// Fatals on mismatch so a stale Docker volume is caught at startup, not at runtime.
func ValidateSchema(ctx context.Context, pool *pgxpool.Pool) {
	if ctx == nil {
		ctx = context.Background()
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

// EnsureBatchFinalityStatusVocabulary rewrites legacy SETTLED row values and
// ensures the batch_contracts check constraint accepts canonical RECONCILED labels.
func EnsureBatchFinalityStatusVocabulary(ctx context.Context, pool *pgxpool.Pool) {
	if ctx == nil {
		ctx = context.Background()
	}

	stmts := []string{
		`UPDATE batch_contracts SET batch_finality_status = 'FULLY_RECONCILED'
		 WHERE batch_finality_status IN ('FULLY_SETTLED', 'SETTLED')`,
		`UPDATE batch_contracts SET batch_finality_status = 'PARTIALLY_RECONCILED'
		 WHERE batch_finality_status = 'PARTIALLY_SETTLED'`,
		`ALTER TABLE batch_contracts DROP CONSTRAINT IF EXISTS batch_contracts_batch_finality_status_check`,
		`ALTER TABLE batch_contracts ADD CONSTRAINT batch_contracts_batch_finality_status_check
		 CHECK (batch_finality_status IN (
		   'PROCESSING',
		   'FULLY_RECONCILED',
		   'PARTIALLY_RECONCILED',
		   'FAILED',
		   'REQUIRES_REVIEW',
		   'CLOSED'
		 ))`,
	}

	for _, stmt := range stmts {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			log.Printf("db: EnsureBatchFinalityStatusVocabulary skipped statement: %v", err)
		}
	}
	log.Println("db: batch finality vocabulary ensured")
}
