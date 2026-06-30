package models

// What is this file?
// These structs represent the Kafka events ZPI receives from other services.
// When a Kafka message arrives, consumer.go decodes the JSON bytes
// into one of these structs so the rest of the code can work with typed data.
//
// Rule: These structs are READ ONLY from ZPI's perspective.
// ZPI never creates these — it only receives them from other services.

import (
	"encoding/json"
	"time"

	"github.com/shopspring/decimal"
)

// RelayEvent is a compatible subset of the normalized outbox event
// published by zord-relay to Kafka. All ZPI incoming events from
// services 2, 4, 5, 6 are wrapped in this envelope.
type RelayEvent struct {
	EventID                string          `json:"event_id"`
	EnvelopeID             string          `json:"envelope_id"`
	TenantID               string          `json:"tenant_id"`
	AggregateType          string          `json:"aggregate_type"`
	AggregateID            string          `json:"aggregate_id"`
	ContractID             string          `json:"contract_id,omitempty"`
	EventType              string          `json:"event_type"`
	Payload                json.RawMessage `json:"payload"`
	TraceID                string          `json:"trace_id"`
	DuplicateRiskFlag      bool            `json:"duplicate_risk_flag"`
	IntentQualityScore     float64         `json:"intent_quality_score"`
	MatchabilityScore      float64         `json:"matchability_score"`
	ProofReadinessScore    float64         `json:"proof_readiness_score"`
	BeneficiaryFingerprint string          `json:"beneficiary_fingerprint"`
	IntendedExecutionAt    *time.Time      `json:"intended_execution_at"`
}

// ── Event 1: from Service 2 ───────────────────────────────────────────────────
//
// Arrives when a merchant creates a new payout intent.
// ZPI uses this to:
//   - Start an SLA timer (deadline = created_at + 6 hours)
//   - Increment the pending backlog count for this corridor

type IntentCreatedEvent struct {
	EventID                string     `json:"event_id"`
	TenantID               string     `json:"tenant_id"`
	IntentID               string     `json:"intent_id"`
	ContractID             string     `json:"contract_id"`
	CorridorID             string     `json:"corridor_id"` // e.g. "razorpay.UPI", "cashfree.IMPS"
	Amount                 string     `json:"amount"`      // stored as string, never float (money rule)
	Currency               string     `json:"currency"`    // "INR", "USD"
	CreatedAt              time.Time  `json:"created_at"`
	TraceID                string     `json:"trace_id"`
	DuplicateRiskFlag      bool       `json:"duplicate_risk_flag"`
	IntentQualityScore     float64    `json:"intent_quality_score"`
	MatchabilityScore      float64    `json:"matchability_score"`
	ProofReadinessScore    float64    `json:"proof_readiness_score"`
	BeneficiaryFingerprint string     `json:"beneficiary_fingerprint"`
	IntendedExecutionAt    *time.Time `json:"intended_execution_at"`

	// Fields added from IntentPayload (zord-outcome-engine) — required for KPI computation
	SourceSystem           string     `json:"source_system"`            // originating ERP/PSP — needed for R6 source_system_defect_rate
	ClientBatchRef         string     `json:"client_batch_ref"`         // merchant's batch grouping key — needed for P1, P3
	ClientPayoutRef        string     `json:"client_payout_ref"`        // merchant's per-payout reference
	BusinessIdempotencyKey string     `json:"business_idempotency_key"` // dedup key from merchant
	ProviderHint           string     `json:"provider_hint"`            // preferred provider/corridor hint
	IntentType             string     `json:"intent_type"`              // "PAYOUT", "REFUND", etc.
	DeadlineAt             *time.Time `json:"deadline_at"`              // hard SLA deadline set by merchant
	CanonicalHash          string     `json:"canonical_hash"`           // content hash of canonical intent — for replay equivalence
	GovernanceState        string     `json:"governance_state"`         // governance approval state at intent creation
}

// ── Event 2: from Service 4 ───────────────────────────────────────────────────
//
// Arrives when Service 4 (Relay) sends a payout attempt to a PSP.
// ZPI uses this to:
//   - Track attempt count per contract
//   - Update the pending backlog age buckets

type DispatchAttemptCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	IntentID   string    `json:"intent_id"`
	ContractID string    `json:"contract_id"`
	AttemptID  string    `json:"attempt_id"`
	AttemptNo  int       `json:"attempt_no"` // 1 = first try, 2 = retry, etc.
	CorridorID string    `json:"corridor_id"`
	Provider   string    `json:"provider"` // "razorpay", "cashfree"
	DispatchAt time.Time `json:"dispatch_at"`
	TraceID    string    `json:"trace_id"`
}

// ── Event 3: from Service 5 ───────────────────────────────────────────────────
//
// Arrives for every normalized outcome signal (webhook / poll / bank statement).
// ZPI uses this to:
//   - Update failure taxonomy (which reason codes are most common?)
//   - Feed the anomaly detection (is failure rate spiking?)

