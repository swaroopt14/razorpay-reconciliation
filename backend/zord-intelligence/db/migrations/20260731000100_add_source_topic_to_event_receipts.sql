-- +goose Up
-- corrective-action-report P1-01: separate transport identity (Kafka topic)
-- from domain identity (event_type, now read from the envelope payload
-- itself rather than defaulted to the topic name — see kafka/consumer.go's
-- extractEnvelopeFieldsBestEffort). source_topic is always the Kafka topic;
-- event_type can now diverge from it.
ALTER TABLE event_receipts
	ADD COLUMN source_topic TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE event_receipts
	ALTER COLUMN source_topic DROP DEFAULT;

-- +goose Down
ALTER TABLE event_receipts
	DROP COLUMN source_topic;
