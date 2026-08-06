-- +goose Up
-- corrective-action-report P1-07: a durable, replayable dead-letter record
-- for actuation_outbox entries that exhaust delivery (5 attempts), mirroring
-- P0-02's inbound Kafka DLQ. status='FAILED' stays the queryable terminal
-- marker; dead_lettered_at records when the DLQ publish to
-- zord-intelligence.outbox-dlq.v1 was confirmed — outbox_worker.go excludes
-- rows with dead_lettered_at set from FetchPending so they stop being
-- redelivered once the DLQ hand-off succeeds.
ALTER TABLE actuation_outbox
	ADD COLUMN dead_lettered_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE actuation_outbox
	DROP COLUMN dead_lettered_at;
