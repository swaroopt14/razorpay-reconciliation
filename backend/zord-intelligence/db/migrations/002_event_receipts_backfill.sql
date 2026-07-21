-- Migration 002: backfill event_receipts from processed_events (Phase 1)
--
-- NEVER cut over to an empty idempotency table (clarification doc §4).
-- Legacy rows get event_source='legacy_processed_events'; the Go dedup path
-- also keeps checking processed_events directly during the dual-write window,
-- so this backfill is belt-and-braces rather than the sole safety net.
--
-- Idempotent: ON CONFLICT DO NOTHING. Re-runnable at any time.
-- For very large processed_events tables run in chunks (id-less table: chunk by
-- tenant_id ranges or processed_at windows) — at current volumes a single pass is fine.

INSERT INTO event_receipts (
    tenant_id, event_source, event_type, event_version, event_id,
    processing_status, received_at, processed_at
)
SELECT
    tenant_id,
    'legacy_processed_events',
    'UNKNOWN',
    'legacy',
    event_id,
    'PROCESSED',
    processed_at,
    processed_at
FROM processed_events
ON CONFLICT (tenant_id, event_source, event_id) DO NOTHING;

-- Daily comparison during dual-write window (run manually / via cron):
--   SELECT (SELECT count(*) FROM processed_events) AS legacy_count,
--          (SELECT count(*) FROM event_receipts WHERE event_source='legacy_processed_events') AS backfilled_count;
