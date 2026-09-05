-- +goose Up
-- token_audit: caller, object_ref, purpose_code, correlation_id are
-- required for P1 detokenize authorization logging. Exact carry-over of
-- the CREATE TABLE IF NOT EXISTS this service ran in Go at startup (TOK-06).
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
);

-- +goose Down
DROP TABLE IF EXISTS token_audit;
