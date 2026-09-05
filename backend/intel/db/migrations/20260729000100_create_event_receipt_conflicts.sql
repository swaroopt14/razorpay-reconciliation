-- Corrective action report (2026-07-23), P0-03: persist payload-hash
-- conflicts as a queryable, auditable record instead of only logging and
-- silently keeping the first-seen event. See event_receipt_repo.go's
-- conflict-handling block for how this table is written.
--
-- P0-04 note: the report also flags a migration-004-era backfill failure.
-- No environment has ever been deployed with this schema, so there is no
-- legacy data to backfill (confirmed 2026-07-29) — that risk is currently
-- theoretical. The report's underlying ask, "backfills must fail loudly,
-- not silently skip," is already satisfied structurally: cmd/main.go's
-- goose.Up(...) call log.Fatal()s on any migration error, and goose's own
-- goose_db_version table is the migration audit trail. No separate backfill
-- migration exists to fix because none of the current CREATE TABLE
-- migrations populate data from a predecessor table.

-- +goose Up
CREATE TABLE event_receipt_conflicts (
	tenant_id              TEXT        NOT NULL,
	event_source           TEXT        NOT NULL,
	event_id               TEXT        NOT NULL,
	stored_payload_hash    TEXT        NOT NULL,
	incoming_payload_hash  TEXT        NOT NULL,
	stored_event_type      TEXT,
	incoming_event_type    TEXT,
	stored_event_version   TEXT,
	incoming_event_version TEXT,
	first_seen_at          TIMESTAMPTZ NOT NULL,
	first_detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	last_detected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
	occurrence_count       INT         NOT NULL DEFAULT 1,
	resolution_status      TEXT        NOT NULL DEFAULT 'OPEN',
	CHECK (resolution_status IN ('OPEN', 'RESOLVED')),
	resolved_at            TIMESTAMPTZ,
	resolved_by            TEXT,
	resolution_note        TEXT,
	PRIMARY KEY (tenant_id, event_source, event_id)
);

CREATE INDEX idx_event_receipt_conflicts_open
	ON event_receipt_conflicts (tenant_id, first_detected_at DESC)
	WHERE resolution_status = 'OPEN';

-- +goose Down
DROP INDEX idx_event_receipt_conflicts_open;
DROP TABLE event_receipt_conflicts;
