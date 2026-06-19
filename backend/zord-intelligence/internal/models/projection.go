package models

import (
	"time"

	"github.com/shopspring/decimal"
)

// ProjectionState represents one row in the projection_state table.
//
// A projection is a computed KPI number derived from Kafka events.
// Examples:
//   - "razorpay.UPI success rate in last 24h = 97%"
//   - "cashfree.IMPS finality p95 in last 24h = 8 minutes"
//   - "tenant tnt_A evidence readiness = 91%"
//
// ZPI computes these numbers continuously as events arrive from Kafka.
// The frontend reads them via GET /v1/intelligence/kpis

type ProjectionState struct {
	ID                int64     `json:"id" db:"id"`
	TenantID          string    `json:"tenant_id" db:"tenant_id"`
	ProjectionKey     string    `json:"projection_key" db:"projection_key"`
	WindowStart       time.Time `json:"window_start" db:"window_start"`
	WindowEnd         time.Time `json:"window_end" db:"window_end"`
	ValueJSON         string    `json:"value_json" db:"value_json"`
	ComputedAt        time.Time `json:"computed_at" db:"computed_at"`
	ProjectionVersion int       `json:"projection_version" db:"projection_version"`
}

// ── Projection Value Types ────────────────────────────────────────────────────
// These are the shapes stored inside ValueJSON above.
// projection_service.go marshals these to JSON before saving.
// kpi_handler.go can unmarshal them to send structured data to frontend.

// SuccessRateValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.success_rate.razorpay_UPI"
type SuccessRateValue struct {
	Rate         float64   `json:"rate"`          // 0.0 to 1.0 e.g. 0.97
	SettledCount int       `json:"settled_count"` // how many SETTLED
	TotalCount   int       `json:"total_count"`   // how many total
	UpdatedAt    time.Time `json:"updated_at"`
}

// FinalityLatencyValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.finality_p95.razorpay_UPI"
type FinalityLatencyValue struct {
	P50Seconds float64   `json:"p50_seconds"` // median time to finality
	P95Seconds float64   `json:"p95_seconds"` // 95th percentile — the SLA number
	Count      int       `json:"count"`       // how many data points
	UpdatedAt  time.Time `json:"updated_at"`
}

// EvidenceReadinessValue is stored in ProjectionState.ValueJSON
// for projection_key "tenant.evidence_readiness"
type EvidenceReadinessValue struct {
	Rate         float64   `json:"rate"`          // 0.0 to 1.0
	WithEvidence int       `json:"with_evidence"` // contracts that have evidence packs
	TotalSettled int       `json:"total_settled"` // total settled contracts
	UpdatedAt    time.Time `json:"updated_at"`
}

// FailureTaxonomyValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.failure_taxonomy.razorpay_UPI"
type FailureTaxonomyValue struct {
	TopReasons []ReasonCount `json:"top_reasons"` // sorted by count, top 5
	TotalFails int           `json:"total_fails"`
	UpdatedAt  time.Time     `json:"updated_at"`
}

// ReasonCount is one entry inside FailureTaxonomyValue.TopReasons
type ReasonCount struct {
	ReasonCode string  `json:"reason_code"` // e.g. "INSUFFICIENT_FUNDS"
	Count      int     `json:"count"`
	Rate       float64 `json:"rate"` // count / total_fails
}

// PendingBacklogValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.pending_backlog.razorpay_UPI"
type PendingBacklogValue struct {
	TotalPending  int       `json:"total_pending"`
	Bucket0to10m  int       `json:"bucket_0_10m"`   // pending 0-10 minutes
	Bucket10to60m int       `json:"bucket_10_60m"`  // pending 10-60 minutes
	Bucket1to6h   int       `json:"bucket_1_6h"`    // pending 1-6 hours
	Bucket6hPlus  int       `json:"bucket_6h_plus"` // pending 6+ hours (critical)
	UpdatedAt     time.Time `json:"updated_at"`
}

// RetryRecoveryRateValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.retry_recovery_rate.razorpay_UPI"
//
// Tracks how well retries rescue failed payouts per corridor.
// Data source: DispatchAttemptCreatedEvent (attempt_no > 1 = retry)
//
//	FinalityCertIssuedEvent (final_state = SETTLED after retry = recovered)
//
// Example:
//
//	corridor razorpay.UPI today:
//	- total_attempts: 1200 dispatches
//	- retry_attempts: 80 (attempt_no > 1)
//	- recovered:      55 (retried AND reached SETTLED)
//	- recovery_rate:  0.6875 (55/80)
type RetryRecoveryRateValue struct {
	TotalAttempts int       `json:"total_attempts"` // all dispatch attempts (including first)
	RetryAttempts int       `json:"retry_attempts"` // dispatches with attempt_no > 1
	Recovered     int       `json:"recovered"`      // retried intents that reached SETTLED
	RecoveryRate  float64   `json:"recovery_rate"`  // recovered / retry_attempts (0 if no retries)
	UpdatedAt     time.Time `json:"updated_at"`
}

// StatementMatchRateValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.statement_match_rate.razorpay_UPI"
//
// Tracks what % of settled payouts appear in the bank/PSP settlement statement.
// Requires Service 5 to emit StatementMatchEvent (new Kafka topic).
//
// A low match rate is a finance alarm: payouts are "settled" per signals
// but the money isn't confirmed in the statement → potential leakage or
// delay in settlement → reconciliation exceptions pile up.
//
// Example:
//
//	corridor razorpay.UPI today:
//	- total_settled:      1000 payouts reached SETTLED state
//	- matched:             970 found in statement
//	- unmatched:            30 NOT in statement after 24h
//	- match_rate:          0.97
//	- avg_match_age_secs: 1200 (avg delay between finality and statement appearance)
type StatementMatchRateValue struct {
	TotalSettled      int       `json:"total_settled"`        // payouts that reached SETTLED
	Matched           int       `json:"matched"`              // found in settlement statement
	Unmatched         int       `json:"unmatched"`            // NOT found after 24h
	MatchRate         float64   `json:"match_rate"`           // matched / total_settled
	AvgMatchAgeSecs   float64   `json:"avg_match_age_secs"`   // avg aged_seconds across MATCHED events
	TotalMatchAgeSecs int64     `json:"total_match_age_secs"` // running sum for incremental avg
	UpdatedAt         time.Time `json:"updated_at"`
}

// ProviderRefMissingRateValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.provider_ref_missing_rate.razorpay_UPI"
//
// Tracks what % of finalized payouts are missing a provider reference
// (UTR / RRN / BankRef). A missing ref means:
//   - Cannot trace the money end-to-end
//   - Disputes become very hard to resolve
//   - Evidence packs are weaker
//
// Data source: FinalityCertIssuedEvent.HasProviderRef (new field from Service 5)
//
// Example:
//
//	corridor cashfree.IMPS today:
//	- total_finalized:   500
//	- missing_ref:        45 (has_provider_ref = false)
//	- with_ref:          455
//	- missing_rate:      0.09  ← 9% of payouts have no traceable bank reference
type ProviderRefMissingRateValue struct {
	TotalFinalized int       `json:"total_finalized"` // all finalized (any final_state)
	MissingRef     int       `json:"missing_ref"`     // has_provider_ref = false
	WithRef        int       `json:"with_ref"`        // has_provider_ref = true
	MissingRate    float64   `json:"missing_rate"`    // missing_ref / total_finalized
	UpdatedAt      time.Time `json:"updated_at"`
}

// ConflictRateInFusionValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.conflict_rate_in_fusion.razorpay_UPI"
//
// Tracks how often Outcome Fusion encounters conflicting signals when
// building finality for this corridor. High conflict rate means:
//   - PSP signals are unreliable / inconsistent
//   - More ops investigation needed per payout
//   - Higher risk of wrong finality decision
//
// Data source: FinalityCertIssuedEvent.ConflictCount + ConflictTypes (new fields)
//
// ConflictTypeBreakdown lets ops see WHICH conflict types dominate,
// e.g. "webhook_vs_poll_mismatch" vs "amount_mismatch"
//
// Example:
//
//	corridor razorpay.UPI today:
//	- total_finalized:   1000
//	- with_conflicts:      87 (conflict_count > 0)
//	- conflict_rate:      0.087
//	- total_conflicts:    95  (sum of all conflict_count values — can be > with_conflicts)
//	- conflict_type_breakdown: {"webhook_vs_poll_mismatch": 50, "amount_mismatch": 37}
type ConflictRateInFusionValue struct {
	TotalFinalized        int            `json:"total_finalized"`         // all finalized certs
	WithConflicts         int            `json:"with_conflicts"`          // certs that had conflict_count > 0
	ConflictRate          float64        `json:"conflict_rate"`           // with_conflicts / total_finalized
	TotalConflicts        int            `json:"total_conflicts"`         // sum of all conflict_count values
	ConflictTypeBreakdown map[string]int `json:"conflict_type_breakdown"` // per-type counts
	UpdatedAt             time.Time      `json:"updated_at"`
}

// SLABreachRateValue is stored in ProjectionState.ValueJSON
// for projection_key "tenant.sla_breach_rate"
//
// Tracks SLA compliance per tenant per day.
// An SLA timer is "breached" when:
//  1. Timer reaches its deadline (created_at + SLA_DURATION)
//  2. But payout is still PENDING (not SETTLED/FAILED/REVERSED)
//  3. We say "the SLA was breached"
//
// Example:
//
//	tenant_id "tnt_A" on 2024-01-15:
//	- total_processed: 1000 intents that reached finality
//	- breached: 45 (exceeded their SLA deadline)
//	- on_time: 955 (settled before deadline)
//	- breach_rate: 0.045 (45/1000)
//	- avg_breach_seconds: 1200 (average 20 minutes late)
type SLABreachRateValue struct {
	TotalProcessed     int       `json:"total_processed"`      // intents finalized in window
	Breached           int       `json:"breached"`             // exceeded SLA
	OnTime             int       `json:"on_time"`              // met SLA
	BreachRate         float64   `json:"breach_rate"`          // breached / total_processed
	AvgBreachSeconds   float64   `json:"avg_breach_seconds"`   // average late time
	TotalBreachSeconds int64     `json:"total_breach_seconds"` // running sum (for incremental avg)
	UpdatedAt          time.Time `json:"updated_at"`
}

// ── PHASE 3: New Intelligence Projection Value Types ──────────────────────────
//
// These four types are stored in projection_state.value_json for the new
// Grade A intelligence families introduced by the pivoted ZPI spec.
//
// Each type maps 1-to-1 with an atomic repo method in projection_repo.go:
//   LeakageValue        ← AtomicRecordLeakage / AtomicRecordVariance
//   AmbiguityValue      ← AtomicRecordAttachmentDecision
//   DefensibilityValue  ← AtomicRecordGovernanceCoverage
//   BatchHealthValue    ← AtomicUpdateBatchHealth
//
// ALL MONEY IS STORED AS int64 IN MINOR UNITS (paise, cents).
// NEVER use float64 for money. This is a fintech hard rule.
// ─────────────────────────────────────────────────────────────────────────────

