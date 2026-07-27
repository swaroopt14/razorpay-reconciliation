-- +goose Up
CREATE TABLE actuation_outbox (
	event_id       TEXT         PRIMARY KEY,
	action_id      TEXT         NOT NULL
	                            REFERENCES action_contracts(action_id),
	event_type     TEXT         NOT NULL,
	CHECK (event_type IN (
		'ESCALATE',
		'RETRY',
		'GENERATE_EVIDENCE',
		'NOTIFY',
		'OPEN_OPS_INCIDENT',
		'HOLD',
		'ADVISORY_RECOMMENDATION',
		'BATCH_PATCH_REQUEST',
		'OPS_WEBHOOK',
		'PREPARE_AND_SIGN_RECOMMENDED',
		'DISPATCH_MODE_RECOMMENDED',
		'REQUEST_SOURCE_PATCH',
		'REVIEW_AMBIGUOUS_BATCH',
		'REGENERATE_EVIDENCE',
		'REQUEST_STRONGER_CARRIER_CONTRACT'
	)),
	payload        JSONB        NOT NULL,
	status         TEXT         NOT NULL DEFAULT 'PENDING',
	CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
	attempts       INT          NOT NULL DEFAULT 0,
	next_retry_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
	sent_at        TIMESTAMPTZ,
	created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
	tenant_id      TEXT,
	scope_type     TEXT,
	scope_ref      TEXT,
	payload_hash   TEXT,
	payload_schema_version TEXT DEFAULT 'legacy',
	last_error     TEXT
);

CREATE INDEX idx_outbox_pending
	ON actuation_outbox (next_retry_at ASC)
	WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX idx_outbox_tenant_scope
	ON actuation_outbox (tenant_id, scope_type, scope_ref, created_at DESC);

-- +goose Down
DROP INDEX idx_outbox_tenant_scope;
DROP INDEX idx_outbox_pending;
DROP TABLE actuation_outbox;