type OutcomeNormalizedEvent struct {
	EventID         string    `json:"event_id"`
	TenantID        string    `json:"tenant_id"`
	IntentID        string    `json:"intent_id"`
	ContractID      string    `json:"contract_id"`
	CorridorID      string    `json:"corridor_id"`
	Provider        string    `json:"provider"`
	SourceType      string    `json:"source_type"`      // "webhook", "poll", "statement"
	StatusCandidate string    `json:"status_candidate"` // "SUCCESS", "FAILED", "PENDING"
	ReasonCode      string    `json:"reason_code"`      // e.g. "INSUFFICIENT_FUNDS"
	Confidence      float64   `json:"confidence"`       // 0.0 to 1.0
	OccurredAt      time.Time `json:"occurred_at"`
	TraceID         string    `json:"trace_id"`
}

// ── Event 4: from Service 5 ───────────────────────────────────────────────────
//
// THE MOST IMPORTANT EVENT for ZPI.
// Arrives when Service 5 reaches a terminal decision with full confidence.
// ZPI uses this to:
//   - Compute time_to_finality (how long did this payout take?)
//   - Update success_rate for this corridor
//   - Mark the SLA timer as RESOLVED or BREACHED
//   - Trigger policy evaluation

type FinalityCertIssuedEvent struct {
	EventID         string    `json:"event_id"`
	TenantID        string    `json:"tenant_id"`
	IntentID        string    `json:"intent_id"`
	ContractID      string    `json:"contract_id"`
	CorridorID      string    `json:"corridor_id"`
	Provider        string    `json:"provider"`
	FinalState      string    `json:"final_state"`       // "SETTLED", "FAILED", "REVERSED"
	Confidence      float64   `json:"confidence"`        // 0.0 to 1.0
	FinalityLevel   string    `json:"finality_level"`    // "PROVISIONAL", "CONFIRMED"
	IntentCreatedAt time.Time `json:"intent_created_at"` // when was the original intent?
	DecisionAt      time.Time `json:"decision_at"`       // when did finality happen?
	CertificateID   string    `json:"certificate_id"`
	TraceID         string    `json:"trace_id"`

	// ── NEW FIELDS from Service 5 (added per gap spec) ───────────────────
	//
	// HasProviderRef: did Service 5 find a UTR/RRN/BankRef in the Trace Graph?
	//   true  → provider gave us a traceable reference (good traceability)
	//   false → no provider reference found (reduces audit-grade confidence)
	//
	// ConflictCount: how many signal pairs disagreed during Outcome Fusion?
	//   0 → all signals agreed — cleanest possible finality
	//   1+ → signals conflicted; Service 5 used truth hierarchy to resolve
	//
	// ConflictTypes: which specific conflicts occurred?
	//   e.g. ["webhook_vs_poll_mismatch", "amount_mismatch"]
	//   Empty slice when ConflictCount == 0.
	HasProviderRef bool     `json:"has_provider_ref"` // true if UTR/RRN/BankRef found
	ConflictCount  int      `json:"conflict_count"`   // number of signal conflicts (0 = clean)
	ConflictTypes  []string `json:"conflict_types"`   // e.g. ["webhook_vs_poll_mismatch"]
}

// ── Event 8: from Service 5 (NEW — statement reconciliation) ─────────────────
//
// Arrives when Service 5 reconciles a settled payout against bank statements.
// ZPI uses this to compute statement_match_rate:
//   - MATCHED events → payout found in settlement statement
//   - UNMATCHED events → payout settled per signals but NOT in statement after 24h
//
// Kafka topic: statement.match.event
// Emitted by:  Service 5 Statement Adapter after each reconciliation pass

type StatementMatchEvent struct {
	EventID          string    `json:"event_id"`
	TenantID         string    `json:"tenant_id"`
	IntentID         string    `json:"intent_id"`
	CorridorID       string    `json:"corridor_id"` // e.g. "razorpay.UPI"
	Provider         string    `json:"provider"`
	MatchStatus      string    `json:"match_status"`      // "MATCHED" or "UNMATCHED"
	SettlementAmount string    `json:"settlement_amount"` // stored as string (money rule)
	SettlementDate   time.Time `json:"settlement_date"`   // when statement shows settlement
	SettledAt        time.Time `json:"settled_at"`        // when ZPI declared finality
	SourceStatement  string    `json:"source_statement"`  // e.g. "razorpay_settlement_2024-01-15"
	UTRMatched       string    `json:"utr_matched"`       // blank if UNMATCHED
	AgedSeconds      int64     `json:"aged_seconds"`      // time between settled_at and settlement_date
	CreatedAt        time.Time `json:"created_at"`
	TraceID          string    `json:"trace_id"`
}

