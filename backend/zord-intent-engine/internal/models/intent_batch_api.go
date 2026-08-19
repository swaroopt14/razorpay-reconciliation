package models

import (
	"encoding/json"
	"time"
)

type BatchIDItem struct {
	BatchID     string  `json:"batch_id"`
	TotalAmount float64 `json:"total_amount"`
}

// PaymentIntentLite is the journal list contract for GET /api/prod/intents/payment-intents.
// CON-P0-10: includes authoritative governance/lifecycle fields so the console never
// invents "Ready for Dispatch".
type PaymentIntentLite struct {
	TenantID                 string          `json:"tenant_id"`
	Amount                   string          `json:"amount"`
	Currency                 string          `json:"currency"`
	IntendedExecutionAt      *time.Time      `json:"intended_execution_at"`
	ProviderHint             string          `json:"provider_hint"`
	IntentQualityScore       *float64        `json:"intent_quality_score"`
	AggregateConfidenceScore *float64        `json:"aggregate_confidence_score"`
	IntentID                 string          `json:"intent_id,omitempty"`
	ClientPayoutRef          string          `json:"client_payout_ref,omitempty"`
	ClientBatchRef           string          `json:"client_batch_ref,omitempty"`
	BatchID                  string          `json:"batch_id,omitempty"`
	SourceRowNum             *int            `json:"source_row_num,omitempty"`
	BeneficiaryType          string          `json:"beneficiary_type,omitempty"`
	Beneficiary              json.RawMessage `json:"beneficiary,omitempty"`

	// Authoritative Service 2 decision fields
	Status                   string          `json:"status,omitempty"`
	GovernanceState          string          `json:"governance_state,omitempty"`
	GovernanceDecision       *string         `json:"governance_decision,omitempty"`
	IntentLifecycleState     string          `json:"intent_lifecycle_state,omitempty"`
	BusinessState            string          `json:"business_state,omitempty"`
	ReasonCodes              json.RawMessage `json:"reason_codes,omitempty"`
	GovernanceReasonCodes    json.RawMessage `json:"governance_reason_codes,omitempty"`
	ScoreReasonCodes         json.RawMessage `json:"score_reason_codes,omitempty"`
	DuplicateReasonCode      string          `json:"duplicate_reason_code,omitempty"`
	Remediability            string          `json:"remediability,omitempty"`
	DuplicateRiskFlag        bool            `json:"duplicate_risk_flag,omitempty"`
}
