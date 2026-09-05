package repository

// TOK-01: durable receipt for a tokenize request that exhausted its bounded
// retry budget. See internal/db/db.go's tokenize_failures table doc comment
// and kafka/retry_wrapper.go's WithRetryAndPoisonDLQ, which is the only
// caller: the Kafka consumer's offset is only marked once Record has
// durably committed a row here.

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
)

type TokenizeFailureRepo struct {
	db *sql.DB
}

func NewTokenizeFailureRepo(db *sql.DB) *TokenizeFailureRepo {
	return &TokenizeFailureRepo{db: db}
}

// tokenizeEnvelopeFields is a best-effort partial decode of a
// TokenizeRequestEvent -- used only to make the failure row searchable
// (envelope_id/tenant_id/trace_id). If rawMsg isn't even valid JSON, all
// three come back blank and dedupeKey falls back to a content hash so the
// row is still recorded distinctly (see below).
type tokenizeEnvelopeFields struct {
	EnvelopeID string `json:"envelope_id"`
	TenantID   string `json:"tenant_id"`
	TraceID    string `json:"trace_id"`
}

// Record durably persists one exhausted-retry failure. Safe to call
// repeatedly for the same envelope (e.g. redelivered after a rebalance or
// restart before it was fixed) -- the row is upserted by dedupe_key, with
// attempt_count/last_error/last_failed_at reflecting the latest attempt.
func (r *TokenizeFailureRepo) Record(ctx context.Context, rawMsg []byte, attempts int, lastErr error) error {
	var fields tokenizeEnvelopeFields
	_ = json.Unmarshal(rawMsg, &fields) // best-effort; zero values on failure

	dedupeKey := fields.EnvelopeID
	if dedupeKey == "" {
		sum := sha256.Sum256(rawMsg)
		dedupeKey = "unparsed:" + hex.EncodeToString(sum[:])
	}

	errText := ""
	if lastErr != nil {
		errText = lastErr.Error()
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO tokenize_failures
			(dedupe_key, envelope_id, tenant_id, trace_id, raw_message, attempt_count, last_error)
		VALUES
			($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (dedupe_key) DO UPDATE SET
			raw_message    = EXCLUDED.raw_message,
			attempt_count  = EXCLUDED.attempt_count,
			last_error     = EXCLUDED.last_error,
			last_failed_at = now()
	`,
		dedupeKey, fields.EnvelopeID, fields.TenantID, fields.TraceID,
		rawMsg, attempts, errText,
	)
	return err
}