// ── Event 5: from Service 5 / 6 ──────────────────────────────────────────────
//
// Arrives when the final contract read model is updated.
// This is the PRIMARY trigger for ZPI's policy engine.
// ZPI uses this to:
//   - Run all enabled event-triggered policies against current state

type FinalContractUpdatedEvent struct {
	EventID       string    `json:"event_id"`
	TenantID      string    `json:"tenant_id"`
	IntentID      string    `json:"intent_id"`
	ContractID    string    `json:"contract_id"`
	CorridorID    string    `json:"corridor_id"`
	Provider      string    `json:"provider"`
	Status        string    `json:"status"` // current contract status
	Confidence    float64   `json:"confidence"`
	FinalityLevel string    `json:"finality_level"`
	UpdatedAt     time.Time `json:"updated_at"`
	TraceID       string    `json:"trace_id"`
}

// ── Event 6: from Service 6 ───────────────────────────────────────────────────
//
// Arrives when Service 6 finishes building an evidence pack.
// ZPI uses this to:
//   - Update the evidence_readiness_rate projection
//   - Mark this contract as "has evidence" (reduces compliance risk score)

type EvidencePackReadyEvent struct {
	EventID                           string    `json:"event_id"`
	TenantID                          string    `json:"tenant_id"`
	IntentID                          string    `json:"intent_id"`
	ContractID                        string    `json:"contract_id"`
	EvidencePackID                    string    `json:"evidence_pack_id"`
	MerkleRoot                        string    `json:"merkle_root"` // cryptographic proof of evidence contents
	OccurredAt                        time.Time `json:"occurred_at"`
	TraceID                           string    `json:"trace_id"`
	PackCompletenessScore             float64   `json:"pack_completeness_score"`
	LeafCount                         int       `json:"leaf_count"`
	RequiredLeafCount                 int       `json:"required_leaf_count"`
	SettlementLeafPresentFlag         bool      `json:"settlement_leaf_present_flag"`
	AttachmentDecisionLeafPresentFlag bool      `json:"attachment_decision_leaf_present_flag"`
}

// ── Event 7: from any service's Dead Letter Queue ─────────────────────────────
//
// Arrives when any service fails to process a message after max retries.
// ZPI uses this to:
//   - Cluster failure reasons (which error codes keep appearing?)
//   - Suggest remediation (if reason = TIMEOUT → safe to retry)

type DLQEvent struct {
	EventID       string    `json:"event_id"`
	TenantID      string    `json:"tenant_id"`
	OriginalTopic string    `json:"original_topic"` // which topic failed
	ReasonCode    string    `json:"reason_code"`
	ErrorMessage  string    `json:"error_message"`
	AttemptCount  int       `json:"attempt_count"`
	FailedAt      time.Time `json:"failed_at"`
	TraceID       string    `json:"trace_id"`
}

// CorridorHealthTickEvent is a lightweight corridor heartbeat.
// Used by Service 7 to keep an operational "health status" projection per corridor.
type CorridorHealthTickEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	CorridorID string    `json:"corridor_id"`
	TickAt     time.Time `json:"tick_at"`
	TraceID    string    `json:"trace_id"`
}

// SLATimerTickEvent is a lightweight SLA timer heartbeat per corridor.
// Used by Service 7 to keep an operational SLA tick projection per corridor.
type SLATimerTickEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	CorridorID string    `json:"corridor_id"`
	TickAt     time.Time `json:"tick_at"`
	TraceID    string    `json:"trace_id"`
}

// GRADE A (ATTACHMENT INTELLIGENCE MODE) EVENTS
// These 5 events are the new upstream inputs introduced by the pivoted spec.
// They come from Service 5B (settlement observations), Service 5C (attachment
// and variance decisions), and Service 6 governance decisions.
//
// WHY "GRADE A"?
// The pivoted spec defines two operating modes:
//   Grade A — Attachment Intelligence Mode (these events)
//             Customer gives: intents + settlement files
//             ZPI produces:   leakage, ambiguity, defensibility, RCA, pattern
//   Grade B — Full Finality / Control Mode (existing events above)
//             Customer gives: dispatch control + real-time outcome signals
//             ZPI produces:   all of Grade A + finality-grade intelligence
//
// ZPI now supports both. Grade A events are the market-entry wedge.
// =============================================================================

// ── NEW EVENT A: from Service 5B ─────────────────────────────────────────────
//
// Arrives when Service 5B parses a settlement file line and creates a
// canonical settlement observation.
//
// WHAT IS A SETTLEMENT OBSERVATION?
// When a PSP or bank sends you a settlement statement (CSV, Excel, SFTP file),
// each line says: "we paid X amount on date Y with reference Z."
// Service 5B reads that file and turns each line into this event.
//
// ZPI uses this to:
//   - Track how many settlement observations arrived vs intents sent
//   - Feed the leakage calculation (unmatched = no observation for an intent)
//   - Update statement match rate projections
//
// Kafka topic: canonical.settlement.created  ← Service 5B
// =============================================================================

