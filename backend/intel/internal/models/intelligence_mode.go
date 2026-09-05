package models

// intelligence_mode.go
//
// Defines the dual-mode architecture introduced in Phase 6.
//
// WHY TWO MODES?
// ZPI's market entry strategy is:
//   Grade A — Attachment Intelligence Mode (market entry wedge)
//             The customer gives ZPI: payout intents + settlement files.
//             ZPI produces: leakage, ambiguity, defensibility, RCA, pattern intelligence.
//             No dispatch control required. Works with any existing PSP setup.
//
//   Grade B — Full Finality / Control Mode (upgrade path)
//             The customer gives ZPI full dispatch control.
//             ZPI additionally produces: finality-grade success rates, latency
//             histograms, SLA compliance, retry recovery, Outcome Fusion conflict rates.
//             Richer intelligence, tighter operational loop.
//
// COMMERCIAL PRINCIPLE (from spec Section 5):
//   "Compute richly in backend, expose only the contracted intelligence surface
//    in early mode."
//
//   Grade A deployments MUST NOT expose finality-grade intelligence that implies
//   ZPI has dispatch control it does not have. Doing so would:
//     1. Mislead the customer about what ZPI is doing
//     2. Create false confidence in metrics backed by incomplete data
//     3. Undermine the commercial case for upgrading to Grade B
//
// HOW MODE IS DETERMINED:
//   - Config env var INTELLIGENCE_MODE = "GRADE_A" (default) or "GRADE_B"
//   - Default is GRADE_A — conservative, no false implied capabilities
//   - Switching to GRADE_B requires: dispatch topics live, finality certs flowing

import "time"

// IntelligenceMode represents the operating mode of ZPI.
type IntelligenceMode string

const (
	// IntelligenceModeGradeA — Attachment Intelligence Mode.
	// Default market-entry mode. Requires only: intents + settlement files.
	// Produces: leakage, ambiguity, defensibility, RCA, pattern intelligence.
	// Does NOT claim finality-grade dispatch metrics.
	IntelligenceModeGradeA IntelligenceMode = "GRADE_A"

	// IntelligenceModeGradeB — Full Finality / Control Mode.
	// Full dispatch control mode. Requires: real-time dispatch + finality certs.
	// Produces: all of Grade A + finality rates, latency, SLA, retry recovery,
	// Outcome Fusion conflict rates, and stronger finality-grade projections.
	IntelligenceModeGradeB IntelligenceMode = "GRADE_B"
)

// IsGradeB returns true when running in Full Finality / Control Mode.
// Use this to gate Grade B-only intelligence computation and API exposure.
func (m IntelligenceMode) IsGradeB() bool {
	return m == IntelligenceModeGradeB
}

// IsGradeA returns true when running in Attachment Intelligence Mode.
func (m IntelligenceMode) IsGradeA() bool {
	return m == IntelligenceModeGradeA || m == "" // empty = default to Grade A (safe)
}

// Valid returns true if the mode value is one of the two recognised modes.
// Any other value (including empty string) is treated as Grade A (safe default),
// but Valid() lets callers log a warning when an unexpected value is configured.
func (m IntelligenceMode) Valid() bool {
	return m == IntelligenceModeGradeA || m == IntelligenceModeGradeB
}

