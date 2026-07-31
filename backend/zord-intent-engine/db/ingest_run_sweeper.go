package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// SweptIngestRun identifies one run the sweeper moved out of PROCESSING (or
// promoted from a recoverable failure to FAILED_FINAL), for logging/alerting
// by the caller.
type SweptIngestRun struct {
	RunID     string
	TenantID  string
	BatchID   string
	NewStatus string
}

// SweepStuckIngestRuns classifies intent_ingest_runs rows nothing has
// touched in a while (4.2.4). It runs two independent passes:
//
//  1. PROCESSING runs whose last_heartbeat_at is older than staleAfter are
//     genuinely stuck — the writer that owned them crashed or was killed
//     before it could call UpsertIngestRun with a terminal status. They're
//     classified PARTIAL_FAILED if any rows were recorded at all (so an
//     operator knows partial data landed) or FAILED_RETRYABLE otherwise
//     (nothing landed, so a clean retry is safe).
//  2. Runs already sitting in a recoverable failure state
//     (FAILED_RETRYABLE/PARTIAL_FAILED) for longer than terminalAfter are
//     promoted to FAILED_FINAL — automatic recovery (a new row landing via
//     EnsureIngestRun/UpsertIngestRun, which self-heals those two states
//     back to PROCESSING) has had its chance and didn't happen.
//
// Both passes are plain UPDATE ... WHERE ... RETURNING statements — safe to
// call concurrently from multiple replicas since each row is only ever
// picked up by whichever call's WHERE clause still matches it at UPDATE
// time; a second concurrent sweep simply finds nothing left to do.
func SweepStuckIngestRuns(ctx context.Context, db *sql.DB, staleAfter, terminalAfter time.Duration) ([]SweptIngestRun, error) {
	stuck, err := sweepProcessingToFailed(ctx, db, staleAfter)
	if err != nil {
		return nil, fmt.Errorf("SweepStuckIngestRuns: stale PROCESSING pass: %w", err)
	}

	terminal, err := sweepRecoverableToFinal(ctx, db, terminalAfter)
	if err != nil {
		return nil, fmt.Errorf("SweepStuckIngestRuns: terminal promotion pass: %w", err)
	}

	return append(stuck, terminal...), nil
}

func sweepProcessingToFailed(ctx context.Context, dbConn *sql.DB, staleAfter time.Duration) ([]SweptIngestRun, error) {
	const q = `
		UPDATE intent_ingest_runs
		SET status = CASE
		        WHEN accepted_rows > 0 OR failed_rows > 0 OR duplicate_rows > 0 THEN 'PARTIAL_FAILED'
		        ELSE 'FAILED_RETRYABLE'
		    END,
		    last_error_code   = COALESCE(last_error_code, 'INGEST_RUN_STALE'),
		    last_error_detail = COALESCE(last_error_detail,
		        'No heartbeat within the stale threshold; swept out of PROCESSING by the ingest-run sweeper'),
		    completed_at      = COALESCE(completed_at, now())
		WHERE status = 'PROCESSING'
		  AND COALESCE(last_heartbeat_at, started_at, 'epoch'::timestamptz) < now() - $1::interval
		RETURNING run_id, tenant_id, batch_id, status`

	return runSweepQuery(ctx, dbConn, q, fmt.Sprintf("%d seconds", int(staleAfter.Seconds())))
}

func sweepRecoverableToFinal(ctx context.Context, dbConn *sql.DB, terminalAfter time.Duration) ([]SweptIngestRun, error) {
	const q = `
		UPDATE intent_ingest_runs
		SET status = 'FAILED_FINAL',
		    last_error_detail = COALESCE(last_error_detail, '') ||
		        CASE WHEN last_error_detail IS NULL OR last_error_detail = '' THEN '' ELSE '; ' END ||
		        'promoted to FAILED_FINAL by the ingest-run sweeper: no recovery within the terminal threshold'
		WHERE status IN ('FAILED_RETRYABLE', 'PARTIAL_FAILED')
		  AND COALESCE(last_heartbeat_at, started_at, 'epoch'::timestamptz) < now() - $1::interval
		RETURNING run_id, tenant_id, batch_id, status`

	return runSweepQuery(ctx, dbConn, q, fmt.Sprintf("%d seconds", int(terminalAfter.Seconds())))
}

func runSweepQuery(ctx context.Context, dbConn *sql.DB, query, interval string) ([]SweptIngestRun, error) {
	rows, err := dbConn.QueryContext(ctx, query, interval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var swept []SweptIngestRun
	for rows.Next() {
		var r SweptIngestRun
		if err := rows.Scan(&r.RunID, &r.TenantID, &r.BatchID, &r.NewStatus); err != nil {
			return swept, err
		}
		swept = append(swept, r)
	}
	return swept, rows.Err()
}

// StartIngestRunSweeper runs SweepStuckIngestRuns on a fixed interval until
// ctx is cancelled. staleAfter/terminalAfter follow the same semantics as
// SweepStuckIngestRuns. Intended to be started once as a background
// goroutine from main() — every replica running it concurrently is safe (see
// SweepStuckIngestRuns).
func StartIngestRunSweeper(ctx context.Context, dbConn *sql.DB, tick, staleAfter, terminalAfter time.Duration) {
	ticker := time.NewTicker(tick)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			swept, err := SweepStuckIngestRuns(ctx, dbConn, staleAfter, terminalAfter)
			if err != nil {
				log.Printf("⚠️ ingest-run sweeper: %v", err)
				continue
			}
			for _, r := range swept {
				if r.RunID == "" {
					continue
				}
				log.Printf("⚠️ ingest-run sweeper: run_id=%s tenant=%s batch=%s -> %s",
					r.RunID, r.TenantID, r.BatchID, r.NewStatus)
			}
		}
	}
}
