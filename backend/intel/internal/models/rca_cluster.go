package models

// rca_cluster.go — domain types and taxonomy for the RCA HDBSCAN clustering pipeline.
//
// RCAFragment accumulates signals per payment intent as events arrive.
// RCATaxonomy is the authoritative 32-cluster Zord RCA library v1, mirroring
// the Python TAXONOMY dict in app/models/rca_hdbscan.py.

// RCAFragment holds all signals accumulated for one payment intent across
// multiple event types (settlement, attachment, variance, intent, evidence).
// Stored in projection_state under key: rca.frag.{batch_id}.{intent_id}
type RCAFragment struct {
	IntentID    string `json:"intent_id"`
	BatchID     string `json:"batch_id"`
	ReasonText  string `json:"reason_text"`

	// Amounts
	IntendedAmountMinor int64 `json:"intended_amount_minor"`
	SettledAmountMinor  int64 `json:"settled_amount_minor"`
	AmountVariorMinor   int64 `json:"amount_variance_minor"`

	// Categorical signals
	SourceStrengthClass string `json:"source_strength_class"`
	ObservationKind     string `json:"observation_kind"`
	DecisionType        string `json:"decision_type"`
	GovernanceState     string `json:"governance_state"`

	// Numeric signals — Service 5B
	ParseConfidence      float64 `json:"parse_confidence"`
	MappingConfidence    float64 `json:"mapping_confidence"`
	CarrierRichnessScore float64 `json:"carrier_richness_score"`
	AttachmentReadiness  float64 `json:"attachment_readiness_score"`

	// Numeric signals — Service 5C
	AmbiguityScore  float64 `json:"ambiguity_score"`
	ConfidenceScore float64 `json:"confidence_score"`
	CandidateCount  int     `json:"candidate_count"`

	// Numeric signals — Service 2
	ProofReadinessScore float64 `json:"proof_readiness_score"`
	MatchabilityScore   float64 `json:"matchability_score"`

	// Numeric signals — Service 6
	PackCompletenessScore float64 `json:"pack_completeness_score"`
	MissingLeafCount      int     `json:"missing_leaf_count"`

	// Derived numeric
	SettlementDelayDays int `json:"settlement_delay_days"`

	// Binary flags
	MissingClientRef      bool `json:"missing_client_ref"`
	MissingProviderRef    bool `json:"missing_provider_ref"`
	MissingBankRef        bool `json:"missing_bank_ref"`
	ReversalFlag          bool `json:"reversal_flag"`
	ReturnFlag            bool `json:"return_flag"`
	DuplicateRowDetected  bool `json:"duplicate_row_detected"`
	ValueDateMismatch     bool `json:"value_date_mismatch_flag"`
	CrossPeriodFlag       bool `json:"cross_period_flag"`
	DuplicateRiskFlag     bool `json:"duplicate_risk_flag"`
	MissingEvidencePack   bool `json:"missing_evidence_pack"`
	GovernanceLeafMissing bool `json:"governance_leaf_missing"`
	IdempotencyKeyMissing bool `json:"idempotency_key_missing"`

	// Batch-level aggregate signals (denormalised at cluster-trigger time)
	WeakBatchRefFlag bool `json:"weak_batch_ref_flag"`
}

// RCATaxonomyEntry is the full spec definition for one RCA cluster code.
type RCATaxonomyEntry struct {
	Code                  string
	Label                 string // cluster_name
	Category              string
	Severity              string
	BusinessImpact        string
	UserExplanation       string
	RecommendedAction     string
	DefaultActionContract string
	TriggerCondition      string
	IntelligenceLayer     string
	InternalOnly          bool
}

// LookupCluster returns the taxonomy entry for a cluster code.
// ok is false when code is not in the taxonomy (e.g. "UNCLASSIFIED").
func LookupCluster(code string) (RCATaxonomyEntry, bool) {
	e, ok := RCATaxonomy[code]
	return e, ok
}

