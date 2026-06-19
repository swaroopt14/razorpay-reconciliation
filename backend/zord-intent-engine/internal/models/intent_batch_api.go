package models

import (
	"encoding/json"
	"time"
)

type BatchIDItem struct {
	BatchID     string  `json:"batch_id"`
	TotalAmount float64 `json:"total_amount"`
}

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
	SourceRowNum             *int            `json:"source_row_num,omitempty"`
	BeneficiaryType          string          `json:"beneficiary_type,omitempty"`
	Beneficiary              json.RawMessage `json:"beneficiary,omitempty"`
}
