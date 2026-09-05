package models

import "time"

// ExplanationType defines what kind of explanation this is.
type ExplanationType string

const (
	ExplanationTypeRCASummary         ExplanationType = "RCA_SUMMARY"
	ExplanationTypeLeakageNarrative   ExplanationType = "LEAKAGE_NARRATIVE"
	ExplanationTypeAmbiguitySummary   ExplanationType = "AMBIGUITY_SUMMARY"
	ExplanationTypeActionJustification ExplanationType = "ACTION_JUSTIFICATION"
	ExplanationTypeDefensibilityReport ExplanationType = "DEFENSIBILITY_REPORT"
	ExplanationTypeBatchRisk          ExplanationType = "BATCH_RISK_EXPLANATION"
)

// IntelligenceExplanation represents one row in the intelligence_explanations table.
// It stores natural-language or structured explanations generated per snapshot,
// separately from deterministic truth.
type IntelligenceExplanation struct {
	ExplanationID   string          `json:"explanation_id" db:"explanation_id"`
	TenantID        string          `json:"tenant_id" db:"tenant_id"`
	SnapshotID      string          `json:"snapshot_id" db:"snapshot_id"`
	ExplanationType ExplanationType `json:"explanation_type" db:"explanation_type"`
	InputRefsJSON   string          `json:"input_refs_json" db:"input_refs_json"` // JSON array of input references
	ExplanationText string          `json:"explanation_text" db:"explanation_text"`
	ModelVersion    string          `json:"model_version" db:"model_version"` // e.g. "deterministic_v1"
	CreatedAt       time.Time       `json:"created_at" db:"created_at"`
}
