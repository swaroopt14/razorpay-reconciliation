-- +goose Up
-- INTEL-07: local durable fallback for the inbound Kafka DLQ hand-off.
-- kafka/consumer.go's consumeSingleTopic used to block, retrying forever,
-- when a permanently-failed message could not be published to
-- TopicIntelligenceDLQ (e.g. the Kafka broker itself is down) — a broker
-- outage stalled all inbound consumption. Now that publish is replaced with
-- a fast local insert into this table, so the source offset can advance
-- immediately; a background worker (intelligence_dlq_replay_worker.go)
-- polls replayed_at IS NULL rows and republishes them to
-- TopicIntelligenceDLQ once Kafka recovers.
CREATE TABLE intelligence_dlq_local_receipts (
	id                 BIGSERIAL    PRIMARY KEY,
	tenant_id          TEXT,
	partition_key      TEXT,
	source_topic       TEXT         NOT NULL,
	partition          INT          NOT NULL,
	"offset"           BIGINT       NOT NULL,
	event_id           TEXT,
	event_type         TEXT         NOT NULL,
	event_version      TEXT,
	payload_hash       TEXT,
	payload            TEXT         NOT NULL,
	error_class        TEXT         NOT NULL,
	error_message      TEXT,
	occurred_at        TIMESTAMPTZ  NOT NULL,
	created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
	attempts           INT          NOT NULL DEFAULT 0,
	last_replay_error  TEXT,
	replayed_at        TIMESTAMPTZ
);

CREATE INDEX idx_intelligence_dlq_local_receipts_pending
	ON intelligence_dlq_local_receipts (created_at ASC)
	WHERE replayed_at IS NULL;

-- +goose Down
DROP INDEX idx_intelligence_dlq_local_receipts_pending;
DROP TABLE intelligence_dlq_local_receipts;