// CanonicalSettlementCreatedEvent represents one parsed settlement observation
// from a bank or PSP settlement file.
type CanonicalSettlementCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"` // when this event was emitted

	// ── Settlement observation identity ──────────────────────────────────────
	SettlementID string `json:"settlement_id"` // ZPI-internal ID: "sobs_" + uuid
	BatchID      string `json:"batch_id"`      // which batch this settlement belongs to (empty if unknown)

	// ── Source information ────────────────────────────────────────────────────
	SourceType     string `json:"source_type"`     // "SFTP_FILE", "API_CALLBACK", "MANUAL_UPLOAD"
	SourceStrength string `json:"source_strength"` // "HIGH", "MEDIUM", "LOW" — how reliable is this source?
	// HIGH   = bank statement or PSP settlement API (authoritative)
	// MEDIUM = webhook callback (fast but sometimes unreliable)
	// LOW    = manually uploaded CSV (human error risk)

	SourceSystemID  string  `json:"source_system_id"` // identifies the specific PSP/bank/ERP
	ProviderID      string  `json:"source_system"`    // e.g. ERP name, internal name
	PaymentRail     string  `json:"corridor_id"`      // PSP corridor ID
	ParseConfidence float64 `json:"parse_confidence"` // 0.0–1.0: how confident was the parser?
	// 1.0 = perfect parse, all fields found
	// 0.7 = some fields missing or ambiguous
	// < 0.5 = poor quality, likely to cause attachment issues

	// ── Financial details ─────────────────────────────────────────────────────
	// IMPORTANT: All money amounts stored as int64 in MINOR UNITS (paise, cents).
	// Never float64 for money. This matches the DB rule in Phase 1.
	SettledAmountMinor decimal.Decimal `json:"settled_amount_minor"` // amount in minor currency units
	Currency           string          `json:"currency"`             // "INR", "USD"
	SettlementDate     string          `json:"settlement_date"`      // "2026-04-08" — date on statement

	// ── Carrier / reference fields ────────────────────────────────────────────
	// "Carriers" are reference identifiers that allow ZPI to match (attach)
	// this settlement observation to the original payout intent.
	// The richer the carriers, the more accurate the attachment.
	UTR             string  `json:"utr"`              // Unique Transaction Reference (Indian banking)
	RRN             string  `json:"rrn"`              // Retrieval Reference Number
	BankRef         string  `json:"bank_ref"`         // bank's own reference number
	BankID          string  `json:"bank_id"`          // bank identifier
	ProviderRef     string  `json:"provider_ref"`     // PSP reference (e.g. Razorpay payment ID)
	ClientRef       string  `json:"client_ref"`       // merchant's own reference (most reliable)
	CarrierRichness float64 `json:"carrier_richness"` // 0.0–1.0: fraction of carrier fields populated
	// 1.0 = all 5 carriers populated → easy to match
	// 0.2 = only 1 carrier → very hard to match, high ambiguity risk

	// ── Attachment readiness ──────────────────────────────────────────────────
	// Score computed by Service 5B using its internal carrier + parse logic.
	// ZPI classifies this into READY / PARTIAL / POOR using fixed thresholds.
	// Range: 0.0 (no viable carriers) → 1.0 (all carriers present, parser confident).
	AttachmentReadiness float64 `json:"attachment_readiness"` // 0.0–1.0 score from Service 5B

	// ── Status observation ────────────────────────────────────────────────────
	StatusObservation string `json:"status_observation"` // "SETTLED", "REVERSED", "PENDING", "UNKNOWN"
	IngestRunID       string `json:"ingest_run_id"`

	MappingConfidence float64 `json:"mapping_confidence"`

	// // ── Pattern Intelligence fields (added per upstream contract — Service 5B) ──
	// // ProviderID: logical PSP/intermediary that processed this settlement.
	// // Service 5B sends this under the key "source_system".
	// // e.g. "razorpay", "payu", "cashfree"
	// ProviderID string `json:"source_system"`
	// // BankID: destination bank or financial institution code.
	// // e.g. "HDFC", "ICICI", "SBI"
	// BankID string `json:"bank_id"`
	// // PaymentRail: the transfer rail used.
	// // Service 5B sends this under the key "corridor_id".
	// // e.g. "NEFT", "RTGS", "IMPS", "UPI"
	// PaymentRail string `json:"corridor_id"`
}

