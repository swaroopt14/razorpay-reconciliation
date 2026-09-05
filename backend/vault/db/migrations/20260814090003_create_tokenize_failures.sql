-- +goose Up
-- tokenize_failures: durable receipt for a tokenize request that exhausted
-- its bounded retry budget (TOK-01). The Kafka consumer only marks a
-- failed message's offset once a row here has been committed -- see
-- kafka/retry_wrapper.go's WithRetryAndPoisonDLQ. raw_message keeps the
-- exact original bytes so an operator/replay tool can re-publish it after
-- the underlying issue (DB down, crypto error) is resolved.
--
-- dedupe_key is envelope_id when the message parsed far enough to have
-- one, otherwise a content hash of raw_message -- never blank. This is
-- what the unique index and upsert key on, NOT envelope_id directly: two
-- different unparseable poison messages both have envelope_id="", and
-- upserting on that raw column would silently overwrite one poisoned
-- message's raw_message with another's, losing it forever.
--
-- Exact carry-over of the CREATE TABLE IF NOT EXISTS this service ran in
-- Go at startup (TOK-06), added later than the three tables above (TOK-01),
-- kept as its own migration to reflect the real order these tables were
-- introduced.
CREATE TABLE IF NOT EXISTS tokenize_failures (
    failure_id      BIGSERIAL   PRIMARY KEY,
    dedupe_key      TEXT        NOT NULL,
    envelope_id     TEXT        NOT NULL DEFAULT '',
    tenant_id       TEXT        NOT NULL DEFAULT '',
    trace_id        TEXT        NOT NULL DEFAULT '',
    raw_message     BYTEA       NOT NULL,
    attempt_count   INTEGER     NOT NULL,
    last_error      TEXT        NOT NULL,
    replay_status   TEXT        NOT NULL DEFAULT 'PENDING',
    first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_failed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tokenize_failures_dedupe_key
ON tokenize_failures(dedupe_key);

-- +goose Down
DROP TABLE IF EXISTS tokenize_failures;
