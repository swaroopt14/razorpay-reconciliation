package services

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// RecordSessionActivity updates last_activity_at and idle_expires_at for a
// session. Rate-limited: only writes if last_recorded_at is older than 45 s.
func RecordSessionActivity(ctx context.Context, db *sql.DB, sessionID uuid.UUID) error {
	now := time.Now().UTC()

	// Create table if not exists for the rate limiter.
	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS auth_session_activity (
			session_id UUID PRIMARY KEY,
			last_recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`)
	if err != nil {
		return err
	}

	// Try to get last recorded activity time.
	var lastRecorded time.Time
	err = db.QueryRowContext(ctx, `
		SELECT last_recorded_at FROM auth_session_activity WHERE session_id = $1
	`, sessionID).Scan(&lastRecorded)

	if err != nil && err != sql.ErrNoRows {
		return err
	}

	// Rate-limit check: only update if last recorded is older than 45 seconds.
	if err == nil && now.Sub(lastRecorded) < 45*time.Second {
		return nil
	}

	// Upsert to auth_session_activity and update auth_refresh_tokens.
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO auth_session_activity (session_id, last_recorded_at)
		VALUES ($1, $2)
		ON CONFLICT (session_id) DO UPDATE
		SET last_recorded_at = EXCLUDED.last_recorded_at
	`, sessionID, now)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE auth_refresh_tokens
		SET last_activity_at = $1,
		    idle_expires_at = $1 + ($2 * INTERVAL '1 second'),
		    updated_at = $1
		WHERE session_id = $3 AND revoked_at IS NULL
	`, now, int(idleWindow.Seconds()), sessionID)
	if err != nil {
		return err
	}

	return tx.Commit()
}
