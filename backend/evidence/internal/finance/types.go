package finance

import "time"

const (
	TypePaymentRecord         = "PAYMENT_RECORD"
	TypePayoutRecord          = "PAYOUT_RECORD"
	TypeSettlementRecord      = "SETTLEMENT_RECORD"
	TypeBankTransaction       = "BANK_TRANSACTION"
	TypeWebhookEvent          = "WEBHOOK_EVENT"
	TypeRefundLine            = "REFUND_LINE"
	TypeReconciliationResult  = "RECONCILIATION_RESULT"
	TypeMatchDecision         = "MATCH_DECISION"
	TypeCalculation           = "CALCULATION"
	TypeAgentFinding          = "AGENT_FINDING"
	TypeAbsentSearch          = "ABSENT_SEARCH"

	SrcRazorpayPayment  = "razorpay_payment"
	SrcRazorpayPayout   = "razorpay_payout"
	SrcRazorpayWebhook  = "razorpay_webhook"
	SrcSettlement       = "settlement"
	SrcBank             = "bank"
	SrcReconciliation   = "reconciliation"
	SrcInvestigation    = "investigation"

	RolePrimary         = "PRIMARY"
	RoleCorroborating   = "CORROBORATING"
	RoleContradicting   = "CONTRADICTING"
	RoleDerived         = "DERIVED"
	RoleCalcInput       = "CALCULATION_INPUT"
	RoleCalcOutput      = "CALCULATION_OUTPUT"
	RoleMatchEvidence   = "MATCH_EVIDENCE"
	RoleDecisionEvidence = "DECISION_EVIDENCE"

	AuthAuthoritative = "AUTHORITATIVE"
	AuthDerived       = "DERIVED"
	AuthInferred      = "INFERRED"

	CertaintyProven  = "PROVEN"
	CertaintyLikely  = "LIKELY"
	CertaintyPossible = "POSSIBLE"
	CertaintyUnknown = "UNKNOWN"

	ActorSystem = "SYSTEM"
	ActorAgent  = "AGENT"

	ActionReconRun              = "RECON_RUN"
	ActionInvestigationStarted  = "INVESTIGATION_STARTED"
	ActionEvidenceAttached      = "EVIDENCE_ATTACHED"
	ActionPackSealed            = "PACK_SEALED"
	ActionVerify                = "VERIFY"

	IntegrityValid   = "VALID"
	IntegrityInvalid = "INVALID"
	IntegrityUnknown = "UNKNOWN"
)

type Evidence struct {
	ID              string         `json:"evidence_id"`
	TenantID        string         `json:"tenant_id"`
	EntityType      string         `json:"entity_type"`
	EntityID        string         `json:"entity_id"`
	EvidenceType    string         `json:"evidence_type"`
	SourceType      string         `json:"source_type"`
	SourceID        string         `json:"source_id"`
	SourceReference string         `json:"source_reference"`
	SourceHash      string         `json:"source_hash"`
	ObservedAt      time.Time      `json:"observed_at"`
	CapturedAt      time.Time      `json:"captured_at"`
	Role            string         `json:"role"`
	Authority       string         `json:"authority"`
	Metadata        map[string]any `json:"metadata,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
}

type Snapshot struct {
	ID            string         `json:"id"`
	EvidenceID    string         `json:"evidence_id"`
	SchemaVersion string         `json:"schema_version"`
	Snapshot      map[string]any `json:"snapshot"`
	SnapshotHash  string         `json:"snapshot_hash"`
	CreatedAt     time.Time      `json:"created_at"`
}

type Link struct {
	ID                string    `json:"id"`
	TenantID          string    `json:"tenant_id"`
	EvidenceID        string    `json:"evidence_id"`
	RelatedEvidenceID string    `json:"related_evidence_id"`
	Relationship      string    `json:"relationship"`
	CreatedAt         time.Time `json:"created_at"`
}

type CalculationTrace struct {
	ID         string         `json:"id"`
	TenantID   string         `json:"tenant_id"`
	EntityType string         `json:"entity_type"`
	EntityID   string         `json:"entity_id"`
	Formula    string         `json:"formula"`
	Inputs     map[string]any `json:"inputs"`
	Output     int64          `json:"output"`
	Actual     int64          `json:"actual"`
	Variance   int64          `json:"variance"`
	Currency   string         `json:"currency"`
	Precision  string         `json:"precision"`
	CreatedAt  time.Time      `json:"created_at"`
}

type RuleEval struct {
	Rule      string `json:"rule"`
	Evaluated bool   `json:"evaluated"`
	Result    bool   `json:"result"`
}

type Candidate struct {
	Candidate string  `json:"candidate"`
	Score     float64 `json:"score"`
	Selected  bool    `json:"selected"`
	Method    string  `json:"method,omitempty"`
}

type DecisionTrace struct {
	ID                string      `json:"id"`
	TenantID          string      `json:"tenant_id"`
	EntityType        string      `json:"entity_type"`
	EntityID          string      `json:"entity_id"`
	DecisionType      string      `json:"decision_type"`
	Decision          string      `json:"decision"`
	Reason            string      `json:"reason"`
	Rules             []RuleEval  `json:"rules"`
	Candidates        []Candidate `json:"candidates"`
	SelectedCandidate string      `json:"selected_candidate"`
	CreatedAt         time.Time   `json:"created_at"`
}

type InvestigationLink struct {
	InvestigationID string    `json:"investigation_id"`
	EvidenceID      string    `json:"evidence_id"`
	Role            string    `json:"role"`
	CreatedAt       time.Time `json:"created_at"`
}

type AuditEvent struct {
	ID            string         `json:"id"`
	TenantID      string         `json:"tenant_id"`
	ActorType     string         `json:"actor_type"`
	ActorID       string         `json:"actor_id"`
	Action        string         `json:"action"`
	EntityType    string         `json:"entity_type"`
	EntityID      string         `json:"entity_id"`
	BeforeState   map[string]any `json:"before_state,omitempty"`
	AfterState    map[string]any `json:"after_state,omitempty"`
	EvidenceIDs   []string       `json:"evidence_ids,omitempty"`
	RequestID     string         `json:"request_id,omitempty"`
	CorrelationID string         `json:"correlation_id,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
}