// LeakageValue is stored in ProjectionState.ValueJSON
// for projection_key "leakage.total" at TENANT scope.
//
// Captures every dimension of money exposure as defined in spec Section 10.1.
//
// The breakdown map allows any call-site to increment an arbitrary leakage
// bucket (e.g. "REVERSAL", "UNDER_SETTLEMENT") without requiring a schema
// migration. This is critical for a multi-tenant fintech system where new
// PSP-specific variance types emerge without warning.
//
// Projection key pattern: "leakage.total"
// Entity scope type:      TENANT
// Projection family:      LEAKAGE
//
// Example value:
//
//	{
//	  "total_amount_minor": 785000,
//	  "unmatched_amount_minor": 750000,
//	  "under_settlement_amount_minor": 35000,
//	  "orphan_amount_minor": 0,
//	  "reversal_exposure_minor": 37000,
//	  "unmatched_intent_count": 5,
//	  "under_settlement_count": 2,
//	  "orphan_settlement_count": 0,
//	  "reversal_count": 1,
//	  "total_intended_amount_minor": 10000000,
//	  "leakage_percentage": 0.0785,
//	  "breakdown_by_type": {"UNDER_SETTLEMENT": 35000, "REVERSAL": 37000},
//	  "updated_at": "2026-04-13T10:00:00Z"
//	}
type LeakageValue struct {
	// ── Running money totals (all in minor currency units) ────────────────
	TotalAmountMinor           decimal.Decimal `json:"total_amount_minor"`            // sum of all leakage types
	UnmatchedAmountMinor       decimal.Decimal `json:"unmatched_amount_minor"`        // intents with no settlement
	UnderSettlementAmountMinor decimal.Decimal `json:"under_settlement_amount_minor"` // intended - settled (> 0 = leakage)
	OrphanAmountMinor          decimal.Decimal `json:"orphan_amount_minor"`           // settlements with no intent
	ReversalExposureMinor      decimal.Decimal `json:"reversal_exposure_minor"`       // reversed after success

	// ── Running event counts ─────────────────────────────────────────────
	UnmatchedIntentCount  int `json:"unmatched_intent_count"`  // MATCH_UNRESOLVED decisions
	UnderSettlementCount  int `json:"under_settlement_count"`  // UNDER_SETTLEMENT variances
	OrphanSettlementCount int `json:"orphan_settlement_count"` // settlements without intent
	ReversalCount         int `json:"reversal_count"`          // REVERSAL variance events

	// ── L7: Duplicate risk exposure ───────────────────────────────────────
	// Incremented from IntentCreatedEvent.DuplicateRiskFlag=true.
	DuplicateRiskCount         int             `json:"duplicate_risk_count"`          // intents flagged as duplicate risk at intent creation
	DuplicateRiskExposureMinor decimal.Decimal `json:"duplicate_risk_exposure_minor"` // sum of intended amounts for risk-flagged intents

	// ── L7b: Confirmed duplicate exposure ─────────────────────────────────
	// Incremented from AttachmentDecisionCreatedEvent.DecisionType==MATCH_DUPLICATE.
	ConfirmedDuplicateCount         int             `json:"confirmed_duplicate_count"`          // decisions confirmed as MATCH_DUPLICATE
	ConfirmedDuplicateExposureMinor decimal.Decimal `json:"confirmed_duplicate_exposure_minor"` // sum of intended amounts for confirmed duplicates

	// ── Denominator for percentage ────────────────────────────────────────
	// We track total intended so we can compute leakage_percentage without
	// reading a second projection. Keeping both numerator and denominator
	// in the same row is the atomic SQL pattern used throughout this codebase.
	TotalIntendedAmountMinor decimal.Decimal `json:"total_intended_amount_minor"` // sum of all intent amounts

	// ── Observed settled volume (L2) ─────────────────────────────────────
	// Accumulated from CanonicalSettlementCreatedEvent.SettledAmountMinor for
	// every settlement regardless of attachment readiness. Used to compute the
	// gap between intended and actually-settled volume.
	TotalObservedSettledAmountMinor decimal.Decimal `json:"total_observed_settled_amount_minor"`

	// ── Value-date mismatch count (P7 numerator) ──────────────────────────
	// Incremented for each VarianceRecordCreatedEvent with VarianceType == "VALUE_DATE_MISMATCH".
	ValueDateMismatchCount int `json:"value_date_mismatch_count"`

	// ── Derived rate (recomputed after every increment) ───────────────────
	LeakagePercentage float64 `json:"leakage_percentage"` // (unmatched + under_settlement + reversal) / total_intended — doc §7.1 KPI 9

	// ── Per-type breakdown ────────────────────────────────────────────────
	// Key: variance_type string (e.g. "UNDER_SETTLEMENT", "REVERSAL", "DEDUCTION")
	// Value: cumulative minor-unit amount for that type
	// This map is updated atomically in Postgres via jsonb_set ARRAY path.
	BreakdownByType map[string]decimal.Decimal `json:"breakdown_by_type"`

	// ── Pattern Intelligence extensions ───────────────────────────────────
	// WhitelistedDeductionAmountMinor: sum of variance_amount_minor for all
	// is_whitelisted=true variance records. Required to separate legitimate PSP
	// fees from genuine unexplained loss in the Pattern Intelligence layer.
	// Previously these events were silently skipped; now we track their amount.
	WhitelistedDeductionAmountMinor decimal.Decimal `json:"whitelisted_deduction_amount_minor"`

	// OverSettlementAmountMinor: sum of variance_amount_minor for all
	// VarianceType="OVER_SETTLEMENT" records. Previously skipped entirely.
	// Needed for "over-settlement" pattern detection (unexpected credit risk).
	OverSettlementAmountMinor decimal.Decimal `json:"over_settlement_amount_minor"`
	OverSettlementCount       int             `json:"over_settlement_count"`

	UpdatedAt time.Time `json:"updated_at"`
}

// AmbiguityValue is stored in ProjectionState.ValueJSON
// for projection_key "ambiguity.summary" at TENANT scope.
//
// Captures the full ambiguity picture as defined in spec Section 10.2.
// Fuelled directly by AttachmentDecisionCreatedEvent from Service 5C.
//
// WHY TRACK avg_attachment_confidence INCREMENTALLY?
// Running average maintained via Welford's online algorithm in SQL:
//
//	new_count = old_count + 1
//	new_sum   = old_sum + new_value
//	new_avg   = new_sum / new_count
//
// This avoids storing all historical confidence scores and remains
// accurate through millions of events.
//
// Projection key pattern: "ambiguity.summary"
// Entity scope type:      TENANT
// Projection family:      AMBIGUITY
//
// Example value:
//
//	{
//	  "ambiguous_intent_count": 78,
//	  "ambiguous_amount_minor": 1100000,
//	  "unresolved_settlement_count": 20,
//	  "value_at_risk_minor": 1850000,
//	  "avg_attachment_confidence": 0.83,
//	  "confidence_sum": 831.4,
//	  "confidence_count": 1001,
//	  "provider_ref_missing_count": 45,
//	  "total_decisions": 1000,
//	  "provider_ref_missing_rate": 0.045,
//	  "ambiguity_rate": 0.078,
//	  "updated_at": "2026-04-13T10:00:00Z"
//	}
type AmbiguityValue struct {
	// ── Ambiguous attachment counts ───────────────────────────────────────
	AmbiguousIntentCount      int             `json:"ambiguous_intent_count"`      // MATCH_AMBIGUOUS decisions
	AmbiguousAmountMinor      decimal.Decimal `json:"ambiguous_amount_minor"`      // sum of intended amounts for ambiguous
	UnresolvedSettlementCount int             `json:"unresolved_settlement_count"` // MATCH_UNRESOLVED decisions

	// ── Value at risk ─────────────────────────────────────────────────────
	// Spec Section 10.2: "Ambiguous Value-at-Risk =
	//   sum(intended_amount_minor for MATCH_AMBIGUOUS or MATCH_UNRESOLVED)"
	// This is the headline number finance cares about.
	ValueAtRiskMinor decimal.Decimal `json:"value_at_risk_minor"`

	// ── Running average confidence (incremental sum / count) ──────────────
	AvgAttachmentConfidence float64 `json:"avg_attachment_confidence"` // 0.0–1.0
	ConfidenceSum           float64 `json:"confidence_sum"`            // running sum for incremental avg
	ConfidenceCount         int     `json:"confidence_count"`          // total decisions counted

	// ── Provider ref quality ──────────────────────────────────────────────
	// A zero-carrier attachment (candidate_set_size > 1, no carriers matched)
	// is a strong signal of source-system hygiene problems.
	ProviderRefMissingCount int `json:"provider_ref_missing_count"` // decisions with no carrier refs
	TotalDecisions          int `json:"total_decisions"`            // all attachment decisions seen

	// ── Low-confidence decisions (A5) ────────────────────────────────────
	// Decisions where ConfidenceScore < 0.70 (threshold aligned with weakestCohortSignal).
	LowConfidenceCount int `json:"low_confidence_count"`

	// ── Candidate collision (A6) ─────────────────────────────────────────
	// Decisions where CandidateSetSize > 1 — multiple attachment candidates competed.
	CandidateCollisionCount int `json:"candidate_collision_count"`

	// ── Score margin running average (A7) ────────────────────────────────
	// ScoreMargin = WinningScore - RunnerUpScore, received pre-computed from upstream.
	// Stored as sum+count so the average survives incremental updates.
	ScoreMarginSum   float64 `json:"score_margin_sum"`
	ScoreMarginCount int     `json:"score_margin_count"`
	AvgScoreMargin   float64 `json:"avg_score_margin"` // recomputed: sum / count

	// ── Carrier completeness (A8) ─────────────────────────────────────────
	// Populated from CanonicalSettlementCreatedEvent.CarrierRichness.
	// A settlement is "carrier-complete" when CarrierRichness >= 0.60.
	CarrierCompleteCount  int `json:"carrier_complete_count"`
	TotalCarrierRecords   int `json:"total_carrier_records"`
	CarrierCompletenessRate float64 `json:"carrier_completeness_rate"` // recomputed: complete / total

	// ── A9: Successful decisions ──────────────────────────────────────────
	// A decision is "successful" when it is unambiguous, has a single
	// (non-colliding) candidate, and the settled amount exactly matches
	// the intended amount:
	//   ambiguity_score <= 0.30 && candidate_set_size <= 1 && settled == intended
	SuccessfulDecisionCount int `json:"successful_decision_count"`

	// ── Derived rates (recomputed after every increment) ─────────────────
	ProviderRefMissingRate float64 `json:"provider_ref_missing_rate"` // missing_count / total_decisions
	AmbiguityRate          float64 `json:"ambiguity_rate"`            // ambiguous_count / total_decisions
	LowConfidenceRate      float64 `json:"low_confidence_rate"`       // low_confidence_count / total_decisions
	CandidateCollisionRate float64 `json:"candidate_collision_rate"`  // collision_count / total_decisions
	DecisionSuccessRate    float64 `json:"decision_success_rate"`     // successful_decision_count / total_decisions

	UpdatedAt time.Time `json:"updated_at"`
}