// ── NEW EVENT B: from Service 5C ─────────────────────────────────────────────
//
// Arrives when Service 5C makes an attachment decision — i.e., it has tried
// to match a settlement observation to a payout intent.
//
// WHAT IS AN ATTACHMENT DECISION?
// Service 5C has: one settlement observation (from 5B) and a set of candidate
// payout intents that could match it. It picks the best match (or says
// "I cannot decide — ambiguous").
//
// Decision types:
//   MATCH_EXACT       → one perfect match found (all carriers agree)
//   MATCH_HIGH        → one strong match (most carriers agree)
//   MATCH_AMBIGUOUS   → multiple possible matches, confidence is low
//   MATCH_UNRESOLVED  → no match found at all (unmatched intent or orphan settlement)
//   MATCH_DUPLICATE   → this settlement looks like a duplicate of another
//
// ZPI uses this to:
//   - Compute ambiguity counts and value-at-risk
//   - Feed the leakage calculation (MATCH_UNRESOLVED = potential leakage)
//   - Trigger policy evaluation for ambiguity-related policies
//
// Kafka topic: attachment.decision.created  ← Service 5C
// =============================================================================

// AttachmentDecisionCreatedEvent represents Service 5C's decision about
// which payout intent a settlement observation belongs to.
type AttachmentDecisionCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Decision identity ─────────────────────────────────────────────────────
	DecisionID      string `json:"attachment_decision_id"`
	SettlementID    string `json:"settlement_observation_id"`
	IntentID        string `json:"intent_id"`
	ContractID      string `json:"contract_id"`
	CorridorID      string `json:"corridor_id"`
	BatchID         string `json:"batch_id"`
	ProviderID      string `json:"source_system"`
	ClientReference string `json:"client_reference"`

	// ── Decision outcome ──────────────────────────────────────────────────────
	DecisionType string `json:"decision_type"`
	// "MATCH_EXACT"      — perfect match, all carriers agree
	// "MATCH_HIGH"       — strong match, most carriers agree
	// "MATCH_AMBIGUOUS"  — multiple candidates, cannot auto-confirm
	// "MATCH_UNRESOLVED" — no match found (leakage risk)
	// "MATCH_DUPLICATE"  — duplicate settlement detected

	// ── Confidence and ambiguity scores ──────────────────────────────────────
	ConfidenceScore float64 `json:"confidence_score"`
	// 1.0  = certain (MATCH_EXACT with all carriers matching)
	// 0.85 = strong (MATCH_HIGH)
	// 0.50 = uncertain (MATCH_AMBIGUOUS)
	// 0.0  = no match (MATCH_UNRESOLVED)

	AmbiguityScore float64 `json:"ambiguity_score"`
	// 0.0 = trivial (one obvious match)
	// 1.0 = maximum ambiguity (payroll batch: 500 employees, same amount)

	DecisionReasonCode     string  `json:"decision_reason_code"`
	MatchingRulesetVersion string  `json:"matching_ruleset_version"`
	WinningScore           float64 `json:"winning_score"`
	RunnerUpScore          float64 `json:"runner_up_score"`
	ScoreMargin            float64 `json:"score_margin"`

	// ── Supporting evidence ────────────────────────────────────────────────────
	SupportingCarriers json.RawMessage `json:"supporting_carriers"` // JSON object of matched fields
	CandidateSetSize   int             `json:"candidate_set_size"`  // how many intents were considered
	// 1 = trivial (only one candidate)
	// 50 = hard (payroll-like batch with many same-amount payouts)

	CandidateSetHash string `json:"candidate_set_hash"`
	// Stored so we can replay the decision without storing all candidate IDs

	// ── Financial details ─────────────────────────────────────────────────────
	SettledAmountMinor  decimal.Decimal `json:"settled_amount"`
	IntendedAmountMinor decimal.Decimal `json:"intended_amount"`
	Currency            string          `json:"currency"`

	// Field added from AttachmentDecision DB model — needed for ambiguity analysis
	RelativeScoreMargin float64 `json:"relative_score_margin"` // (winning - runner_up) / winning — margin relative to winner
}

// ── NEW EVENT C: from Service 5C ─────────────────────────────────────────────
//
// Arrives when Service 5C detects a variance between what was intended
// and what was settled.
//
// WHAT IS A VARIANCE RECORD?
// Even when a settlement IS attached (matched) to an intent, the amounts
// or dates might not match perfectly:
//   - Under-settlement: we expected ₹1000 but received ₹980 (TDS deducted)
//   - Over-settlement: we expected ₹1000 but received ₹1020 (fee reversal?)
//   - Value-date mismatch: settled on Apr 9 but we expected Apr 8
//   - Cross-period: intent raised in March, settled in April
//   - Deduction: PSP deducted a fee not agreed upon
//
// ZPI uses this to:
//   - Compute the leakage amount (under-settlement is direct money loss)
//   - Feed the reconciliation intelligence layer
//   - Trigger OPEN_OPS_INCIDENT for unexpected deductions
//
// Kafka topic: variance.record.created  ← Service 5C
// =============================================================================

