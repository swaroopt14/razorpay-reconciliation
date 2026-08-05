package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"

	"zord-edge/model"

	"github.com/google/uuid"
)

// ErrFingerprintMismatch is returned when an idempotency key is reused with a
// different payload fingerprint — a hard conflict that must be rejected.
var ErrFingerprintMismatch = errors.New("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD")

// ErrIdempotencyInFlight is returned when another request with the same key and
// fingerprint is currently processing (status IN_PROGRESS).
var ErrIdempotencyInFlight = errors.New("IDEMPOTENCY_KEY_IN_FLIGHT")

// staleInProgressReclaim is how long an IN_PROGRESS row may sit without
// completion before a new caller may reclaim it (crashed worker recovery).
const staleInProgressReclaim = "90 seconds"

// PersistIdempotency inserts a new idempotency record or detects duplicates.
//
// Returns:
//   - (uuid.Nil, nil)              → caller may proceed (new key or reclaimed retry)
//   - (firstEnvelopeID, nil)       → exact duplicate (same fingerprint), return 409
//   - (uuid.Nil, ErrFingerprintMismatch) → same key, different payload, hard reject
//   - (uuid.Nil, ErrIdempotencyInFlight) → concurrent duplicate in progress, retry later
func PersistIdempotency(ctx context.Context, msg model.RawIntentMessage, db *sql.DB) (uuid.UUID, error) {
	if msg.IdempotencyKey == "" {
		log.Print("Idempotency key is missing, skipping idempotency validation")
		return uuid.Nil, nil
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback()

	insertQuery := `
		INSERT INTO idempotency_keys
			(tenant_id, idempotency_key, status, request_fingerprint,
			 first_seen_at, last_seen_at, resolution_type, expires_at)
		VALUES ($1, $2, 'IN_PROGRESS', $3, now(), now(), 'CREATED', now() + interval '1 hour')
		ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
	`
	res, err := tx.ExecContext(ctx, insertQuery,
		msg.TenantID,
		msg.IdempotencyKey,
		msg.RequestFingerprint,
	)
	if err != nil {
		log.Printf("Error in idempotency persist: %v", err)
		return uuid.Nil, err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		log.Printf("Error checking idempotency rows affected: %v", err)
		return uuid.Nil, err
	}

	if rows == 1 {
		if err := tx.Commit(); err != nil {
			return uuid.Nil, err
		}
		return uuid.Nil, nil
	}

	var (
		storedFingerprint string
		status            string
		firstEnvelopeID   uuid.NullUUID
		conflictCount     int
		principalID       uuid.NullUUID
		sourceClass       sql.NullString
	)

	err = tx.QueryRowContext(ctx, `
		SELECT status, request_fingerprint, first_envelope_id, conflict_count,
		       principal_id_first_seen, source_class_first_seen
		FROM idempotency_keys
		WHERE tenant_id = $1 AND idempotency_key = $2
		FOR UPDATE
	`, msg.TenantID, msg.IdempotencyKey).Scan(
		&status, &storedFingerprint, &firstEnvelopeID, &conflictCount, &principalID, &sourceClass,
	)
	if err != nil {
		log.Printf("Error fetching stored idempotency record: %v", err)
		return uuid.Nil, err
	}

	newConflictCount := conflictCount + 1
	fingerprintHash := sha256.Sum256([]byte(msg.RequestFingerprint))
	snapshot := map[string]interface{}{
		"fingerprint": hex.EncodeToString(fingerprintHash[:]),
	}
	snapshotJSON, _ := json.Marshal(snapshot)

	updateFields := `
		conflict_count = $1,
		last_conflict_at = now(),
		response_snapshot_json = $2
	`
	updateArgs := []interface{}{newConflictCount, string(snapshotJSON), msg.TenantID, msg.IdempotencyKey}

	if firstEnvelopeID.Valid && !principalID.Valid {
		var pID uuid.UUID
		var sc string
		metaQuery := `SELECT principal_id, source_class FROM ingress_envelopes WHERE envelope_id = $1`
		err = tx.QueryRowContext(ctx, metaQuery, firstEnvelopeID.UUID).Scan(&pID, &sc)
		if err == nil {
			updateFields += ", principal_id_first_seen = $5, source_class_first_seen = $6"
			updateArgs = append(updateArgs, pID, sc)
		} else {
			log.Printf("Warning: Failed to fetch metadata for envelope %s: %v", firstEnvelopeID.UUID.String(), err)
		}
	}

	if storedFingerprint != msg.RequestFingerprint {
		finalUpdateQuery := `
			UPDATE idempotency_keys
			SET ` + updateFields + `
			WHERE tenant_id = $3 AND idempotency_key = $4
		`
		if _, err = tx.ExecContext(ctx, finalUpdateQuery, updateArgs...); err != nil {
			return uuid.Nil, err
		}
		if err := tx.Commit(); err != nil {
			return uuid.Nil, err
		}
		log.Printf("Idempotency key reused with different payload: tenant_id=%s key=%s",
			msg.TenantID, msg.IdempotencyKey)
		return uuid.Nil, ErrFingerprintMismatch
	}

	// Same fingerprint — completed duplicate.
	if firstEnvelopeID.Valid && status == "COMPLETED" {
		finalUpdateQuery := `
			UPDATE idempotency_keys
			SET last_seen_at = now(), resolution_type = 'REUSED', ` + updateFields + `
			WHERE tenant_id = $3 AND idempotency_key = $4
		`
		if _, err = tx.ExecContext(ctx, finalUpdateQuery, updateArgs...); err != nil {
			return uuid.Nil, err
		}
		if err := tx.Commit(); err != nil {
			return uuid.Nil, err
		}
		log.Printf("Duplicate idempotency key with same fingerprint: tenant_id=%s key=%s envelope_id=%v",
			msg.TenantID, msg.IdempotencyKey, firstEnvelopeID.UUID.String())
		return firstEnvelopeID.UUID, nil
	}

	// Same fingerprint, no envelope yet — try to claim (retry after failure or stale worker).
	claimRes, err := tx.ExecContext(ctx, `
		UPDATE idempotency_keys
		SET status = 'IN_PROGRESS', last_seen_at = now()
		WHERE tenant_id = $1 AND idempotency_key = $2
		  AND request_fingerprint = $3
		  AND first_envelope_id IS NULL
		  AND (
		    status = 'RESERVED'
		    OR status = 'IN_PROGRESS' AND last_seen_at < now() - ($4::interval)
		  )
	`, msg.TenantID, msg.IdempotencyKey, msg.RequestFingerprint, staleInProgressReclaim)
	if err != nil {
		return uuid.Nil, err
	}
	claimed, err := claimRes.RowsAffected()
	if err != nil {
		return uuid.Nil, err
	}
	if claimed == 1 {
		if err := tx.Commit(); err != nil {
			return uuid.Nil, err
		}
		return uuid.Nil, nil
	}

	if err := tx.Commit(); err != nil {
		return uuid.Nil, err
	}
	log.Printf("Idempotency key in flight: tenant_id=%s key=%s", msg.TenantID, msg.IdempotencyKey)
	return uuid.Nil, ErrIdempotencyInFlight
}

// ReleaseIdempotencyClaim resets an in-flight claim after S3 or DB persistence
// failed so the same client may retry with the same key. No-op once completed.
func ReleaseIdempotencyClaim(ctx context.Context, db *sql.DB, tenantID, idempotencyKey, fingerprint string) {
	if idempotencyKey == "" {
		return
	}
	_, err := db.ExecContext(ctx, `
		UPDATE idempotency_keys
		SET status = 'RESERVED', last_seen_at = now()
		WHERE tenant_id = $1 AND idempotency_key = $2
		  AND request_fingerprint = $3
		  AND status = 'IN_PROGRESS'
		  AND first_envelope_id IS NULL
	`, tenantID, idempotencyKey, fingerprint)
	if err != nil {
		log.Printf("ReleaseIdempotencyClaim failed tenant=%s key=%s: %v", tenantID, idempotencyKey, err)
	}
}
