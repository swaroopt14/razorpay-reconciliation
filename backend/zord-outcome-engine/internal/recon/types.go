package recon

import "time"

const RuleVersion = "recon_rules_v1"

const (
	PaymentUnknown          = "unknown"
	PaymentCreated          = "created"
	PaymentAuthorized       = "authorized"
	PaymentCaptured         = "captured"
	PaymentFailed           = "failed"
	PaymentRefunded         = "refunded"
	PaymentPartiallyRefunded = "partially_refunded"
)

const (
	SettlementNotObserved     = "not_observed"
	SettlementExpected        = "expected"
	SettlementIncludedInRecon = "included_in_recon"
	SettlementSettled         = "settled"
	SettlementReversed        = "reversed"
	SettlementAdjusted        = "adjusted"
)

const (
	BankNotExpected    = "not_expected"
	BankAwaiting       = "awaiting"
	BankMatched        = "matched"
	BankAmountMismatch = "amount_mismatch"
	BankLate           = "late"
	BankNotFound       = "not_found"
	BankAmbiguous      = "ambiguous"
)

const (
	ReconFullyReconciled                 = "fully_reconciled"
	ReconPaymentConfirmedSettlementPending = "payment_confirmed_settlement_pending"
	ReconSettlementConfirmedBankPending  = "settlement_confirmed_bank_pending"
	ReconBankCreditConfirmedProviderPending = "bank_credit_confirmed_provider_pending"
	ReconAmountMismatch                  = "amount_mismatch"
	ReconMissingWebhookRepairedByAPI     = "missing_webhook_repaired_by_api"
	ReconDuplicateObservation            = "duplicate_observation"
	ReconAmbiguousMatch                  = "ambiguous_match"
	ReconUnresolved                      = "unresolved"
)

const (
	ProofUnproven                              = "unproven"
	ProofVerified                              = "verified"
	ProofProviderSettlementProvenBankUnproven  = "provider_settlement_proven_bank_credit_unproven"
	ProofCaptureProvenSettlementUnproven       = "capture_proven_settlement_unproven"
	ProofProbable                              = "probable"
)

const (
	MatchExactPaymentID        = "exact_payment_id"
	MatchExactEntityID         = "exact_entity_id"
	MatchOrderRelationship     = "order_relationship"
	MatchExactUTR              = "exact_utr"
	MatchExactUTRAndAmount     = "exact_utr_and_amount"
	MatchNetAmountDateAccount  = "exact_net_amount_date_account"
	MatchCompositeFallback     = "composite_fallback"
)

const (
	Proven   = "proven"
	Unproven = "unproven"
	Probable = "probable"
)

type PaymentObs struct {
	PaymentID    string
	OrderID      string
	Status       string
	AmountMinor  int64
	Currency     string
	Captured     bool
	Source       string
	PayloadHash  string
	HasWebhook   bool
	FeeMinor     int64
	TaxMinor     int64
}

type SettlementLine struct {
	SettlementID string
	EntityID     string
	PaymentID    string
	LineType     string
	AmountMinor  int64
	DebitMinor   int64
	CreditMinor  int64
	FeeMinor     int64
	TaxMinor     int64
	Currency     string
	UTR          string
	Settled      bool
	SettledAt    time.Time
	PayloadHash  string
}

type BankTxn struct {
	ID            string
	AccountID     string
	BankTxnID     string
	UTR           string
	Description   string
	Currency      string
	CreditMinor   int64
	DebitMinor    int64
	ValueDate     time.Time
	RowHash       string
}

type IntentRef struct {
	IntentID             string
	ProviderOrderID      string
	ExpectedAmountMinor  int64
	Currency             string
}

type MatchDecision struct {
	MatchID        string
	SourceAID      string
	SourceBID      string
	LeftSource     string
	RightSource    string
	MatchType      string
	Confidence     float64
	ScoreBreakdown map[string]float64
	Ambiguous      bool
	DecisionReason string
	RuleVersion    string
}

type ProofSubject struct {
	TenantID                 string
	ConnectorID              string
	PaymentID                string
	OrderID                  string
	PaymentState             string
	ProviderSettlementState  string
	BankCreditState          string
	ReconciliationState      string
	ProofState               string
	SettlementID             string
	BankObservationID        string
	ExpectedNetMinor         int64
	BankCreditMinor          int64
	DifferenceMinor          int64
	Currency                 string
	MissingWebhook           bool
	Message                  string
	MatchPairs               []MatchDecision
}

type EvidenceLeaf struct {
	ID             string
	PaymentID      string
	Source         string
	SourceRecordID string
	RawPayloadHash string
	ObservedAt     time.Time
	ProviderMode   string
	TraceID        string
}

type Snapshot struct {
	TenantID    string
	ConnectorID string
	AccountID   string
	Payments    []PaymentObs
	Lines       []SettlementLine
	Banks       []BankTxn
	Intents     []IntentRef
}
