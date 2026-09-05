-- +goose Up
-- corrective-action-report P1-03: lease fields for stale PROCESSING recovery.
-- Nullable/additive — no NOT NULL, no default needed.
ALTER TABLE event_receipts
	ADD COLUMN processing_started_at TIMESTAMPTZ,
	ADD COLUMN lease_owner           TEXT,
	ADD COLUMN lease_expires_at      TIMESTAMPTZ;

-- Mirrors idx_event_receipts_failed's partial-index pattern, scoped to the
-- sweeper's query shape (find PROCESSING rows whose lease has expired).
CREATE INDEX idx_event_receipts_lease_expiry
	ON event_receipts (lease_expires_at)
	WHERE processing_status = 'PROCESSING';

-- +goose Down
DROP INDEX idx_event_receipts_lease_expiry;
ALTER TABLE event_receipts
	DROP COLUMN processing_started_at,
	DROP COLUMN lease_owner,
	DROP COLUMN lease_expires_at;