// VarianceRecordCreatedEvent represents a financial mismatch between
// what was intended and what was actually settled.
type VarianceRecordCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Variance identity ─────────────────────────────────────────────────────
	VarianceID   string `json:"variance_id"`   // "var_" + uuid
	DecisionID   string `json:"decision_id"`   // which attachment decision produced this variance
	IntentID     string `json:"intent_id"`     // the original payout intent
	SettlementID string `json:"settlement_id"` // the settlement observation
	CorridorID   string `json:"corridor_id"`
	BatchID      string `json:"batch_id"`
	ProviderID   string `json:"source_system"`

	// ── Variance type ─────────────────────────────────────────────────────────
	VarianceType string `json:"variance_type"` // one of:
	// "UNDER_SETTLEMENT"   — received less than intended
	// "OVER_SETTLEMENT"    — received more than intended
	// "VALUE_DATE_MISMATCH"— settled on wrong date
	// "CROSS_PERIOD"       — settlement crossed a financial period boundary
	// "DEDUCTION"          — PSP/bank deducted a fee or tax
	// "REVERSAL"           — settled but then reversed/returned

	// ── Financial values ──────────────────────────────────────────────────────
	// ALL amounts in minor currency units (paise, cents). Never float64.
	IntendedAmountMinor decimal.Decimal `json:"intended_amount_minor"` // what we expected
	SettledAmountMinor  decimal.Decimal `json:"settled_amount_minor"`  // what we actually received
	VarianceAmountMinor decimal.Decimal `json:"variance_amount_minor"` // intended - settled (negative = over)
	Currency            string          `json:"currency"`

	// ── Date mismatch ─────────────────────────────────────────────────────────
	ExpectedValueDate string `json:"expected_value_date"` // "2026-04-08"
	ActualValueDate   string `json:"actual_value_date"`   // "2026-04-09"
	CrossPeriodFlag   bool   `json:"cross_period_flag"`   // true if settlement crossed a month/quarter boundary

	// ── Evidence and deduction context ───────────────────────────────────────
	DeductionReason  string   `json:"deduction_reason"`   // e.g. "TDS_2PCT", "PSP_FEE", "" if not a deduction
	IsWhitelisted    bool     `json:"is_whitelisted"`     // true = this deduction was pre-agreed with the PSP
	EvidenceGapFlags []string `json:"evidence_gap_flags"` // named gaps: ["missing_utr", "no_bank_confirmation"]

	// Fields added from VarianceRecord DB model — required for KPI computation
	DeductionVariance      decimal.Decimal `json:"deduction_variance"`        // deduction amount in minor units (TDS, PSP fee)
	FeeVariance            decimal.Decimal `json:"fee_variance"`              // fee component of variance in minor units
	CurrencyMatchFlag      bool            `json:"currency_match_flag"`       // true = intent and settlement currencies match
	StatusVarianceFlag     bool            `json:"status_variance_flag"`      // true = status differs between intent and observation
	ValueDateMismatchFlag  bool            `json:"value_date_mismatch_flag"`  // true = value date differs from expected
	SettlementDelayDays    int             `json:"settlement_delay_days"`     // calendar days between intended_execution_at and settlement — needed for P6 p95
	ProviderRefMissingFlag bool            `json:"provider_ref_missing_flag"` // true = no UTR/RRN/BankRef on settlement side
	BankRefMissingFlag     bool            `json:"bank_ref_missing_flag"`     // true = bank reference absent
	EvidenceGapFlag        bool            `json:"evidence_gap_flag"`         // true = any evidence gap exists (bool summary of EvidenceGapFlags)
	VarianceSeverity       string          `json:"variance_severity"`         // "LOW" | "MEDIUM" | "HIGH" — computed by variance engine
}

// ── NEW EVENT D: from Service 5C ─────────────────────────────────────────────
//
// Arrives when Service 5C updates the aggregate status of an entire batch.
//
// WHAT IS A BATCH SUMMARY?
// A batch is a group of payouts submitted together (e.g. payroll for 500 employees).
// As individual payouts get attached and resolved, Service 5C periodically
// emits a summary of the whole batch's current state.
//
// ZPI uses this to:
//   - Update the batch_contracts table (Phase 1 schema)
//   - Compute batch-level ambiguity and defensibility scores
//   - Trigger REVIEW_AMBIGUOUS_BATCH policy if ambiguity is high
//   - Feed the Pattern intelligence layer
//
// Kafka topic: batch.summary.updated  ← Service 5C
// =============================================================================