// DefensibilityValue is stored in ProjectionState.ValueJSON
// for projection_key "defensibility.summary" at TENANT scope.
//
// Captures evidence and governance coverage as defined in spec Section 10.3.
// Fuelled by EvidencePackReadyEvent (Service 6) and GovernanceDecisionCreatedEvent.
//
// SCORING RUBRIC from spec Section 10.3 (total possible = 100 points):
//
//	pack exists?                    +20
//	canonical intent leaf present?  +10
//	settlement proof leaf present?  +10
//	governance decision present?    +15
//	attachment decision present?    +15
//	supporting carriers > threshold?+10
//	ambiguity low?                  +10
//	replay equivalence confirmed?   +10
//
// We track numerators and denominators separately so the defensibility tier
// (STRONG/GOOD/WEAK/FRAGILE) can be recomputed without re-reading raw events.
//
// Projection key pattern: "defensibility.summary"
// Entity scope type:      TENANT
// Projection family:      DEFENSIBILITY
type DefensibilityValue struct {
	// ── Coverage counts ───────────────────────────────────────────────────
	TotalIntents             int `json:"total_intents"`              // total intents seen in window
	WithEvidencePack         int `json:"with_evidence_pack"`         // have a Service 6 evidence pack
	WithGovernanceDecision   int `json:"with_governance_decision"`   // have a governance decision
	WithReplayEquivalence    int `json:"with_replay_equivalence"`    // replay_equivalent = true in governance
	WithKYCChecked           int `json:"with_kyc_checked"`           // KYC was performed
	WithAMLChecked           int `json:"with_aml_checked"`           // AML screening was performed
	GovernanceApprovedCount  int `json:"governance_approved_count"`  // outcome = APPROVED
	GovernanceRejectedCount  int `json:"governance_rejected_count"`  // outcome = REJECTED (compliance risk flag)
	GovernanceEscalatedCount int `json:"governance_escalated_count"` // outcome = ESCALATED

	// ── Derived coverage rates (recomputed after every increment) ─────────
	// These are the headline numbers for the Defensibility intelligence view.
	// Spec Section 10.3: "audit-ready %", "dispute-ready %", "governance-covered %"
	EvidencePackRate      float64 `json:"evidence_pack_rate"`      // with_evidence_pack / total_intents
	GovernanceCoveragePct float64 `json:"governance_coverage_pct"` // with_governance_decision / total_intents
	ReplayabilityPct      float64 `json:"replayability_pct"`       // with_replay_equivalence / total_intents
	AuditReadyPct         float64 `json:"audit_ready_pct"`         // (with_evidence_pack + with_governance_decision) / (2 * total_intents)
	DisputeReadyPct       float64 `json:"dispute_ready_pct"`       // all three: pack + governance + replay

	// ── D2: Pack completeness score (running average) ────────────────────
	// Accumulated from EvidencePackReadyEvent.PackCompletenessScore.
	// AvgPackCompletenessScore = PackCompletenessSum / PackCompletenessCount.
	PackCompletenessSum      float64 `json:"pack_completeness_sum"`       // running sum for D2
	PackCompletenessCount    int     `json:"pack_completeness_count"`     // count of packs seen
	AvgPackCompletenessScore float64 `json:"avg_pack_completeness_score"` // D2 derived: sum/count

	// ── D4: Settlement evidence coverage ─────────────────────────────────
	// Fraction of evidence packs that include a settlement leaf.
	// SettlementEvidenceCoverage = WithSettlementLeaf / WithEvidencePack.
	WithSettlementLeaf         int     `json:"with_settlement_leaf"`          // packs with settlement_leaf_present_flag=true
	SettlementEvidenceCoverage float64 `json:"settlement_evidence_coverage"`  // D4 derived rate

	// ── D5: Attachment evidence coverage ─────────────────────────────────
	// Fraction of evidence packs that include an attachment decision leaf.
	// AttachmentEvidenceCoverage = WithAttachmentLeaf / WithEvidencePack.
	WithAttachmentLeaf         int     `json:"with_attachment_leaf"`           // packs with attachment_decision_leaf_present_flag=true
	AttachmentEvidenceCoverage float64 `json:"attachment_evidence_coverage"`  // D5 derived rate

	// ── D7: Weak evidence rate ────────────────────────────────────────────
	// Fraction of total intents associated with a variance that had an evidence gap.
	// Incremented from VarianceRecordCreatedEvent.EvidenceGapFlag=true.
	// WeakEvidenceRate = WeakEvidenceCount / TotalIntents.
	WeakEvidenceCount int     `json:"weak_evidence_count"` // variances with evidence_gap_flag=true
	WeakEvidenceRate  float64 `json:"weak_evidence_rate"`  // D7 derived rate

	// ── Weakest-proof reference ───────────────────────────────────────────
	// Updated by Phase 4 services when they identify the worst-performing
	// corridor or source system for evidence quality.
	// Stored as a free-form string to avoid a schema migration per Phase 4.
	// Format: "corridor:{corridor_id}" or "source:{source_system_id}"
	WeakestProofRef string `json:"weakest_proof_ref,omitempty"`

	// ── Pattern Intelligence extensions: missing leaf tracking ────────────
	// Required to compute missing_leaf_rate = (total_required_leaves - actual_leaves) / total_required_leaves.
	// Previously LeafCount and RequiredLeafCount were received but not stored.
	TotalLeafCount         int     `json:"total_leaf_count"`           // sum of leaf_count across all evidence packs
	TotalRequiredLeafCount int     `json:"total_required_leaf_count"`  // sum of required_leaf_count across all evidence packs
	MissingLeafCount       int     `json:"missing_leaf_count"`         // sum of (required - actual) per pack
	MissingLeafRate        float64 `json:"missing_leaf_rate"`          // missing_leaf_count / total_required_leaf_count

	UpdatedAt time.Time `json:"updated_at"`
}

