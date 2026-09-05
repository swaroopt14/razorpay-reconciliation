package model

import (
	"encoding/json"
	"time"
)

// OutboxEvent is a single row returned by Service 2's lease API.
// Field names match the outbox table column names exactly.
// amount and currency are top-level columns on the outbox table —
// they are NOT inside the payload JSONB.


// OutboxPayload is the JSONB payload column from Service 2's outbox table.
// This is the canonicalized intent body. It contains token IDs, never plaintext.
// Field names match exactly what Service 2 writes — confirmed from live DB.
type OutboxPayload struct {
	IntentID      string           `json:"intent_id"`
	EnvelopeID    string           `json:"envelope_id"`
	TenantID      string           `json:"tenant_id"`
	TraceID       string           `json:"trace_id"`
	IntentType    string           `json:"intent_type"`    // "PAYOUT"
	SchemaVersion string           `json:"schema_version"` // "intent.request.v1"
	CreatedAt     time.Time        `json:"created_at"`
	IdempotencyKey string          `json:"idempotency_key"`
	Status        string           `json:"status"` // "CREATED"

	// PIITokens holds token IDs for all sensitive fields.
	// Each is a UUID referencing a record in Service 3's token_map table.
	// Resolved by Service 3 just-in-time before the PSP call.
	PIITokens OutboxPIITokens `json:"pii_tokens"`

	// Beneficiary holds routing metadata and token references.
	Beneficiary OutboxBeneficiary `json:"beneficiary"`

	// BeneficiaryType is the instrument kind at the top level.
	BeneficiaryType string `json:"beneficiary_type"` // "BANK" or "UPI"

	// Constraints carries execution rules from the tenant.
	Constraints OutboxConstraints `json:"constraints"`

	// Amount is the payment amount in major currency units (e.g., "100.50" for 100.50 INR).
	// decimal.Decimal in the CanonicalIntent serialises as a JSON string.
	// Conversion to minor units (paise) is performed just before the PSP call.
	Amount string `json:"amount"`

	// Currency is the ISO-4217 currency code (e.g., "INR").
	Currency string `json:"currency"`
}

// OutboxPIITokens holds token IDs for all sensitive fields.
// These are UUIDs — not account numbers, not names.
// Never log, store, or pass these values outside of the detokenize call.
type OutboxPIITokens struct {
	AccountNumber string `json:"account_number"` // token ID → resolves to account number
	Name          string `json:"name"`           // token ID → resolves to beneficiary name
	IFSC          string `json:"ifsc"`           // token ID → resolves to IFSC code
	VPA           string `json:"vpa"`            // token ID → resolves to UPI VPA (optional)
	Email         string `json:"email"`          // token ID → resolves to email (optional)
	Phone         string `json:"phone"`          // token ID → resolves to phone (optional)
}

// OutboxBeneficiary holds routing metadata and nested token references.
type OutboxBeneficiary struct {
	NameToken   string           `json:"name_token"` // mirrors pii_tokens.name
	Country     string           `json:"country"`
	Instrument  OutboxInstrument `json:"instrument"`
}

// OutboxInstrument describes the payment instrument.
type OutboxInstrument struct {
	Kind      string `json:"kind"`       // "BANK" or "UPI"
	IFSCToken string `json:"ifsc_token"` // mirrors pii_tokens.ifsc
	VPAToken  string `json:"vpa_token"`  // mirrors pii_tokens.vpa
}

// OutboxConstraints carries tenant-defined execution rules.
type OutboxConstraints struct {
	ExecutionWindow string `json:"execution_window"` // e.g. "T+1"
}

// ResolvedBeneficiary holds plaintext PII values after detokenization.
// This struct exists only in memory during Step 4 (PSP call).
// It MUST NEVER be logged, stored, or included in any event payload.
// Use Zero() in a defer immediately after the struct is populated.
type ResolvedBeneficiary struct {
	AccountNumber string
	Name          string
	IFSC          string
}

type AttachmentDecisionCreatedPayload struct {
	EventID                  string          `json:"event_id"`
	AttachmentDecisionID    string          `json:"attachment_decision_id"`
	AttachmentJobID         string          `json:"attachment_job_id"`
	TenantID                string          `json:"tenant_id"`
	TraceID                 string          `json:"trace_id"`
	OccurredAt              string          `json:"occurred_at"`
	SettlementObservationID string          `json:"settlement_observation_id"`
	IntentID                string          `json:"intent_id"`
	ContractID              string          `json:"contract_id"`
	CorridorID              string          `json:"corridor_id"`
	ClientBatchID           string          `json:"batch_id"`
	SettledAmount           string          `json:"settled_amount"`
	IntendedAmount          string          `json:"intended_amount"`
	Currency                string          `json:"currency"`
	CandidateSetSize        int             `json:"candidate_set_size"`
	DecisionType            string          `json:"decision_type"`
	DecisionReasonCode      string          `json:"decision_reason_code"`
	ConfidenceScore         float64         `json:"confidence_score"`
	AmbiguityScore          float64         `json:"ambiguity_score"`
	MatchingRulesetVersion  string          `json:"matching_ruleset_version"`
	WinningScore            float64         `json:"winning_score"`
	RunnerUpScore           float64         `json:"runner_up_score"`
	ScoreMargin             float64         `json:"score_margin"`
	CandidateSetHash        string          `json:"candidate_set_hash"`
	SupportingCarriers      json.RawMessage `json:"supporting_carriers"`
	VarianceSummary         *VarianceSummary `json:"variance_summary,omitempty"`
}

type VarianceSummary struct {
	AmountVariance    string `json:"amount_variance"`
	VarianceSeverity  string `json:"variance_severity"`
	ValueDateMismatch bool   `json:"value_date_mismatch"`
	CrossPeriod       bool   `json:"cross_period"`
	EvidenceGap       bool   `json:"evidence_gap"`
}
// Zero clears all plaintext fields from memory.
// Always call via defer immediately after populating this struct:
//
//	rb := &model.ResolvedBeneficiary{...}
//	defer rb.Zero()
func (r *ResolvedBeneficiary) Zero() {
	r.AccountNumber = ""
	r.Name = ""
	r.IFSC = ""
}