// RCATaxonomy is the authoritative Zord RCA Cluster Library v1 (32 clusters).
// Must stay in sync with Python TAXONOMY dict in app/models/rca_hdbscan.py.
var RCATaxonomy = map[string]RCATaxonomyEntry{
	// ── 1. Reference / Traceability ──────────────────────────────────────────
	"MCR": {
		Code:     "MCR",
		Label:    "MISSING_CLIENT_REFERENCE",
		Category: "REFERENCE_TRACEABILITY",
		Severity: "HIGH",
		BusinessImpact: "Without client reference, finance/ops cannot easily prove which original " +
			"payout the settlement row belongs to. Increases manual review, ambiguity, and weak auditability.",
		UserExplanation: "This settlement record is missing your internal payout reference. " +
			"Zord cannot confidently link it back to the original payout intent using your own business ID.",
		RecommendedAction: "Ensure client_payout_ref is passed into PSP requests and preserved in settlement exports. " +
			"For high-value or recurring batches, move this flow to Zord Prepare-and-Sign.",
		DefaultActionContract: "REQUEST_SOURCE_PATCH",
		TriggerCondition:      "client_reference_candidate IS NULL AND attachment_readiness_score < 0.50 AND carrier_richness_score < 0.40",
		IntelligenceLayer:     "AMBIGUITY + EVIDENCE",
		InternalOnly:          false,
	},
	"MPR": {
		Code:     "MPR",
		Label:    "MISSING_PROVIDER_REFERENCE",
		Category: "REFERENCE_TRACEABILITY",
		Severity: "HIGH",
		BusinessImpact: "Provider-side investigation becomes harder because the record cannot be " +
			"traced cleanly inside the PSP/export system.",
		UserExplanation: "This settlement record does not contain the PSP reference. " +
			"If a dispute or support escalation happens, your team may not have a clean PSP-side handle to investigate it.",
		RecommendedAction:     "Ask PSP/export system to include payout/transfer/reference ID. Add provider reference as a required field in the settlement mapping profile.",
		DefaultActionContract: "REQUEST_SOURCE_PATCH",
		TriggerCondition:      "provider_reference IS NULL AND source_strength_class IN ('PSP_REPORT', 'INTERNAL_EXPORT')",
		IntelligenceLayer:     "AMBIGUITY + RCA",
		InternalOnly:          false,
	},
	"MBR": {
		Code:              "MBR",
		Label:             "MISSING_BANK_REFERENCE",
		Category:          "REFERENCE_TRACEABILITY",
		Severity:          "HIGH",
		BusinessImpact:    "Audit and final settlement defensibility weaken because bank-side proof is usually stronger than PSP-only status.",
		UserExplanation:   "This record does not contain a bank-side reference such as UTR/RRN. It may be harder to prove settlement using bank evidence.",
		RecommendedAction: "Require bank reference in settlement/statement ingestion. If bank reference is delayed, mark the payment as evidence-pending.",
		DefaultActionContract: "GENERATE_EVIDENCE",
		TriggerCondition:  "bank_reference IS NULL AND observation_kind IN ('SETTLEMENT', 'STATEMENT_ENTRY')",
		IntelligenceLayer: "EVIDENCE + AUDIT",
		InternalOnly:      false,
	},
	"WBR": {
		Code:              "WBR",
		Label:             "WEAK_BATCH_REFERENCE",
		Category:          "REFERENCE_TRACEABILITY",
		Severity:          "HIGH",
		BusinessImpact:    "The whole batch becomes costly to investigate. Enterprises think in batches and batch-level status matters for ERP/finance workflows.",
		UserExplanation:   "This batch has weak reference quality. Many settlement records do not carry enough identifiers to confidently connect them to original payout intents.",
		RecommendedAction: "Patch source system batch template. Require client ref / provider ref fields. Use Zord Prepare-and-Sign for this batch family.",
		DefaultActionContract: "REVIEW_BATCH",
		TriggerCondition:  "missing_client_ref_rate > 0.30 OR carrier_completeness_rate < 0.70 OR avg_attachment_readiness_score < 0.60",
		IntelligenceLayer: "PATTERN",
		InternalOnly:      false,
	},
	"RFC": {
		Code:              "RFC",
		Label:             "REFERENCE_CONFLICT",
		Category:          "REFERENCE_TRACEABILITY",
		Severity:          "CRITICAL",
		BusinessImpact:    "Can create false confirmation, duplicate settlement interpretation, or wrong payout evidence.",
		UserExplanation:   "Zord found the same reference being claimed by more than one payment record. This creates a conflict and cannot be treated as cleanly matched.",
		RecommendedAction: "Hold affected records for review. Check duplicate source rows or PSP export duplication. Strengthen idempotency/reference generation.",
		DefaultActionContract: "REVIEW_AMBIGUOUS_BATCH",
		TriggerCondition:  "reference_collision_count > 1 OR decision_type = 'MATCH_CONFLICTED'",
		IntelligenceLayer: "AMBIGUITY + LEAKAGE",
		InternalOnly:      false,
	},
	// ── 2. Settlement / Variance ──────────────────────────────────────────────
	"UIN": {
		Code:              "UIN",
		Label:             "UNMATCHED_INTENT",
		Category:          "SETTLEMENT_VARIANCE",
		Severity:          "HIGH",
		BusinessImpact:    "This becomes value-at-risk. The business intended to pay, but Zord cannot observe enough settlement evidence.",
		UserExplanation:   "This payout intent exists, but Zord has not found a matching settlement record within the expected window.",
		RecommendedAction: "Trigger settlement backfill. Ask PSP/bank for updated report. If in dispatch mode, trigger poll/status recovery, not blind replay.",
		DefaultActionContract: "PREPARE_BACKFILL",
		TriggerCondition:  "decision_type IN ('MATCH_UNRESOLVED') OR no settlement_observation_id after settlement_window",
		IntelligenceLayer: "LEAKAGE",
		InternalOnly:      false,
	},
	"ORS": {
		Code:              "ORS",
		Label:             "ORPHAN_SETTLEMENT",
		Category:          "SETTLEMENT_VARIANCE",
		Severity:          "HIGH",
		BusinessImpact:    "Money appears in settlement data but cannot be explained against known intents. Dangerous for audit and finance close.",
		UserExplanation:   "Zord found a settlement record that does not link to any known payout intent.",
		RecommendedAction: "Check if payout was generated outside Zord. Check whether the intent file was incomplete. Review PSP/source-system export.",
		DefaultActionContract: "ESCALATE_TO_FINANCE",
		TriggerCondition:  "settlement_observation_id EXISTS AND attachment_decision.intent_id IS NULL AND decision_type = 'MATCH_UNRESOLVED'",
		IntelligenceLayer: "LEAKAGE + EVIDENCE",
		InternalOnly:      false,
	},
	"USL": {
		Code:              "USL",
		Label:             "UNDER_SETTLEMENT",
		Category:          "SETTLEMENT_VARIANCE",
		Severity:          "HIGH",
		BusinessImpact:    "Potential money leakage or unaccounted deduction.",
		UserExplanation:   "The amount settled is lower than the intended payout amount beyond the allowed tolerance.",
		RecommendedAction: "Check PSP fee/deduction policy. Verify whether deduction is expected. Escalate unexplained variance.",
		DefaultActionContract: "ESCALATE_TO_FINANCE",
		TriggerCondition:  "amount_variance_minor < 0 AND ABS(amount_variance_minor) > allowed_tolerance AND variance_reason NOT IN allowed_deduction_policy",
		IntelligenceLayer: "LEAKAGE",
		InternalOnly:      false,
	},
	"OSL": {
		Code:              "OSL",
		Label:             "OVER_SETTLEMENT",
		Category:          "SETTLEMENT_VARIANCE",
		Severity:          "MEDIUM",
		BusinessImpact:    "Potential overpayment, duplicate correction, or settlement aggregation issue.",
		UserExplanation:   "The settled amount is higher than the intended payout amount. This may indicate overpayment or file aggregation mismatch.",
		RecommendedAction: "Review settlement row grouping. Check if the settlement row aggregates multiple payouts. Confirm no duplicate payout occurred.",
		DefaultActionContract: "REVIEW_BATCH",
		TriggerCondition:  "amount_variance_minor > allowed_tolerance_minor",
		IntelligenceLayer: "LEAKAGE",
		InternalOnly:      false,
	},
	"FDV": {
		Code:              "FDV",
		Label:             "FEE_DEDUCTION_VARIANCE",
		Category:          "SETTLEMENT_VARIANCE",
		Severity:          "MEDIUM",
		BusinessImpact:    "Not always leakage. Valuable because Zord separates legitimate deductions from unexplained leakage.",
		UserExplanation:   "The difference appears to match a fee or deduction pattern. Zord has separated this from unexplained leakage.",
		RecommendedAction: "Confirm deduction policy. Add expected fee rule if this is recurring and legitimate. Flag if fee exceeds expected range.",
		DefaultActionContract: "UPDATE_POLICY_RULE",
		TriggerCondition:  "ABS(amount_variance_minor) <= expected_fee_range OR deduction_amount_minor IS NOT NULL",
		IntelligenceLayer: "LEAKAGE + RCA",
		InternalOnly:      false,
	},
	"VDM": {
		Code:              "VDM",
		Label:             "VALUE_DATE_MISMATCH",
		Category:          "SETTLEMENT_VARIANCE",
		Severity:          "MEDIUM",
		BusinessImpact:    "Creates finance close and ERP clearing problems. Month-end SAP/ERP cases where instruction date and bank settlement date differ.",
		UserExplanation:   "This payout was instructed in one date period but settled on another date. Finance may need to adjust posting or clearing records.",
		RecommendedAction: "Surface in finance close report. Adjust posting period if required. Track route/cutoff patterns causing mismatch.",
		DefaultActionContract: "ESCALATE_TO_FINANCE",
		TriggerCondition:  "value_date_mismatch_flag = true",
		IntelligenceLayer: "AMBIGUITY + PATTERN",
		InternalOnly:      false,
	},
	"CPS": {
		Code:              "CPS",
		Label:             "CROSS_PERIOD_SETTLEMENT",
		Category:          "SETTLEMENT_VARIANCE",
		Severity:          "LOW",
		BusinessImpact:    "Creates accounting close, SAP/ERP clearing, and month-end reconciliation burden.",
		UserExplanation:   "This payout settled in a different accounting period from when it was instructed.",
		RecommendedAction: "Include in month-end close exception report. Adjust finance posting period.",
		DefaultActionContract: "ESCALATE_TO_FINANCE",
		TriggerCondition:  "cross_period_flag = true",
		IntelligenceLayer: "PATTERN + RCA",
		InternalOnly:      false,
	},
	// ── 3. Data Quality ───────────────────────────────────────────────────────
	"LPC": {
		Code:              "LPC",
		Label:             "LOW_PARSE_CONFIDENCE",
		Category:          "DATA_QUALITY",
		Severity:          "MEDIUM",
		BusinessImpact:    "Parser failures should not be misread as missing bank confirmation. Some records may be unreliable.",
		UserExplanation:   "Zord could not confidently parse parts of this file. Some records may need reprocessing or mapping correction before they can be trusted.",
		RecommendedAction: "Reprocess with corrected parser/mapping profile. Ask client to confirm latest file format. Open schema review.",
		DefaultActionContract: "REPROCESS_WITH_NEW_PROFILE",
		TriggerCondition:  "parse_confidence < 0.70 OR parse_success_rate < configured_threshold",
		IntelligenceLayer: "AMBIGUITY + RCA",
		InternalOnly:      false,
	},
	"LMC": {
		Code:              "LMC",
		Label:             "LOW_MAPPING_CONFIDENCE",
		Category:          "DATA_QUALITY",
		Severity:          "MEDIUM",
		BusinessImpact:    "Data may be parsed but semantically unreliable. Can create poor attachment, wrong RCA, and weak intelligence.",
		UserExplanation:   "Zord could read the file, but some columns could not be confidently mapped to payment fields.",
		RecommendedAction: "Update mapping profile. Ask client/source system to stabilize headers. Mark affected rows as low-confidence.",
		DefaultActionContract: "FIX_MAPPING_PROFILE",
		TriggerCondition:  "mapping_confidence < 0.70 OR required_field_gap_count > 0",
		IntelligenceLayer: "AMBIGUITY + RCA",
		InternalOnly:      false,
	},
	"MRF": {
		Code:              "MRF",
		Label:             "MISSING_REQUIRED_FIELD",
		Category:          "DATA_QUALITY",
		Severity:          "HIGH",
		BusinessImpact:    "Missing amount, currency, status, timestamp, or reference basis can prevent clean attachment and evidence.",
		UserExplanation:   "This file is missing fields required to create a reliable payment record.",
		RecommendedAction: "Reject affected rows to review/DLQ. Patch source file template. Define tenant-specific mapping rule if field exists under another name.",
		DefaultActionContract: "REQUEST_SOURCE_PATCH",
		TriggerCondition:  "required_field_gap_count > 0 OR any required canonical field is NULL",
		IntelligenceLayer: "AMBIGUITY",
		InternalOnly:      false,
	},
	"DRF": {
		Code:              "DRF",
		Label:             "DUPLICATE_ROW_IN_FILE",
		Category:          "DATA_QUALITY",
		Severity:          "CRITICAL",
		BusinessImpact:    "Can create double counting in leakage, settlement totals, or attachment decisions if not isolated.",
		UserExplanation:   "This file appears to contain duplicate rows. Zord has isolated them to prevent double counting.",
		RecommendedAction: "Review duplicate rows. Confirm whether the source export duplicated transactions. Keep only one active canonical observation per duplicate group.",
		DefaultActionContract: "REVIEW_BATCH",
		TriggerCondition:  "duplicate_row_detected = true OR raw_line_hash duplicates within same ingest_run_id",
		IntelligenceLayer: "LEAKAGE + PATTERN",
		InternalOnly:      false,
	},
	"SDD": {
		Code:              "SDD",
		Label:             "SCHEMA_DRIFT_DETECTED",
		Category:          "DATA_QUALITY",
		Severity:          "HIGH",
		BusinessImpact:    "Schema drift can silently break parsing and matching. Tells the client their export format changed.",
		UserExplanation:   "The file format has changed compared to the expected schema. This may affect parsing, matching, and evidence quality.",
		RecommendedAction: "Review new file format. Create or update mapping profile. Reprocess after mapping fix.",
		DefaultActionContract: "FIX_MAPPING_PROFILE",
		TriggerCondition:  "unexpected_column_count > threshold OR required_headers_missing OR mapping_profile_version mismatch",
		IntelligenceLayer: "PATTERN + RCA",
		InternalOnly:      false,
	},
	// ── 4. Payment Lifecycle ──────────────────────────────────────────────────
	"FPO": {
		Code:              "FPO",
		Label:             "FAILED_PAYOUT",
		Category:          "PAYMENT_LIFECYCLE",
		Severity:          "HIGH",
		BusinessImpact:    "Failure requires ops action and may affect seller/vendor/customer trust.",
		UserExplanation:   "This payout is marked as failed by the provider or settlement file.",
		RecommendedAction: "Show normalized failure reason. Recommend correction based on RCA taxonomy. If dispatch mode: evaluate replay eligibility, not blind retry.",
		DefaultActionContract: "ESCALATE_TO_OPS",
		TriggerCondition:  "settlement_status = 'FAILED' OR provider_status_code IN failure_code_map",
		IntelligenceLayer: "RCA",
		InternalOnly:      false,
	},
	"RAS": {
		Code:              "RAS",
		Label:             "REVERSED_AFTER_SUCCESS",
		Category:          "PAYMENT_LIFECYCLE",
		Severity:          "CRITICAL",
		BusinessImpact:    "Payment previously observed as successful is later reversed. Finance must treat this as a post-settlement exception.",
		UserExplanation:   "This payout was initially successful but later reversed. Finance should treat this as a post-settlement exception.",
		RecommendedAction: "Generate updated evidence pack. Notify finance. Mark batch status as reversed partial if applicable.",
		DefaultActionContract: "GENERATE_EVIDENCE",
		TriggerCondition:  "reversal_flag = true OR final_state transitions SUCCESS → REVERSED_AFTER_SUCCESS",
		IntelligenceLayer: "LEAKAGE + EVIDENCE",
		InternalOnly:      false,
	},
	"RPO": {
		Code:              "RPO",
		Label:             "RETURNED_PAYOUT",
		Category:          "PAYMENT_LIFECYCLE",
		Severity:          "HIGH",
		BusinessImpact:    "Often requires beneficiary detail correction and safe replay/re-initiation logic.",
		UserExplanation:   "This payout was returned by the bank or downstream payment system.",
		RecommendedAction: "Review beneficiary details. Do not replay until return reason is understood. If dispatch mode: evaluate replay eligibility.",
		DefaultActionContract: "ESCALATE_TO_OPS",
		TriggerCondition:  "return_flag = true OR return_code IS NOT NULL",
		IntelligenceLayer: "RCA + LEAKAGE",
		InternalOnly:      false,
	},
	"PBS": {
		Code:              "PBS",
		Label:             "PENDING_BEYOND_SLA",
		Category:          "PAYMENT_LIFECYCLE",
		Severity:          "HIGH",
		BusinessImpact:    "Payment has not reached expected settlement within configured SLA/window. Becomes value-at-risk the longer it stays unresolved.",
		UserExplanation:   "This payout has remained unresolved beyond the expected settlement window.",
		RecommendedAction: "Trigger statement/PSP backfill. Escalate if high-value. If dispatch mode: poll provider before replay.",
		DefaultActionContract: "PREPARE_BACKFILL",
		TriggerCondition:  "current_time - intended_execution_at > expected_settlement_window AND decision_type IN ('MATCH_UNRESOLVED', NULL)",
		IntelligenceLayer: "AMBIGUITY + PATTERN",
		InternalOnly:      false,
	},
	"DUC": {
		Code:              "DUC",
		Label:             "DISPATCH_UNCERTAIN",
		Category:          "PAYMENT_LIFECYCLE",
		Severity:          "CRITICAL",
		BusinessImpact:    "Blind replay may cause duplicate payout. Zord cannot prove whether the provider accepted the dispatch attempt.",
		UserExplanation:   "Zord cannot yet prove whether the provider accepted this dispatch attempt. The payout must not be blindly replayed until acceptance status is recovered.",
		RecommendedAction: "Query provider by idempotency key/reference. Run status recovery. Hold replay until eligibility is known.",
		DefaultActionContract: "HOLD",
		TriggerCondition:  "dispatch_state = 'ATTEMPT_UNCERTAIN' OR dispatch_status = 'UNCERTAIN'",
		IntelligenceLayer: "AMBIGUITY + RCA",
		InternalOnly:      false,
	},
	// ── 5. Batch / System Quality ─────────────────────────────────────────────
	"HDR": {
		Code:              "HDR",
		Label:             "HIGH_DUPLICATE_RISK",
		Category:          "BATCH_QUALITY",
		Severity:          "CRITICAL",
		BusinessImpact:    "Duplicate payouts are one of the clearest money-risk categories.",
		UserExplanation:   "This batch contains payout instructions that look semantically duplicated.",
		RecommendedAction: "Review duplicate clusters. Enforce stronger business idempotency. Hold high-risk rows if policy enabled.",
		DefaultActionContract: "REVIEW_BATCH",
		TriggerCondition:  "duplicate_risk_rate > 0.02 for normal batches OR > 0.005 for high-value payout batches",
		IntelligenceLayer: "LEAKAGE + PATTERN",
		InternalOnly:      false,
	},
	"LMB": {
		Code:              "LMB",
		Label:             "LOW_MATCHABILITY_BATCH",
		Category:          "BATCH_QUALITY",
		Severity:          "HIGH",
		BusinessImpact:    "Even if payouts succeed, future settlement proof will be expensive and ambiguous.",
		UserExplanation:   "This batch may be difficult to verify later because its payout records do not contain enough strong matching identifiers.",
		RecommendedAction: "Add stronger references before sending. Use Zord Prepare-and-Sign mode.",
		DefaultActionContract: "PREPARE_AND_SIGN_RECOMMENDED",
		TriggerCondition:  "AVG(matchability_score) < 0.50 OR carrier_completeness_rate < 0.70",
		IntelligenceLayer: "PATTERN",
		InternalOnly:      false,
	},
	"LPRB": {
		Code:              "LPRB",
		Label:             "LOW_PROOF_READINESS_BATCH",
		Category:          "BATCH_QUALITY",
		Severity:          "HIGH",
		BusinessImpact:    "If dispute/audit happens, the batch will be harder to defend.",
		UserExplanation:   "This batch has weak proof readiness. If a dispute or audit occurs, the evidence trail may be incomplete.",
		RecommendedAction: "Generate missing evidence packs. Patch missing governance/reference fields. Use Prepare-and-Sign for future batches.",
		DefaultActionContract: "GENERATE_EVIDENCE",
		TriggerCondition:  "AVG(proof_readiness_score) < 0.50 OR pack_completeness_score < 0.70",
		IntelligenceLayer: "EVIDENCE + AUDIT",
		InternalOnly:      false,
	},
	"HAB": {
		Code:              "HAB",
		Label:             "HIGH_AMBIGUITY_BATCH",
		Category:          "BATCH_QUALITY",
		Severity:          "HIGH",
		BusinessImpact:    "Tells the enterprise where money exists in uncertain operational state. Several payouts cannot be confidently connected to settlement evidence.",
		UserExplanation:   "This batch has a high ambiguity rate. Several payouts cannot be confidently connected to settlement evidence.",
		RecommendedAction: "Review affected records. Trigger source patch. Consider Prepare-and-Sign for this payout flow.",
		DefaultActionContract: "REVIEW_AMBIGUOUS_BATCH",
		TriggerCondition:  "ambiguity_rate > configured_threshold OR ambiguous_value_at_risk > configured_amount_threshold",
		IntelligenceLayer: "AMBIGUITY",
		InternalOnly:      false,
	},
	"SSWT": {
		Code:              "SSWT",
		Label:             "SOURCE_SYSTEM_WEAK_TRACEABILITY",
		Category:          "BATCH_QUALITY",
		Severity:          "MEDIUM",
		BusinessImpact:    "Tells management which internal system or PSP export is causing operational cost.",
		UserExplanation:   "Most traceability problems are concentrated in one source system. Fixing this source will reduce ambiguity across future batches.",
		RecommendedAction: "Patch source system export. Add mandatory reference fields. Apply tenant-specific mapping profile update.",
		DefaultActionContract: "REQUEST_SOURCE_PATCH",
		TriggerCondition:  "AVG(matchability_score by source_system) < threshold OR missing_reference_rate by source_system > threshold",
		IntelligenceLayer: "PATTERN + RECOMMENDATION",
		InternalOnly:      false,
	},
	// ── 6. Evidence / Internal Integrity ─────────────────────────────────────
	"MEP": {
		Code:              "MEP",
		Label:             "MISSING_EVIDENCE_PACK",
		Category:          "EVIDENCE_INTEGRITY",
		Severity:          "HIGH",
		BusinessImpact:    "Direct product-quality and audit-readiness issue. Evidence packs slightly fewer than exact matches.",
		UserExplanation:   "This payout is matched, but its evidence pack is not yet generated.",
		RecommendedAction: "Trigger evidence regeneration. Check missing leaf dependencies.",
		DefaultActionContract: "GENERATE_EVIDENCE",
		TriggerCondition:  "evidence_pack_id IS NULL AND decision_type IN ('MATCH_EXACT', 'MATCH_HIGH_CONFIDENCE')",
		IntelligenceLayer: "EVIDENCE + AUDIT",
		InternalOnly:      false,
	},
	"MLE": {
		Code:              "MLE",
		Label:             "MISSING_LEAF_EVIDENCE",
		Category:          "EVIDENCE_INTEGRITY",
		Severity:          "HIGH",
		BusinessImpact:    "Evidence pack exists but one or more required leaf types are missing. Required proof leaves must be deliberate and complete.",
		UserExplanation:   "An evidence pack exists, but some proof components are missing.",
		RecommendedAction: "Regenerate pack after dependencies arrive. Investigate which service failed to emit the required artifact.",
		DefaultActionContract: "GENERATE_EVIDENCE",
		TriggerCondition:  "missing_leaf_types_json IS NOT EMPTY OR pack_completeness_score < 1.0",
		IntelligenceLayer: "EVIDENCE + AUDIT",
		InternalOnly:      false,
	},
	"OGM": {
		Code:              "OGM",
		Label:             "ORPHAN_GOVERNANCE_MISSING",
		Category:          "EVIDENCE_INTEGRITY",
		Severity:          "HIGH",
		BusinessImpact:    "Zord proves what happened but not why it was authorized. Governance decisions must exist in the Evidence Pack.",
		UserExplanation:   "Zord has payment evidence, but the policy decision explaining why this payout was allowed is missing.",
		RecommendedAction: "Ensure Service 2 emits governance decision artifact. Regenerate evidence pack with governance leaf.",
		DefaultActionContract: "GENERATE_EVIDENCE",
		TriggerCondition:  "governance_state IS NULL OR governance_decision_leaf_present_flag = false",
		IntelligenceLayer: "EVIDENCE + AUDIT",
		InternalOnly:      false,
	},
	"IPM": {
		Code:              "IPM",
		Label:             "IDEMPOTENCY_PROTECTION_WEAK",
		Category:          "EVIDENCE_INTEGRITY",
		Severity:          "HIGH",
		BusinessImpact:    "Weak idempotency increases duplicate payout risk and replay risk.",
		UserExplanation:   "This payout does not have strong duplicate-protection identity. If retried or reprocessed, it may create duplicate-risk.",
		RecommendedAction: "Enforce business idempotency key. Use semantic duplicate detection. Review duplicate-risk records.",
		DefaultActionContract: "REVIEW_BATCH",
		TriggerCondition:  "business_idempotency_key IS NULL OR duplicate_risk_flag = true",
		IntelligenceLayer: "LEAKAGE + PATTERN",
		InternalOnly:      false,
	},
	"ARP": {
		Code:              "ARP",
		Label:             "ACTIVE_RUN_REPROCESS_CONFLICT",
		Category:          "EVIDENCE_INTEGRITY",
		Severity:          "CRITICAL",
		BusinessImpact:    "Can double-count settlements or show stale intelligence. Multiple processing runs exist for same settlement batch.",
		UserExplanation:   "Multiple processing runs exist for this batch. Zord has isolated them to prevent double counting.",
		RecommendedAction: "Set latest valid run as active. Exclude superseded runs from projections. Compare old vs new run if needed.",
		DefaultActionContract: "REVIEW_BATCH",
		TriggerCondition:  "count(active_runs for settlement_batch_id) != 1 OR old_run included in Service 7 projections",
		IntelligenceLayer: "PATTERN + EVIDENCE",
		InternalOnly:      true, // internal-only per spec section 8
	},
}