// BatchHealthValue is stored in ProjectionState.ValueJSON
// for projection_key pattern "batch.health.{batch_id}" at BATCH scope.
//
// Captures the real-time financial and operational health of one batch.
// Fuelled by BatchSummaryUpdatedEvent from Service 5C.
//
// WHY A PROJECTION AS WELL AS batch_contracts TABLE?
// batch_contracts = authoritative full-replacement upsert of current state.
// batch.health.*  = time-windowed projection history queryable via standard
//
//	projection API. They are complementary, not redundant.
//
// The projection enables trend queries ("how did this batch's ambiguity
// change over the last 6 hours?") that batch_contracts cannot serve.
//
// Projection key pattern: "batch.health.{batch_id}"
// Entity scope type:      BATCH
// Entity scope ref:       batch_id
// Projection family:      PATTERN
//
// Example value:
//
//	{
//	  "total_count": 500,
//	  "success_count": 430,
//	  "failed_count": 12,
//	  "pending_count": 50,
//	  "reversed_count": 8,
//	  "partial_recon_count": 0,
//	  "total_intended_amount_minor": 50000000,
//	  "total_confirmed_amount_minor": 43000000,
//	  "total_variance_minor": 7000000,
//	  "ambiguity_score": 0.12,
//	  "finality_status": "PARTIALLY_SETTLED",
//	  "updated_at": "2026-04-13T10:00:00Z"
//	}
type BatchHealthValue struct {
	// ── Counts ───────────────────────────────────────────────────────────
	TotalCount        int `json:"total_count"`
	SuccessCount      int `json:"success_count"`
	FailedCount       int `json:"failed_count"`
	PendingCount      int `json:"pending_count"`
	ReversedCount     int `json:"reversed_count"`
	PartialReconCount int `json:"partial_recon_count"` // attached but with variance

	// ── Money totals (all in minor currency units — fintech hard rule) ────
	TotalIntendedAmountMinor  decimal.Decimal `json:"total_intended_amount_minor"`
	TotalConfirmedAmountMinor decimal.Decimal `json:"total_confirmed_amount_minor"`
	TotalVarianceMinor        decimal.Decimal `json:"total_variance_minor"` // positive = leakage, negative = overpayment

	// ── Intelligence scores ───────────────────────────────────────────────
	AmbiguityScore float64 `json:"ambiguity_score"` // 0.0–1.0 from Service 5C

	// ── P1: Batch quality score inputs (from BatchAttachmentSummary) ──────
	// Populated from BatchSummaryUpdatedEvent — fields added from Service 5C.
	ExactMatchCount     int     `json:"exact_match_count"`      // MATCH_EXACT attachment count
	HighConfidenceCount int     `json:"high_confidence_count"`  // MATCH_HIGH attachment count
	AmbiguousCount      int     `json:"ambiguous_count"`        // MATCH_AMBIGUOUS count
	UnresolvedCount     int     `json:"unresolved_count"`       // MATCH_UNRESOLVED count
	ConflictedCount     int     `json:"conflicted_count"`       // conflicted signals count
	AggregateScore      float64 `json:"aggregate_score"`        // Service 5C overall attachment quality score

	// ── Status ───────────────────────────────────────────────────────────
	// Mirrors batch_contracts.batch_finality_status for API consistency.
	FinalityStatus string `json:"finality_status"` // "PROCESSING" | "FULLY_SETTLED" | "PARTIALLY_SETTLED" | etc.

	UpdatedAt time.Time `json:"updated_at"`
}

// ── New KPI Projection Value Types ───────────────────────────────────────────
// These structs support the remaining 14 implementable KPIs.
// Each maps to one or more atomic repo methods and is stored in projection_state.value_json.
// =============================================================================

// RCASummaryValue is stored in ProjectionState.ValueJSON
// for projection_key "rca.summary" at TENANT scope.
//
// Accumulates settlement quality signals used for R4/R5/R6/R8:
//   R4 — parser_weakness_rate:      weak parse confidence ratio
//   R5 — mapping_weakness_rate:     weak mapping confidence ratio
//   R6 — source_system_defect_rate: per-source-system defect breakdown
//   R8 — rca_concentration:         Herfindahl index of cluster amounts (written by RCA service)
//
// Projection key: "rca.summary"
// Entity scope:   TENANT
type RCASummaryValue struct {
	// ── R4: Parser weakness ──────────────────────────────────────────────
	// A settlement is "weak parse" when ParseConfidence < 0.70.
	// Threshold 0.70 is the same weakestCohortSignal threshold used in A5.
	WeakParseCount     int     `json:"weak_parse_count"`     // settlements with parse_confidence < 0.70
	TotalSettlements   int     `json:"total_settlements"`    // all canonical settlement events seen
	ParserWeaknessRate float64 `json:"parser_weakness_rate"` // R4 derived: weak_parse_count / total_settlements

	// ── R5: Mapping weakness ─────────────────────────────────────────────
	// A settlement is "weak mapping" when MappingConfidence < 0.70.
	WeakMappingCount    int     `json:"weak_mapping_count"`    // settlements with mapping_confidence < 0.70
	MappingWeaknessRate float64 `json:"mapping_weakness_rate"` // R5 derived: weak_mapping_count / total_settlements

	// ── R6: Source system defect rate ────────────────────────────────────
	// Per-source-system breakdown of parse + mapping weakness.
	// Map key: source_system_id string. Map value: per-system stats.
	// Overall rate = sum(defects across all systems) / sum(totals across all systems).
	SourceSystemDefects    map[string]SourceSystemDefectStat `json:"source_system_defects"`     // per-system stats
	SourceSystemDefectRate float64                           `json:"source_system_defect_rate"` // R6 derived overall rate

	// ── R8: RCA concentration (Herfindahl index) ─────────────────────────
	// Written by RCAIntelligenceService.ComputeAndSaveGradeA after clustering.
	// Formula: sum( (cluster_amount / total_affected_amount)^2 ) — measures
	// how concentrated failures are into a single root cause cluster.
	// 1.0 = all failures have one root cause; 0.0 = perfectly distributed.
	RCAConcentration float64 `json:"rca_concentration"` // R8: Herfindahl concentration index

	UpdatedAt time.Time `json:"updated_at"`
}

// SourceSystemDefectStat holds per-source-system weakness counts for R6.
type SourceSystemDefectStat struct {
	Total       int     `json:"total"`        // total settlement observations from this source
	WeakParse   int     `json:"weak_parse"`   // parse_confidence < 0.70
	WeakMapping int     `json:"weak_mapping"` // mapping_confidence < 0.70
	DefectRate  float64 `json:"defect_rate"`  // (weak_parse + weak_mapping) / (2 * total)
}

