package db

import "database/sql"

func CreateTables(db *sql.DB) error {

	// token_map: PRIMARY KEY is now (tenant_id, kind, token_id)
	// This enforces that the same token_id cannot exist for two different
	// tenants or two different kinds — closes the cross-tenant linkability gap.
	tokenMap := `
	CREATE TABLE IF NOT EXISTS token_map (
		token_id          VARCHAR      NOT NULL,
		tenant_id         UUID         NOT NULL,
		kind              TEXT         NOT NULL,

		ciphertext        BYTEA        NOT NULL,
		nonce             BYTEA        NOT NULL,

		encryption_key_id VARCHAR      NOT NULL,

		key_version       INT          NOT NULL,
		status            TEXT         NOT NULL DEFAULT 'ACTIVE',
		created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

		PRIMARY KEY (tenant_id, kind, token_id)
	);`

	// token_audit: add caller, object_ref, purpose_code, correlation_id
	// These are required for P1 detokenize authorization logging.
	tokenAudit := `
	CREATE TABLE IF NOT EXISTS token_audit (
		audit_id       UUID         PRIMARY KEY,
		token_id       VARCHAR,
		tenant_id      UUID,
		actor          TEXT         NOT NULL,
		action         TEXT         NOT NULL,
		purpose        TEXT         NOT NULL,
		decision       TEXT         NOT NULL,
		trace_id       TEXT,
		caller         TEXT,
		object_ref     TEXT,
		purpose_code   TEXT,
		correlation_id TEXT,
		created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
	);`

	// token_encryption_keys: unchanged
	tokenKeys := `
	CREATE TABLE IF NOT EXISTS token_encryption_keys (
		key_id           VARCHAR      PRIMARY KEY,
		tenant_id        UUID         NOT NULL,

		key_version      INT          NOT NULL,
		algorithm        VARCHAR      DEFAULT 'AES-256-GCM',

		encrypted_key    BYTEA        NOT NULL,

		status           VARCHAR      CHECK (status IN ('ACTIVE', 'RETIRING', 'RETIRED')),

		active_from      TIMESTAMPTZ,
		retire_from      TIMESTAMPTZ,
		fully_retired_at TIMESTAMPTZ,

		created_by       VARCHAR,
		created_at       TIMESTAMPTZ  DEFAULT now()
	);`

	// Index for fast token lookup by token_id + tenant_id during detokenize
	tokenLookupIndex := `
	CREATE INDEX IF NOT EXISTS idx_token_map_lookup
	ON token_map(token_id, tenant_id);`

	// Index for key migration: find all tokens on a given key
	keyIndex := `
	CREATE INDEX IF NOT EXISTS idx_token_key
	ON token_map(encryption_key_id);`

	// Enforce one ACTIVE key per tenant
	uniqueActiveKey := `
	CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_key_per_tenant
	ON token_encryption_keys(tenant_id)
	WHERE status = 'ACTIVE';`

	// tokenize_failures: durable receipt for a tokenize request that
	// exhausted its bounded retry budget (TOK-01). The Kafka consumer only
	// marks a failed message's offset once a row here has been committed --
	// see kafka/retry_wrapper.go's WithRetryAndPoisonDLQ. raw_message keeps
	// the exact original bytes so an operator/replay tool can re-publish it
	// after the underlying issue (DB down, crypto error) is resolved.
	//
	// dedupe_key is envelope_id when the message parsed far enough to have
	// one, otherwise a content hash of raw_message -- never blank. This is
	// what the unique index and upsert key on, NOT envelope_id directly:
	// two different unparseable poison messages both have envelope_id="",
	// and upserting on that raw column would silently overwrite one
	// poisoned message's raw_message with another's, losing it forever.
	tokenizeFailures := `
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
	);`

	tokenizeFailuresIndex := `
	CREATE UNIQUE INDEX IF NOT EXISTS idx_tokenize_failures_dedupe_key
	ON tokenize_failures(dedupe_key);`

	for _, stmt := range []string{
		tokenMap,
		tokenAudit,
		tokenKeys,
		tokenLookupIndex,
		keyIndex,
		uniqueActiveKey,
		tokenizeFailures,
		tokenizeFailuresIndex,
	} {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}

	return nil
}
