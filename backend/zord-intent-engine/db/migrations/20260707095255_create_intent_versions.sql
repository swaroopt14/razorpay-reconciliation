-- +goose Up
CREATE TABLE intent_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL,
    version_no INT NOT NULL,
    prev_hash TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_intent_versions_intent
        FOREIGN KEY (intent_id)
        REFERENCES payment_intents(intent_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_intent_versions_intent_version
        UNIQUE (intent_id, version_no)
);

CREATE INDEX idx_intent_versions_intent_id
    ON intent_versions (intent_id);
CREATE INDEX idx_intent_versions_intent_version
    ON intent_versions (intent_id, version_no);

-- +goose Down
DROP INDEX idx_intent_versions_intent_version;
DROP INDEX idx_intent_versions_intent_id;
DROP TABLE intent_versions;