// PatternTenantSummaryValue is stored in ProjectionState.ValueJSON
// for projection_key "pattern.tenant_summary" at TENANT scope.
//
// Extends the existing 3-field record (batch_risk_score, proof_readiness_score,
// duplicate_cluster_count) with P2/P6 counters.
//
// Projection key: "pattern.tenant_summary"
// Entity scope:   TENANT
type PatternTenantSummaryValue struct {
	// ── Existing fields (must not be removed) ────────────────────────────
	BatchRiskScore        float64 `json:"batch_risk_score"`        // last batch risk score
	ProofReadinessScore   float64 `json:"proof_readiness_score"`   // last batch settlement ratio
	DuplicateClusterCount int     `json:"duplicate_cluster_count"` // HDBSCAN duplicate clusters found

	// ── P2: Duplicate risk rate ───────────────────────────────────────────
	// Accumulated from IntentCreatedEvent.DuplicateRiskFlag=true.
	// DuplicateRiskRate = DuplicateRiskCount / TotalIntentCount.
	DuplicateRiskCount int     `json:"duplicate_risk_count"` // intents with duplicate_risk_flag=true
	TotalIntentCount   int     `json:"total_intent_count"`   // all intents processed (denominator for P2)
	DuplicateRiskRate  float64 `json:"duplicate_risk_rate"`  // P2 derived: count / total

	// ── P6: Settlement delay p95 ─────────────────────────────────────────
	// Accumulated from VarianceRecordCreatedEvent.SettlementDelayDays.
	// Bounded sample array: stores last min(N, windowSize) delay values so
	// that p95 can be computed exactly by sorting at snapshot time.
	// Array is scoped to the current daily window (resets with window).
	SettlementDelaySamples []int   `json:"settlement_delay_samples"`  // bounded list of delay-day values
	SettlementDelayP95Days float64 `json:"settlement_delay_p95_days"` // P6 derived: 95th percentile
	SettlementDelayP50Days float64 `json:"settlement_delay_p50_days"` // P6 derived: 50th percentile (median)

	// ── Pattern Intelligence extensions ───────────────────────────────────
	// DuplicateRiskAmountMinor: sum of intent amounts where duplicate_risk_flag=true.
	// Previously only the count was tracked (DuplicateRiskCount). The amount is
	// required for the "Review Duplicate-Risk Cluster" recommendation card.
	DuplicateRiskAmountMinor decimal.Decimal `json:"duplicate_risk_amount_minor"`

	// MissingClientRefCount / TotalIntentCount: needed for tenant-level
	// missing_client_ref_rate (complement to per-source tracking in SourceQualityValue).
	MissingClientRefCount int `json:"missing_client_ref_count"`

	// CrossPeriodCount: number of variance records with cross_period_flag=true.
	// Required for cross_period_settlement_rate KPI (Pattern section H).
	CrossPeriodCount int `json:"cross_period_count"`

	UpdatedAt time.Time `json:"updated_at"`
}

// PatternBatchIntentDensityValue is stored in ProjectionState.ValueJSON
// for projection_key "pattern.batch_density.{client_batch_ref}" at BATCH scope.
//
// Used to compute P3 (same_beneficiary_amount_density):
// the fraction of intents in a batch that share their (beneficiary_fingerprint, amount)
// pair with at least one other intent in the same batch.
//
// Map key: "{beneficiary_fingerprint}:{amount_string}"
// Map value: count of intents with that exact pair
//
// Projection key: "pattern.batch_density.{client_batch_ref}"
// Entity scope:   BATCH
type PatternBatchIntentDensityValue struct {
	// Map of "fingerprint:amount" → count of intents with that exact pair.
	// Key is "{beneficiary_fingerprint}:{amount_minor_string}".
	// Built incrementally as IntentCreatedEvents arrive.
	PairCounts map[string]int `json:"pair_counts"` // fingerprint:amount → count

	TotalCount int `json:"total_count"` // total intents in this batch (denominator for P3)

	// ── P3: Derived density (recomputed each update) ──────────────────────
	// MaxPairCount: the highest count for any single (fingerprint, amount) pair.
	// SameBeneficiaryAmountDensity = MaxPairCount / TotalCount.
	// Range: 0.0 (all unique pairs) → 1.0 (all intents share the same pair — perfect payroll).
	MaxPairCount                 int     `json:"max_pair_count"`                  // highest pair count
	SameBeneficiaryAmountDensity float64 `json:"same_beneficiary_amount_density"` // P3 derived

	UpdatedAt time.Time `json:"updated_at"`
}

// ── PATTERN INTELLIGENCE: Multi-Dimensional Projection Value Types ────────────
//
// These five new types back the Pattern Intelligence layer introduced by the
// full Pattern & Recommendation spec. Each is stored in projection_state.value_json
// under its own keyed family so they can be read independently.
//
// Projection key families:
//   pattern.source.{source_system}              → SourceQualityValue
//   pattern.provider.{provider_id}              → ProviderQualityValue
//   pattern.bank.{bank_id}                      → BankQualityValue
//   pattern.ambiguity.source.{source_system}    → AmbiguityBySourceValue
//   pattern.variance.source.{source_system}     → VarianceBySourceValue
//
// ALL MONEY IS IN MINOR UNITS (paise, cents). NEVER float64 for money.
// ─────────────────────────────────────────────────────────────────────────────

