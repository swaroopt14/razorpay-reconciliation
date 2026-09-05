package etl

import (
	"time"

	"github.com/google/uuid"
)

type ETLIngestRun struct {
	RunID               uuid.UUID  `db:"run_id"`
	TenantID            uuid.UUID  `db:"tenant_id"`
	EnvelopeID          uuid.UUID  `db:"envelope_id"`
	IntentID            *uuid.UUID `db:"intent_id"`
	OutboxEventID       string     `db:"outbox_event_id"`
	// BatchID links this ETL quality-scoring run back to the ingest batch it
	// came from, when the source intent had one (webhook-originated intents
	// won't). See refactor blueprint ledger item #21.
	BatchID             *string    `db:"batch_id"`
	ArtifactFamily      string     `db:"artifact_family"`
	SourceSystem        string     `db:"source_system"`
	MappingProfileID    string     `db:"mapping_profile_id"`
	ParserVersion       string     `db:"parser_version"`
	RunGeneration       int        `db:"run_generation"`
	Status              string     `db:"status"` // PROCESSING / COMPLETED / FAILED
	IsActive            bool       `db:"is_active"`
	SupersedesRunID     *uuid.UUID `db:"supersedes_run_id"`
	ParseSuccessRate    *float64   `db:"parse_success_rate"`
	QualityScore        *float64   `db:"quality_score"`
	ProofReadinessScore *float64   `db:"proof_readiness_score"`
	StartedAt           time.Time  `db:"started_at"`
	CompletedAt         *time.Time `db:"completed_at"`
	CreatedAt           time.Time  `db:"created_at"`
}

type ETLQualityResult struct {
	QualityResultID          uuid.UUID `db:"quality_result_id"`
	RunID                    uuid.UUID `db:"run_id"`
	TenantID                 uuid.UUID `db:"tenant_id"`
	ScopeType                string    `db:"scope_type"`
	QualityScore             float64   `db:"quality_score"`
	ParseSuccessRate         float64   `db:"parse_success_rate"`
	RequiredFieldGapCount    int       `db:"required_field_gap_count"`
	LowConfidenceFieldCount  int       `db:"low_confidence_field_count"`
	AttachmentReadinessScore float64   `db:"attachment_readiness_score"`
	ProofReadinessScore      float64   `db:"proof_readiness_score"`
	Status                   string    `db:"status"` // PASS / WARN / FAIL
	ReasonCodesJSON          []byte    `db:"reason_codes_json"`
	CreatedAt                time.Time `db:"created_at"`
}

// TransformResult is the per-event result returned to Airflow
type TransformResult struct {
	OutboxEventID string  `json:"outbox_event_id"`
	EnvelopeID    string  `json:"envelope_id"`
	IntentID      string  `json:"intent_id,omitempty"`
	Status        string  `json:"status"` // "ok" | "failed" | "skipped"
	RunID         string  `json:"run_id"`
	QualityScore  float64 `json:"quality_score"`
	Error         string  `json:"error,omitempty"`
}

// BatchTransformResponse is what POST /internal/airflow/transform returns
type BatchTransformResponse struct {
	Leased           int               `json:"leased"`
	Accepted         int               `json:"accepted"`
	Failed           int               `json:"failed"`
	ParseSuccessRate float64           `json:"parse_success_rate"`
	BelowThreshold   bool              `json:"below_threshold"`
	Results          []TransformResult `json:"results"`
}