// BatchSummaryUpdatedEvent represents the current aggregate state of a batch.
type BatchSummaryUpdatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Batch identity ────────────────────────────────────────────────────────
	BatchID         string `json:"batch_id"`         // e.g. "PAYROLL-2026-04-01"
	SourceReference string `json:"source_reference"` // file path or API reference
	CorridorID      string `json:"corridor_id"`

	// ── Aggregate counts ─────────────────────────────────────────────────────
	TotalCount        int `json:"total_count"`         // total intents in the batch
	SuccessCount      int `json:"success_count"`       // fully settled, no variance
	FailedCount       int `json:"failed_count"`        // failed or reversed
	PendingCount      int `json:"pending_count"`       // not yet resolved
	ReversedCount     int `json:"reversed_count"`      // reversed after settlement
	PartialReconCount int `json:"partial_recon_count"` // attached but with variance

	// ── Aggregate money amounts (all in minor units) ──────────────────────────
	TotalIntendedAmountMinor  decimal.Decimal `json:"total_intended_amount_minor"`
	TotalConfirmedAmountMinor decimal.Decimal `json:"total_confirmed_amount_minor"`
	OriginalSettledAmountMinor decimal.Decimal `json:"original_settled_amount"`
	TotalVarianceMinor        decimal.Decimal `json:"total_variance_minor"` // positive = leakage

	// ── Intelligence scores ───────────────────────────────────────────────────
	AmbiguityScore float64 `json:"ambiguity_score"` // 0.0–1.0 computed by Service 5C
	// High ambiguity = many same-amount payouts, weak carrier references

	MatchConfidence float64 `json:"aggregate_match_confidence"` // 0.0–1.0 computed by Service 5C

	BatchFinalityStatus string `json:"batch_finality_status"` // "PROCESSING", "FULLY_SETTLED", etc.
	// matches batch_contracts.batch_finality_status values from Phase 1 schema

	// Fields added from BatchAttachmentSummary DB model — required for P1 batch_quality_score
	ExactMatchCount     int     `json:"exact_match_count"`     // attachments resolved as MATCH_EXACT
	HighConfidenceCount int     `json:"high_confidence_count"` // attachments resolved as MATCH_HIGH
	AmbiguousCount      int     `json:"ambiguous_count"`       // attachments resolved as MATCH_AMBIGUOUS
	UnresolvedCount     int     `json:"unresolved_count"`      // attachments with no match (MATCH_UNRESOLVED)
	ConflictedCount     int     `json:"conflicted_count"`      // attachments with conflicting signals
	AggregateScore      float64 `json:"aggregate_score"`       // overall batch attachment quality score — primary input for P1

	TotalIntentCount int `json:"total_intent_count"` // total intents in the batch
	MatchedIntentCount int `json:"matched_intent_count"`
	UnresolvedIntentCount int `json:"unresolved_intent_count"`
	OrphanObservationCount	int `json:"orphan_observation_count"`

	OriginalIntendedAmount decimal.Decimal `json:"original_intended_amount"`
	MatchedIntendedAmount decimal.Decimal `json:"matched_intended_amount"`
	MatchedObservedAmount decimal.Decimal `json:"matched_observed_amount"`
	UnresolvedIntendedAmount decimal.Decimal `json:"unresolved_intended_amount"`
	AmbiguousAmount          decimal.Decimal `json:"ambiguous_amount"`
	ConflictedAmount         decimal.Decimal `json:"conflicted_amount"`
	OrphanObservedAmount decimal.Decimal `json:"orphan_observed_amount"`
	MatchedPairVariance decimal.Decimal `json:"matched_pair_variance"`
	NetBatchDelta decimal.Decimal `json:"net_batch_delta"`

	IntentCountCoverage float64 `json:"intent_count_coverage"`
	IntentValueCoverage float64 `json:"intent_value_coverage"`
	ObservationCountCoverage float64 `json:"observed_count_allocation_coverage"` // "observation_count_coverage"`
	ObservationValueCoverage float64 `json:"observed_value_allocation_coverage"`

}

// ── NEW EVENT E: from Service 6 ──────────────────────────────────────────────
//
// Arrives when Service 6 creates or updates a governance decision for a payment.
//
// WHAT IS A GOVERNANCE DECISION?
// Every payment that goes through Zord must have a governance record — a
// signed statement that the payment was reviewed, approved, and complies with
// policies (KYC, AML, risk limits, regulatory requirements).
//
// Service 6 embeds governance decisions inside Evidence Packs.
// This event tells ZPI that a governance decision now exists for a payment,
// so ZPI can update its defensibility score for that payment.
//
// WHY DOES ZPI NEED TO KNOW?
// The new spec says "governance decision coverage" is a MUST-HAVE for
// the Defensibility intelligence layer (Section 10.3).
// Without knowing which payments have governance coverage, ZPI cannot
// accurately compute "audit-ready %" or defensibility tiers.
//
// Kafka topic: governance.decision.created  ← Service 6
// =============================================================================