// SourceQualityValue tracks per-source-system payment file quality signals.
// Accumulated from IntentCreatedEvent and DLQItemEvent.
//
// Answers: "Which source system is creating weak payment records?"
// Used by Pattern Intelligence section A (source-system traceability patterns)
// and the "Fix Source Export" / "Escalate Source System" recommendation types.
//
// Projection key: "pattern.source.{source_system}"
// Entity scope:   TENANT
type SourceQualityValue struct {
	SourceSystem string `json:"source_system"` // e.g. "tally_branch_a", "sap_vendor_batch"

	// ── Intent volume counters ────────────────────────────────────────────
	TotalIntentCount      int             `json:"total_intent_count"`       // all intents from this source
	TotalIntentAmountMinor decimal.Decimal `json:"total_intent_amount_minor"` // sum of intent amounts

	// ── File quality signals (from IntentCreatedEvent) ────────────────────
	// MissingClientRefCount: intents where client_payout_ref == "".
	// This is the #1 signal for the "Add stronger references" recommendation.
	MissingClientRefCount int `json:"missing_client_ref_count"`
	// LowMatchabilityCount: intents where matchability_score < 0.60.
	// Indicates the source produces records that are hard to match to settlements.
	LowMatchabilityCount int `json:"low_matchability_count"`
	// LowProofReadinessCount: intents where proof_readiness_score < 0.60.
	// Triggers the "Move flow to Prepare-and-Sign" recommendation.
	LowProofReadinessCount int `json:"low_proof_readiness_count"`
	// LowQualityScoreCount: intents where intent_quality_score < 0.60.
	LowQualityScoreCount int `json:"low_quality_score_count"`

	// ── Duplicate risk signals (from IntentCreatedEvent) ──────────────────
	DuplicateRiskCount        int             `json:"duplicate_risk_count"`          // intents with duplicate_risk_flag=true
	DuplicateRiskAmountMinor  decimal.Decimal `json:"duplicate_risk_amount_minor"`   // sum of amounts for risk-flagged intents

	// ── Manual review signals (from DLQItemEvent) ───────────────────────
	// Incremented per-intent when a payment row is routed to human review.
	ManualReviewCount       int             `json:"manual_review_count"`        // intents sent to manual review
	ManualReviewAmountMinor decimal.Decimal `json:"manual_review_amount_minor"` // sum of manual review amounts
	// ReasonBreakdown: reason_code → count of manual review events with that reason.
	// Used to surface the dominant failure reason per source system.
	ReasonBreakdown map[string]int `json:"reason_breakdown"` // reason_code → count

	// ── Batch tracking (approximate unique batches from this source) ─────
	// Incremented when a new batch_ref differs from the last seen one.
	// Approximate because concurrent writes may miss some transitions.
	// Used to populate AffectedBatchCount on recommendation cards.
	BatchCount    int    `json:"batch_count"`
	LastBatchRef  string `json:"last_batch_ref"`

	// ── Derived rates (recomputed after every increment) ─────────────────
	MissingClientRefRate   float64 `json:"missing_client_ref_rate"`   // missing_client_ref_count / total_intent_count
	LowMatchabilityRate    float64 `json:"low_matchability_rate"`     // low_matchability_count / total_intent_count
	LowProofReadinessRate  float64 `json:"low_proof_readiness_rate"`  // low_proof_readiness_count / total_intent_count
	DuplicateRiskRate      float64 `json:"duplicate_risk_rate"`       // duplicate_risk_count / total_intent_count
	ManualReviewRate       float64 `json:"manual_review_rate"`        // manual_review_count / total_intent_count

	UpdatedAt time.Time `json:"updated_at"`
}

// ProviderQualityValue tracks per-PSP/provider settlement quality signals.
// Accumulated from CanonicalSettlementCreatedEvent and AttachmentDecisionCreatedEvent.
//
// Answers: "Which PSP/provider creates uncertainty, delay, or weak references?"
// Used by Pattern Intelligence section B (bank/PSP reliability patterns).
//
// Projection key: "pattern.provider.{provider_id}"
// Entity scope:   TENANT
type ProviderQualityValue struct {
	ProviderID string `json:"provider_id"` // e.g. "razorpay", "payu", "cashfree"

	// ── Settlement volume (from CanonicalSettlementCreatedEvent) ─────────
	TotalSettlementCount        int             `json:"total_settlement_count"`
	TotalSettlementAmountMinor  decimal.Decimal `json:"total_settlement_amount_minor"`

	// ── Parse and mapping quality (running sums for averages) ────────────
	// Stored as sum+count so the average survives incremental updates
	// without storing all historical scores (Welford's online algorithm).
	ParseConfidenceSum   float64 `json:"parse_confidence_sum"`
	ParseConfidenceCount int     `json:"parse_confidence_count"`
	WeakParseCount       int     `json:"weak_parse_count"` // parse_confidence < 0.70

	MappingConfidenceSum   float64 `json:"mapping_confidence_sum"`
	MappingConfidenceCount int     `json:"mapping_confidence_count"`
	WeakMappingCount       int     `json:"weak_mapping_count"` // mapping_confidence < 0.70

	// ── Carrier richness and attachment readiness ─────────────────────────
	CarrierRichnessSum      float64 `json:"carrier_richness_sum"`
	CarrierRichnessCount    int     `json:"carrier_richness_count"`
	AttachmentReadinessSum  float64 `json:"attachment_readiness_sum"`
	AttachmentReadinessCount int    `json:"attachment_readiness_count"`

	// ── Orphan settlements (attachment_readiness < 0.30 and status = SETTLED) ─
	OrphanCount int `json:"orphan_count"`

	// ── Missing reference flags ───────────────────────────────────────────
	// Populated from CanonicalSettlementCreatedEvent carrier fields presence.
	MissingProviderRefCount int `json:"missing_provider_ref_count"` // provider_ref == ""
	MissingClientRefCount   int `json:"missing_client_ref_count"`   // client_ref == ""

	// ── Ambiguity signals (from AttachmentDecisionCreatedEvent) ──────────
	TotalDecisions        int `json:"total_decisions"`         // all decisions for this provider's settlements
	AmbiguousDecisions    int `json:"ambiguous_decisions"`     // MATCH_AMBIGUOUS decisions
	UnresolvedDecisions   int `json:"unresolved_decisions"`    // MATCH_UNRESOLVED decisions

	// ── A9: Successful decisions (from AttachmentDecisionCreatedEvent) ───
	// ambiguity_score <= 0.30 && candidate_set_size <= 1 && settled == intended
	SuccessfulDecisionCount int `json:"successful_decision_count"`

	// ── Settlement delay samples (from VarianceRecordCreatedEvent) ────────
	// Bounded array: stores last 500 delay-day values for p50/p95 computation.
	// Bounded to prevent unbounded memory growth in high-volume tenants.
	SettlementDelaySamples []int `json:"settlement_delay_samples"`

	// ── Derived rates (recomputed after every increment) ─────────────────
	AvgParseConfidence      float64 `json:"avg_parse_confidence"`
	AvgMappingConfidence    float64 `json:"avg_mapping_confidence"`
	AvgCarrierRichness      float64 `json:"avg_carrier_richness"`
	AvgAttachmentReadiness  float64 `json:"avg_attachment_readiness"`
	OrphanRate              float64 `json:"orphan_rate"`               // orphan_count / total_settlement_count
	AmbiguityRate           float64 `json:"ambiguity_rate"`            // ambiguous_decisions / total_decisions
	DecisionSuccessRate     float64 `json:"decision_success_rate"`     // successful_decision_count / total_decisions
	SettlementDelayP95Days  float64 `json:"settlement_delay_p95_days"` // 95th percentile of delay samples
	SettlementDelayP50Days  float64 `json:"settlement_delay_p50_days"` // 50th percentile of delay samples

	UpdatedAt time.Time `json:"updated_at"`
}