type Pack struct {
	ID              string         `json:"pack_id"`
	TenantID        string         `json:"tenant_id"`
	InvestigationID string         `json:"investigation_id"`
	EntityType      string         `json:"entity_type"`
	EntityID        string         `json:"entity_id"`
	Document        map[string]any `json:"document"`
	PackHash        string         `json:"pack_hash"`
	CreatedAt       time.Time      `json:"created_at"`
}

type EvidenceRefs struct {
	CanonicalPaymentID       string   `json:"canonical_payment_id,omitempty"`
	ObservationEventIDs      []string `json:"observation_event_ids,omitempty"`
	SettlementLineID         string   `json:"settlement_line_id,omitempty"`
	SettlementBankDecisionID string   `json:"settlement_bank_decision_id,omitempty"`
	BankObservationID        string   `json:"bank_observation_id,omitempty"`
	PayloadHashes            []string `json:"payload_hashes,omitempty"`
	PaymentAmountMinor       int64    `json:"payment_amount_minor,omitempty"`
	SettlementNetMinor       int64    `json:"settlement_net_minor,omitempty"`
	BankCreditMinor          int64    `json:"bank_credit_minor,omitempty"`
}

type DecisionEvent struct {
	EventID            string         `json:"event_id"`
	EventType          string         `json:"event_type"`
	TenantID           string         `json:"tenant_id"`
	ConnectorID        string         `json:"connector_id"`
	RunID              string         `json:"run_id"`
	EntityType         string         `json:"entity_type"`
	EntityID           string         `json:"entity_id"`
	Status             string         `json:"status"`
	Result             string         `json:"result"`
	Reason             string         `json:"reason"`
	ExpectedAmount     int64          `json:"expected_amount"`
	ObservedAmount     int64          `json:"observed_amount"`
	VarianceAmount     int64          `json:"variance_amount"`
	BankCreditProven   bool           `json:"bank_credit_proven"`
	Currency           string         `json:"currency"`
	CandidateIDs       []string       `json:"candidate_ids"`
	EvidenceRefs       EvidenceRefs   `json:"evidence_refs"`
	Exception          map[string]any `json:"exception,omitempty"`
	InvestigationID    string         `json:"investigation_id,omitempty"`
	RootCause          string         `json:"root_cause,omitempty"`
	Recommendation     string         `json:"recommendation,omitempty"`
	FindingCertainty   string         `json:"finding_certainty,omitempty"`
	CitedEvidenceIDs   []string       `json:"cited_evidence_ids,omitempty"`
}

type VerifyResult struct {
	EvidenceID  string `json:"evidence_id"`
	Integrity   string `json:"integrity"`
	StoredHash  string `json:"stored_hash"`
	CurrentHash string `json:"current_hash"`
}