// GovernanceDecisionCreatedEvent represents a governance decision
// attached to a payout intent by Service 6.
type GovernanceDecisionCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Governance decision identity ──────────────────────────────────────────
	GovernanceDecisionID string `json:"governance_decision_id"` // "gdec_" + uuid
	IntentID             string `json:"intent_id"`              // which payout this covers
	ContractID           string `json:"contract_id"`
	EvidencePackID       string `json:"evidence_pack_id"` // which evidence pack contains this decision

	// ── Decision outcome ──────────────────────────────────────────────────────
	DecisionOutcome string `json:"decision_outcome"` // "APPROVED", "REJECTED", "ESCALATED", "PENDING"

	// ── Coverage details ──────────────────────────────────────────────────────
	// These flags tell ZPI which governance checks were performed.
	// Used to compute the defensibility score in Section 10.3:
	//   pack exists? +20
	//   governance decision present? +15
	//   ... etc.
	KYCChecked       bool `json:"kyc_checked"`       // KYC verification was performed
	AMLChecked       bool `json:"aml_checked"`       // AML screening was performed
	RiskChecked      bool `json:"risk_checked"`      // risk limit check was performed
	PolicyCompliant  bool `json:"policy_compliant"`  // complies with tenant's internal policies
	ReplayEquivalent bool `json:"replay_equivalent"` // evidence is sufficient to replay the decision

	// ── Authorisation context ─────────────────────────────────────────────────
	AuthorityLevel string `json:"authority_level"` // "SYSTEM_AUTO", "RULE_BASED", "HUMAN_REVIEW"
	// SYSTEM_AUTO  = automated system decision (lower evidential weight in disputes)
	// RULE_BASED   = triggered by a configured policy (medium weight)
	// HUMAN_REVIEW = a human reviewed and approved (highest evidential weight)

	DecidedAt time.Time `json:"decided_at"` // when the governance decision was made
}

// ── NEW EVENT F: from Service 2 ──────────────────────────────────────────────
//
// Arrives when a payment intent row is routed to manual review before or during
// dispatch. Emitted per-intent (one event per reviewed row).
//
// WHAT IS MANUAL REVIEW?
// When a payment row fails automated validation (invalid IFSC, missing fields,
// schema mismatch, amount format errors, duplicate risk) it is held in a manual
// review queue for a human operator to inspect before the payment is dispatched.
//
// ZPI uses this event to:
//   - Compute manual_review_rate_by_source (which source system generates the most errors)
//   - Detect recurring file quality patterns per source
//   - Trigger "Fix Source Export" and "Fix Source Schema" recommendation cards
//   - Compute manual_review_amount exposure per source over rolling windows
//
// KEY RULE: amount_minor must follow the same minor-unit convention as all
// other monetary fields in ZPI (paise for INR, cents for USD). Never float64.
//
// Kafka topic: payments.intent.dlq
// Published by: zord-relay (pulls/leases rows from zord-intent-engine's DLQ table
//               and publishes as a standard RelayEvent envelope to Kafka)
// =============================================================================

// DLQItemEvent represents a single payment intent row that was routed to
// manual review due to a validation or quality failure.
type DLQItemEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Intent reference ──────────────────────────────────────────────────────
	IntentID string `json:"intent_id"` // the intent that was flagged
	BatchID  string `json:"batch_id"`  // which batch this intent belongs to

	// ── Source attribution ────────────────────────────────────────────────────
	// SourceSystem identifies the upstream ERP, file upload, or API channel that
	// created this intent. This is the primary dimension ZPI groups by.
	// Examples: "tally_branch_a", "sap_vendor_batch", "manual_excel", "api_direct"
	SourceSystem string `json:"source_system"`

	// ── Financial impact ──────────────────────────────────────────────────────
	// AmountMinor: the intended payment amount for this row in minor currency units.
	// Relay publishes this under key "amount" (extracted from IntentContext).
	AmountMinor decimal.Decimal `json:"amount"`

	// ── Failure reason ────────────────────────────────────────────────────────
	// ReasonCode: the primary reason this row was routed to manual review.
	// ZPI groups by this to detect dominant failure patterns per source.
	//
	// Expected values:
	//   MISSING_CLIENT_PAYOUT_REF — client_payout_ref / VoucherNo / InvoiceNo absent
	//   INVALID_IFSC              — bank IFSC is malformed or not in master list
	//   MISSING_ACCOUNT_NUMBER    — beneficiary account number absent
	//   INVALID_AMOUNT_FORMAT     — amount is non-numeric, negative, or exceeds limit
	//   DUPLICATE_ROW             — row is a duplicate of another row in same batch
	//   SCHEMA_MISMATCH           — row fields do not match expected source mapping
	//   MISSING_VENDOR_CODE       — vendor/seller identifier absent
	//   BENEFICIARY_BLACKLISTED   — beneficiary flagged in AML/compliance list
	//   CURRENCY_MISMATCH         — currency code invalid or mismatched with corridor
	//   OTHER                     — any other reason not covered above
	ReasonCode string `json:"reason_code"`
}
