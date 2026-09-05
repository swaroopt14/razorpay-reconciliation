-- +goose Up
-- R-10: outbox has ~72 columns and 5 of them — batch_quality_score,
-- avg_reference_quality, avg_duplicate_risk, low_matchability_count,
-- duplicate_risk_count — are batch-level aggregates that don't semantically
-- belong on a per-INTENT row. They have been NULL/0 on every outbox row
-- since this table was created: no INSERT INTO outbox statement has ever
-- listed them, and models.OutboxEvent has no Go struct fields for them
-- (verified this session — confirmed absent from zord-relay's per-intent
-- event model too, so they never even leave this service over the wire).
-- avg_reference_quality/avg_duplicate_risk have no living equivalent
-- anywhere in the system. batch_quality_score/low_matchability_count/
-- duplicate_risk_count DO have a real, actively-written home — the
-- identically-named columns on canonical_batches (a separate, per-batch
-- table) — which this migration does not touch.
--
-- Per the safe-remediation plan: no big-bang column removal, columns stay
-- for compatibility. This migration only documents the deprecation at the
-- DB level so a future developer doesn't try to "fix" these blank columns
-- or confuse them with canonical_batches's real aggregates of the same name.
COMMENT ON COLUMN outbox.batch_quality_score IS 'DEPRECATED (R-10): batch-level aggregate, not applicable to a per-intent row. Never written by application code. Do not confuse with canonical_batches.batch_quality_score, which is the real, actively-maintained batch aggregate.';
COMMENT ON COLUMN outbox.avg_reference_quality IS 'DEPRECATED (R-10): dead column, no application code path writes it, and no equivalent aggregate exists anywhere else in the system either.';
COMMENT ON COLUMN outbox.avg_duplicate_risk IS 'DEPRECATED (R-10): dead column, no application code path writes it, and no equivalent aggregate exists anywhere else in the system either.';
COMMENT ON COLUMN outbox.low_matchability_count IS 'DEPRECATED (R-10): batch-level aggregate, not applicable to a per-intent row. Never written by application code. Do not confuse with canonical_batches.low_matchability_count, which is the real, actively-maintained batch aggregate.';
COMMENT ON COLUMN outbox.duplicate_risk_count IS 'DEPRECATED (R-10): batch-level aggregate, not applicable to a per-intent row. Never written by application code. Do not confuse with canonical_batches.duplicate_risk_count, which is the real, actively-maintained batch aggregate.';

-- +goose Down
COMMENT ON COLUMN outbox.batch_quality_score IS NULL;
COMMENT ON COLUMN outbox.avg_reference_quality IS NULL;
COMMENT ON COLUMN outbox.avg_duplicate_risk IS NULL;
COMMENT ON COLUMN outbox.low_matchability_count IS NULL;
COMMENT ON COLUMN outbox.duplicate_risk_count IS NULL;