// String returns a human-readable label for the mode.
func (m IntelligenceMode) String() string {
	switch m {
	case IntelligenceModeGradeA:
		return "Grade A — Attachment Intelligence Mode"
	case IntelligenceModeGradeB:
		return "Grade B — Full Finality / Control Mode"
	default:
		return "Grade A — Attachment Intelligence Mode (default)"
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Intelligence Capability Catalogue
// ──────────────────────────────────────────────────────────────────────────────

// IntelligenceCapability describes one measurable intelligence surface.
// The capability catalogue is the source of truth for what each mode can produce.
type IntelligenceCapability struct {
	ID           string   `json:"id"`            // machine-readable key e.g. "leakage"
	Name         string   `json:"name"`          // human label e.g. "Leakage & Value-at-Risk"
	Description  string   `json:"description"`   // one-sentence summary
	Available    bool     `json:"available"`     // is this available in the current mode?
	RequiredMode string   `json:"required_mode"` // "GRADE_A" | "GRADE_B"
	DataSources  []string `json:"data_sources"`  // upstream events that feed this
}

// ActiveCapabilities returns the intelligence capabilities available in this mode.
// Used by the GET /v1/intelligence/mode endpoint.
func (m IntelligenceMode) ActiveCapabilities() []IntelligenceCapability {
	gradeA := []IntelligenceCapability{
		{
			ID:           "leakage",
			Name:         "Leakage & Value-at-Risk Intelligence",
			Description:  "Money exposure from unmatched intents, under-settlement, orphan settlements, and reversals.",
			Available:    true,
			RequiredMode: "GRADE_A",
			DataSources:  []string{"attachment.decision.created", "variance.record.created", "canonical.settlement.created"},
		},
		{
			ID:           "ambiguity",
			Name:         "Ambiguity / Confidence Intelligence",
			Description:  "Attachment confidence quality, ambiguous intent counts, and value-at-risk from weak carrier references.",
			Available:    true,
			RequiredMode: "GRADE_A",
			DataSources:  []string{"attachment.decision.created"},
		},
		{
			ID:           "defensibility",
			Name:         "Evidence & Defensibility Intelligence",
			Description:  "Evidence pack completeness, governance coverage, audit-ready percentage, and dispute-readiness score.",
			Available:    true,
			RequiredMode: "GRADE_A",
			DataSources:  []string{"evidence.pack.ready", "governance.decision.created"},
		},
		{
			ID:           "rca",
			Name:         "Root Cause Intelligence",
			Description:  "Top failure drivers, parser weakness families, batch template issues, and reversal root causes.",
			Available:    true,
			RequiredMode: "GRADE_A",
			DataSources:  []string{"outcome.event.normalized", "dlq.event", "variance.record.created"},
		},
		{
			ID:           "pattern",
			Name:         "Pattern & Pre-Dispatch Quality Intelligence",
			Description:  "Batch risk scores, duplicate-risk clusters, proof-readiness scores, and source system health signals.",
			Available:    true,
			RequiredMode: "GRADE_A",
			DataSources:  []string{"batch.summary.updated", "canonical.intent.created"},
		},
		{
			ID:           "recommendation",
			Name:         "Recommendation Intelligence",
			Description:  "Ranked actionable next steps synthesised from all other intelligence layers.",
			Available:    true,
			RequiredMode: "GRADE_A",
			DataSources:  []string{"intelligence_snapshots"},
		},
	}

	gradeB := []IntelligenceCapability{
		{
			ID:           "finality_rate",
			Name:         "Finality Success Rate",
			Description:  "Real-time corridor success rates computed from finality certificates issued by ZPI dispatch.",
			Available:    m.IsGradeB(),
			RequiredMode: "GRADE_B",
			DataSources:  []string{"finality.certificate.issued"},
		},
		{
			ID:           "finality_latency",
			Name:         "Finality Latency (p50 / p95)",
			Description:  "Time-to-finality percentiles per corridor — the operational SLA metric for payout speed.",
			Available:    m.IsGradeB(),
			RequiredMode: "GRADE_B",
			DataSources:  []string{"finality.certificate.issued"},
		},
		{
			ID:           "sla_compliance",
			Name:         "SLA Compliance & Breach Rate",
			Description:  "Per-tenant SLA breach rate and average breach duration. Requires ZPI to own the SLA clock.",
			Available:    m.IsGradeB(),
			RequiredMode: "GRADE_B",
			DataSources:  []string{"finality.certificate.issued", "canonical.intent.created"},
		},
		{
			ID:           "retry_recovery",
			Name:         "Retry Recovery Rate",
			Description:  "What fraction of retried payouts ultimately recovered (reached SETTLED). Requires dispatch control.",
			Available:    m.IsGradeB(),
			RequiredMode: "GRADE_B",
			DataSources:  []string{"dispatch.attempt.created", "finality.certificate.issued"},
		},
		{
			ID:           "outcome_fusion_conflicts",
			Name:         "Outcome Fusion Conflict Rate",
			Description:  "How often ZPI's Outcome Fusion sees conflicting signals. Requires real-time signal streams.",
			Available:    m.IsGradeB(),
			RequiredMode: "GRADE_B",
			DataSources:  []string{"finality.certificate.issued"},
		},
		{
			ID:           "statement_match",
			Name:         "Statement Reconciliation Match Rate",
			Description:  "What % of SETTLED payouts appear in the bank settlement statement.",
			Available:    m.IsGradeB(),
			RequiredMode: "GRADE_B",
			DataSources:  []string{"statement.match.event"},
		},
		{
			ID:           "provider_ref_quality",
			Name:         "Provider Reference Quality",
			Description:  "What % of finalised payouts have a traceable UTR/RRN/BankRef.",
			Available:    m.IsGradeB(),
			RequiredMode: "GRADE_B",
			DataSources:  []string{"finality.certificate.issued"},
		},
	}

	all := make([]IntelligenceCapability, 0, len(gradeA)+len(gradeB))
	all = append(all, gradeA...)
	all = append(all, gradeB...)
	return all
}

// UpgradePath describes what the customer must do to move from Grade A to Grade B.
// Returned by GET /v1/intelligence/mode when mode is GRADE_A.
type UpgradePath struct {
	CurrentMode     string   `json:"current_mode"`
	TargetMode      string   `json:"target_mode"`
	Steps           []string `json:"steps"`
	UnlockedSignals []string `json:"unlocked_signals"` // intelligence surfaces gained after upgrade
}

// GradeBUpgradePath returns the upgrade instructions for a Grade A deployment.
func GradeBUpgradePath() UpgradePath {
	return UpgradePath{
		CurrentMode: string(IntelligenceModeGradeA),
		TargetMode:  string(IntelligenceModeGradeB),
		Steps: []string{
			"1. Deploy ZPI's prepare-and-sign carrier alongside your PSP integration.",
			"2. Route payout dispatch through ZPI's Service 4 (Relay) so ZPI receives dispatch.attempt.created events.",
			"3. Configure Service 5 (Reconciler) to emit finality.certificate.issued and statement.match.event to ZPI.",
			"4. Set env var INTELLIGENCE_MODE=GRADE_B to enable finality-grade intelligence.",
			"5. Validate: finality.certificate.issued events are arriving via GET /v1/intelligence/mode/status.",
		},
		UnlockedSignals: []string{
			"finality_rate",
			"finality_latency",
			"sla_compliance",
			"retry_recovery",
			"outcome_fusion_conflicts",
			"statement_match",
			"provider_ref_quality",
		},
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Mode Status Response — what GET /v1/intelligence/mode returns
// ──────────────────────────────────────────────────────────────────────────────

// IntelligenceModeStatus is the full response for GET /v1/intelligence/mode.
type IntelligenceModeStatus struct {
	// Current operating mode
	Mode      IntelligenceMode `json:"mode"`
	ModeLabel string           `json:"mode_label"`  // human-readable
	ModeSetAt time.Time        `json:"mode_set_at"` // when mode was last configured

	// Capability inventory
	Capabilities []IntelligenceCapability `json:"capabilities"`

	// Counts
	TotalCapabilities     int `json:"total_capabilities"`
	AvailableCapabilities int `json:"available_capabilities"`
	LockedCapabilities    int `json:"locked_capabilities"`

	// Upgrade guidance (nil when already at Grade B)
	UpgradePath *UpgradePath `json:"upgrade_path,omitempty"`

	// Live signal health — did each upstream topic receive events recently?
	// Populated by GET /v1/intelligence/mode/status (detailed view)
	SignalHealth *ModeSignalHealth `json:"signal_health,omitempty"`
}

// ModeSignalHealth reports whether each required upstream topic is healthy.
// "Healthy" means at least one event was processed in the last 24 hours.
type ModeSignalHealth struct {
	// Grade A signals
	SettlementCreated  SignalStatus `json:"settlement_created"`
	AttachmentDecision SignalStatus `json:"attachment_decision"`
	VarianceRecord     SignalStatus `json:"variance_record"`
	BatchSummary       SignalStatus `json:"batch_summary"`
	GovernanceDecision SignalStatus `json:"governance_decision"`
	EvidencePack       SignalStatus `json:"evidence_pack"`

	// Grade B signals (shown but may be inactive in Grade A)
	FinalityCert    SignalStatus `json:"finality_cert"`
	DispatchAttempt SignalStatus `json:"dispatch_attempt"`
	StatementMatch  SignalStatus `json:"statement_match"`

	OverallHealthy bool `json:"overall_healthy"` // true if all required signals for current mode are healthy
}

// SignalStatus describes the health of one upstream Kafka signal.
type SignalStatus struct {
	Topic      string     `json:"topic"`
	Required   bool       `json:"required"`            // required for current mode?
	Active     bool       `json:"active"`              // received events in last 24h?
	LastSeen   *time.Time `json:"last_seen,omitempty"` // nil if never seen
	EventCount int        `json:"event_count_24h"`     // events processed in last 24h
}