// BankQualityValue tracks per-bank settlement quality and timing signals.
// Accumulated from CanonicalSettlementCreatedEvent.
//
// Answers: "Which bank settles late or omits references?"
// Complements ProviderQualityValue — a bank and a PSP are different dimensions.
// (e.g. Razorpay PSP, HDFC bank, IMPS rail are three orthogonal groupings.)
//
// Projection key: "pattern.bank.{bank_id}"
// Entity scope:   TENANT
type BankQualityValue struct {
	BankID string `json:"bank_id"` // e.g. "HDFC", "ICICI", "SBI"

	TotalSettlementCount int `json:"total_settlement_count"`

	// ── Reference completeness ────────────────────────────────────────────
	MissingBankRefCount int `json:"missing_bank_ref_count"` // bank_ref == ""
	MissingUTRCount     int `json:"missing_utr_count"`      // utr == ""

	// ── Settlement delay samples (bounded array, max 500 entries) ────────
	SettlementDelaySamples []int `json:"settlement_delay_samples"`

	// ── Derived rates ─────────────────────────────────────────────────────
	MissingBankRefRate      float64 `json:"missing_bank_ref_rate"`       // missing_bank_ref_count / total_settlement_count
	SettlementDelayP95Days  float64 `json:"settlement_delay_p95_days"`
	SettlementDelayP50Days  float64 `json:"settlement_delay_p50_days"`

	UpdatedAt time.Time `json:"updated_at"`
}

// AmbiguityBySourceValue tracks per-source-system ambiguity signals.
// Accumulated from AttachmentDecisionCreatedEvent.SourceSystem (new field).
//
// Answers: "Which source system is repeatedly producing ambiguous attachments?"
// Used by Pattern Intelligence section C (ambiguity pattern intelligence).
//
// Projection key: "pattern.ambiguity.source.{source_system}"
// Entity scope:   TENANT
type AmbiguityBySourceValue struct {
	SourceSystem string `json:"source_system"`

	// ── Decision counters ─────────────────────────────────────────────────
	TotalDecisions    int `json:"total_decisions"`     // all attachment decisions for this source's intents
	AmbiguousCount    int `json:"ambiguous_count"`     // MATCH_AMBIGUOUS decisions
	UnresolvedCount   int `json:"unresolved_count"`    // MATCH_UNRESOLVED decisions
	LowConfidenceCount int `json:"low_confidence_count"` // confidence_score < 0.70

	// ── Candidate set collision ───────────────────────────────────────────
	// Collision = decision where candidate_set_size > 1 (multiple possible intents matched).
	CollisionCount        int `json:"collision_count"`          // decisions where candidate_set_size > 1
	CandidateSetSizeSum   int `json:"candidate_set_size_sum"`   // running sum for average

	// ── Value at risk ─────────────────────────────────────────────────────
	// Sum of intended_amount_minor for MATCH_AMBIGUOUS and MATCH_UNRESOLVED decisions.
	ValueAtRiskMinor decimal.Decimal `json:"value_at_risk_minor"`

	// ── Derived rates (recomputed after every increment) ─────────────────
	AmbiguityRate      float64 `json:"ambiguity_rate"`       // ambiguous_count / total_decisions
	CollisionRate      float64 `json:"collision_rate"`       // collision_count / total_decisions
	LowConfidenceRate  float64 `json:"low_confidence_rate"`  // low_confidence_count / total_decisions
	AvgCandidateSetSize float64 `json:"avg_candidate_set_size"` // candidate_set_size_sum / total_decisions

	UpdatedAt time.Time `json:"updated_at"`
}

// VarianceBySourceValue tracks per-source-system variance and deduction signals.
// Accumulated from VarianceRecordCreatedEvent.SourceSystem (new field).
//
// Answers: "Which source system drives unexplained settlement gaps?"
// Used by Pattern Intelligence section D (leakage/variance pattern intelligence).
//
// Projection key: "pattern.variance.source.{source_system}"
// Entity scope:   TENANT
type VarianceBySourceValue struct {
	SourceSystem string `json:"source_system"`

	// ── Variance counters ─────────────────────────────────────────────────
	TotalVarianceCount      int             `json:"total_variance_count"`
	TotalVarianceAmountMinor decimal.Decimal `json:"total_variance_amount_minor"` // sum of all variance_amount_minor

	// ── Explained vs unexplained split ───────────────────────────────────
	// Whitelisted = pre-agreed fee/TDS/commission deduction (expected, not leakage).
	// Unwhitelisted = potentially unexplained loss that requires investigation.
	WhitelistedVarianceCount   int             `json:"whitelisted_variance_count"`
	WhitelistedVarianceMinor   decimal.Decimal `json:"whitelisted_variance_minor"`   // legitimate deductions
	UnexplainedVarianceCount   int             `json:"unexplained_variance_count"`
	UnexplainedVarianceMinor   decimal.Decimal `json:"unexplained_variance_minor"`   // real leakage candidates

	// ── Reference quality flags (from VarianceRecordCreatedEvent) ─────────
	MissingProviderRefCount int `json:"missing_provider_ref_count"` // provider_ref_missing_flag=true
	MissingBankRefCount     int `json:"missing_bank_ref_count"`     // bank_ref_missing_flag=true

	// ── Timing flags ─────────────────────────────────────────────────────
	CrossPeriodCount int `json:"cross_period_count"` // cross_period_flag=true

	// ── Fee variance (legitimate PSP fee component) ───────────────────────
	// Tracking fee_variance separately lets ZPI differentiate "expected PSP fee"
	// from "genuinely unexplained deduction" — avoids false leakage alerts.
	FeeVarianceTotalMinor decimal.Decimal `json:"fee_variance_total_minor"` // sum of fee_variance

	// ── Variance by type breakdown ────────────────────────────────────────
	// Key: variance_type string (e.g. "UNDER_SETTLEMENT", "DEDUCTION", "REVERSAL")
	// Value: cumulative minor-unit amount for that type from this source system.
	BreakdownByType map[string]decimal.Decimal `json:"breakdown_by_type"`

	// ── Derived rates ─────────────────────────────────────────────────────
	UnexplainedVarianceRate    float64 `json:"unexplained_variance_rate"`    // unexplained_amount / total_intended (needs cross-ref with SourceQualityValue)
	MissingProviderRefRate     float64 `json:"missing_provider_ref_rate"`    // missing_provider_ref_count / total_variance_count
	MissingBankRefRate         float64 `json:"missing_bank_ref_rate"`        // missing_bank_ref_count / total_variance_count

	UpdatedAt time.Time `json:"updated_at"`
}

// ── Extensions to existing projection value types ────────────────────────────
// The following additions extend LeakageValue and PatternTenantSummaryValue
// with fields required by Pattern Intelligence.
// These are stored in the same projection_state rows as before —
// the JSONB column accepts the extra keys transparently.

// LeakageValueExtension documents new fields added to LeakageValue for
// Pattern Intelligence. These are embedded directly in LeakageValue above;
// this comment block serves as the authoritative change record.
//
// New fields:
//   WhitelistedDeductionAmountMinor decimal.Decimal — sum of all whitelisted variance amounts.
//     Required for the "Update Variance Policy" recommendation: separates legitimate
//     PSP fees from real unexplained leakage so the dashboard does not raise false alerts.
//   OverSettlementAmountMinor decimal.Decimal — sum of OVER_SETTLEMENT variance amounts.
//     Previously skipped entirely. Tracked for the "over-settlement pattern" detection.
