package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
)

var DB *sql.DB

// jsonOrNull guards against a Go gotcha: a nil/empty []byte passed as a query
// arg is NOT the same as SQL NULL — database/sql only converts a bare
// interface{} nil to NULL, and a nil slice boxed into interface{} still
// carries its concrete []byte type, so it reaches Postgres as a zero-length
// value and fails jsonb columns with "invalid input syntax for type json".
// Rows that were DLQ'd before their payload was ever decrypted (e.g.
// MISSING_OBJECT_REF, MISSING_TRACE_ID) have no raw_row_json to record.
func jsonOrNull(b []byte) interface{} {
	if len(b) == 0 {
		return nil
	}
	return b
}

// EnsureIngestRun returns the stable run_id for (tenant_id, batch_id),
// creating the intent_ingest_runs row if it doesn't exist yet. Call this
// before writing any intent_ingest_rows for a batch so each row can carry a
// real run_id — previously every caller generated a throwaway uuid.New()
// that UpsertIngestRun's ON CONFLICT silently discarded on every call after
// the first, so run_id was never actually usable as a join key.
func EnsureIngestRun(ctx context.Context, db *sql.DB, tenantID, batchID string) (string, error) {
	const q = `
		INSERT INTO intent_ingest_runs (run_id, tenant_id, batch_id, status)
		VALUES (gen_random_uuid(), $1, $2, 'PROCESSING')
		ON CONFLICT (tenant_id, batch_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
		RETURNING run_id`

	var runID string
	if err := db.QueryRowContext(ctx, q, tenantID, batchID).Scan(&runID); err != nil {
		return "", fmt.Errorf("EnsureIngestRun: %w", err)
	}
	return runID, nil
}

// UpsertIngestRun inserts or updates an intent_ingest_runs row at the end of
// a bulk ingest. It uses ON CONFLICT on (tenant_id, batch_id) to update run stats
// atomically, since batch_id alone is client-supplied and not globally unique.
func UpsertIngestRun(
	ctx context.Context,
	db *sql.DB,
	runID, batchID, tenantID, mappingID, profileID, fileName, fileHash string,
	total, accepted, failed, duplicate int,
	status string,
) error {
	const q = `
		INSERT INTO intent_ingest_runs
		    (run_id, batch_id, tenant_id, mapping_id, profile_id, file_name, file_hash,
		     total_rows, accepted_rows, failed_rows, duplicate_rows, status, completed_at)
		VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''),
		        $8, $9, $10, $11, $12, now())
		ON CONFLICT (tenant_id, batch_id) DO UPDATE SET
		    mapping_id     = EXCLUDED.mapping_id,
		    total_rows     = EXCLUDED.total_rows,
		    accepted_rows  = EXCLUDED.accepted_rows,
		    failed_rows    = EXCLUDED.failed_rows,
		    duplicate_rows = EXCLUDED.duplicate_rows,
		    status         = EXCLUDED.status,
		    completed_at   = now()`

	_, err := db.ExecContext(ctx, q,
		runID, batchID, tenantID, mappingID, profileID, fileName, fileHash,
		total, accepted, failed, duplicate, status,
	)
	if err != nil {
		return fmt.Errorf("UpsertIngestRun: %w", err)
	}
	return nil
}

// InsertIngestRow writes a single per-row audit record into intent_ingest_rows.
// Called by the intent-engine when it processes each row-level envelope from Kafka.
// The full match entry (mapping_id, profile_id, status, raw_row_json, etc.) is written
// in one shot — same pattern as UpsertIngestRun was used in zord-edge bulk_handler.
func InsertIngestRow(
	ctx context.Context,
	db *sql.DB,
	runID string,
	batchID, tenantID, mappingID, profileID string,
	rowIndex int,
	idempotencyKey, status, errorDetail, sourceSystem, fileName, fileHash string,
	rawRowJSON []byte,
) error {
	const q = `
		INSERT INTO intent_ingest_rows
		    (run_id, batch_id, tenant_id, mapping_id, profile_id, row_index,
		     idempotency_key, status, error_detail, source_system,
		     file_name, file_hash, raw_row_json)
		VALUES (NULLIF($1,'')::uuid, $2, $3, $4, NULLIF($5,''), $6,
		        NULLIF($7,''), $8, NULLIF($9,''), NULLIF($10,''),
		        NULLIF($11,''), NULLIF($12,''), $13)`

	_, err := db.ExecContext(ctx, q,
		runID, batchID, tenantID, mappingID, profileID, rowIndex,
		idempotencyKey, status, errorDetail, sourceSystem,
		fileName, fileHash, jsonOrNull(rawRowJSON),
	)
	if err != nil {
		return fmt.Errorf("InsertIngestRow: %w", err)
	}
	return nil
}

type IngestRowItem struct {
	RunID                                    string
	BatchID, TenantID, MappingID, ProfileID string
	RowIndex                                int
	IdempotencyKey, Status, ErrorDetail     string
	SourceSystem, FileName, FileHash        string
	RawRowJSON                              []byte
}

func InsertIngestRowsBatch(
	ctx context.Context,
	dbConn *sql.DB,
	items []IngestRowItem,
) error {
	if len(items) == 0 {
		return nil
	}

	const chunkSize = 500
	const rowCols = 13

	for start := 0; start < len(items); start += chunkSize {
		end := start + chunkSize
		if end > len(items) {
			end = len(items)
		}
		chunk := items[start:end]

		var placeholders strings.Builder
		args := make([]interface{}, 0, len(chunk)*rowCols)

		for i, item := range chunk {
			if i > 0 {
				placeholders.WriteString(",")
			}
			base := i * rowCols
			placeholders.WriteString(fmt.Sprintf("(NULLIF($%d,'')::uuid,$%d,$%d,$%d,NULLIF($%d,''),$%d,NULLIF($%d,''),$%d,NULLIF($%d,''),NULLIF($%d,''),NULLIF($%d,''),NULLIF($%d,''),$%d)",
				base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10, base+11, base+12, base+13))
			args = append(args,
				item.RunID, item.BatchID, item.TenantID, item.MappingID, item.ProfileID, item.RowIndex,
				item.IdempotencyKey, item.Status, item.ErrorDetail, item.SourceSystem,
				item.FileName, item.FileHash, jsonOrNull(item.RawRowJSON),
			)
		}

		q := fmt.Sprintf(`INSERT INTO intent_ingest_rows (
			run_id, batch_id, tenant_id, mapping_id, profile_id, row_index,
			idempotency_key, status, error_detail, source_system,
			file_name, file_hash, raw_row_json
		) VALUES %s`, placeholders.String())

		_, err := dbConn.ExecContext(ctx, q, args...)
		if err != nil {
			log.Printf("⚠️ InsertIngestRowsBatch chunk insert failed, falling back to single-row: %v", err)
			for _, item := range chunk {
				errSingle := InsertIngestRow(ctx, dbConn,
					item.RunID, item.BatchID, item.TenantID, item.MappingID, item.ProfileID, item.RowIndex,
					item.IdempotencyKey, item.Status, item.ErrorDetail, item.SourceSystem,
					item.FileName, item.FileHash, item.RawRowJSON,
				)
				if errSingle != nil {
					log.Printf("⚠️ Fallback InsertIngestRow failed: %v", errSingle)
				}
			}
		}
	}

	return nil
}
