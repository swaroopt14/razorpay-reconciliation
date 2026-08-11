-- +goose Up
-- corrective-action-report P1-08: dedupe repeated shadow-diff mismatches
-- instead of inserting a new row every 15-minute tick forever. Mirrors
-- P0-03's event_receipt_conflicts pattern exactly: a unique fingerprint +
-- ON CONFLICT DO UPDATE upsert, occurrence_count + last_detected_at track
-- repetition. A genuinely different mismatch (different old/new hash pair)
-- gets its own fingerprint/row naturally, satisfying "changed mismatch
-- creates a new revision."
--
-- old_payload_hash/new_payload_hash are promoted to NOT NULL to match how
-- batch_shadow_diff.go/policy_shadow_diff.go actually populate them on
-- every insert path today (always computed, never left null) — required so
-- the unique index below behaves as a real fingerprint rather than treating
-- every NULL as distinct per Postgres's default unique-index semantics.
ALTER TABLE refactor_shadow_diffs
	ALTER COLUMN old_payload_hash SET NOT NULL,
	ALTER COLUMN new_payload_hash SET NOT NULL,
	ADD COLUMN last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	ADD COLUMN occurrence_count INT NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX uq_shadow_diff_fingerprint
	ON refactor_shadow_diffs (tenant_id, scope_type, scope_ref, diff_family, old_payload_hash, new_payload_hash);

-- +goose Down
DROP INDEX uq_shadow_diff_fingerprint;
ALTER TABLE refactor_shadow_diffs
	DROP COLUMN occurrence_count,
	DROP COLUMN last_detected_at,
	ALTER COLUMN new_payload_hash DROP NOT NULL,
	ALTER COLUMN old_payload_hash DROP NOT NULL;
