package persistence

import (
	"context"
	"fmt"
)

// IsProcessed returns true if this event_id was already processed.
func (r *ProjectionRepo) IsProcessed(ctx context.Context, tenantID, eventID string) (bool, error) {
	if tenantID == "" || eventID == "" {
		return false, nil
	}

	const sql = `
		SELECT EXISTS (
			SELECT 1
			FROM processed_events
			WHERE tenant_id = $1
			  AND event_id = $2
		)
	`

	var processed bool
	if err := r.q(ctx).QueryRow(ctx, sql, tenantID, eventID).Scan(&processed); err != nil {
		return false, fmt.Errorf("processed_event_repo.IsProcessed tenant_id=%s event_id=%s: %w", tenantID, eventID, err)
	}
	return processed, nil
}

// MarkProcessed records event_id as processed. Duplicate inserts are ignored.
func (r *ProjectionRepo) MarkProcessed(ctx context.Context, tenantID, eventID string) error {
	if tenantID == "" || eventID == "" {
		return nil
	}

	const sql = `
		INSERT INTO processed_events (tenant_id, event_id)
		VALUES ($1, $2)
		ON CONFLICT (tenant_id, event_id) DO NOTHING
	`

	if _, err := r.q(ctx).Exec(ctx, sql, tenantID, eventID); err != nil {
		return fmt.Errorf("processed_event_repo.MarkProcessed tenant_id=%s event_id=%s: %w", tenantID, eventID, err)
	}
	return nil
}

// IsFinalityProcessed returns true if this certificate_id was already processed for tenant.
func (r *ProjectionRepo) IsFinalityProcessed(ctx context.Context, tenantID, certificateID string) (bool, error) {
	if tenantID == "" || certificateID == "" {
		return false, nil
	}

	const sql = `
		SELECT EXISTS (
			SELECT 1
			FROM processed_finality
			WHERE tenant_id = $1
			  AND certificate_id = $2
		)
	`

	var processed bool
	if err := r.q(ctx).QueryRow(ctx, sql, tenantID, certificateID).Scan(&processed); err != nil {
		return false, fmt.Errorf("processed_event_repo.IsFinalityProcessed tenant_id=%s certificate_id=%s: %w", tenantID, certificateID, err)
	}
	return processed, nil
}

// MarkFinalityProcessed records certificate_id as processed for tenant. Duplicates are ignored.
func (r *ProjectionRepo) MarkFinalityProcessed(ctx context.Context, tenantID, certificateID string) error {
	if tenantID == "" || certificateID == "" {
		return nil
	}

	const sql = `
		INSERT INTO processed_finality (tenant_id, certificate_id)
		VALUES ($1, $2)
		ON CONFLICT (tenant_id, certificate_id) DO NOTHING
	`

	if _, err := r.q(ctx).Exec(ctx, sql, tenantID, certificateID); err != nil {
		return fmt.Errorf("processed_event_repo.MarkFinalityProcessed tenant_id=%s certificate_id=%s: %w", tenantID, certificateID, err)
	}
	return nil
}
