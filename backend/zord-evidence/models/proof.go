package models

import "time"

// ProofStatus is the full production-grade state machine for every payment lifecycle.
type ProofStatus string

const (
	ProofStatusDraft                ProofStatus = "DRAFT"
	ProofStatusPartialProof         ProofStatus = "PARTIAL_PROOF"
	ProofStatusMissingIntent        ProofStatus = "MISSING_INTENT"
	ProofStatusMissingSettlement    ProofStatus = "MISSING_SETTLEMENT"
	ProofStatusMissingMatchDecision ProofStatus = "MISSING_MATCH_DECISION"
	ProofStatusMissingGovernance    ProofStatus = "MISSING_GOVERNANCE"
	ProofStatusMissingReplayCheck   ProofStatus = "MISSING_REPLAY_CHECK"
	ProofStatusNeedsReview          ProofStatus = "NEEDS_REVIEW"
	ProofStatusProofReady           ProofStatus = "PROOF_READY"
	ProofStatusCertified            ProofStatus = "CERTIFIED"
	ProofStatusVerified             ProofStatus = "VERIFIED"
	ProofStatusExported             ProofStatus = "EXPORTED"
	ProofStatusRevokedSuperseded    ProofStatus = "REVOKED_SUPERSEDED"
)

// ProofScoreComponent holds a weighted check result and explains any deduction.
type ProofScoreComponent struct {
	Check       string `json:"check"`
	Weight      int    `json:"weight"`
	Passed      bool   `json:"passed"`
	Deduction   int    `json:"deduction"`
	Explanation string `json:"explanation,omitempty"`
}

// ProofScoreResult is the deterministic weighted score (0–100) with full audit trail.
type ProofScoreResult struct {
	Score      int                   `json:"score"`
	Components []ProofScoreComponent `json:"components"`
	Deductions []string              `json:"deductions"`
}

// ProofComponents tracks per-pipeline artifact availability derived from leaf presence.
type ProofComponents struct {
	PaymentInstructionAvailable bool `json:"payment_instruction_available"`
	SettlementRecordAvailable   bool `json:"settlement_record_available"`
	MatchDecisionAvailable      bool `json:"match_decision_available"`
	GovernanceDecisionAvailable bool `json:"governance_decision_available"`
	ReplayCheckPassed           bool `json:"replay_check_passed"`
}

// CryptographicSignatures holds per-artifact hashes for the pack.
type CryptographicSignatures struct {
	RawIntentHash           string `json:"raw_intent_hash,omitempty"`
	CanonicalIntentHash     string `json:"canonical_intent_hash,omitempty"`
	RawSettlementHash       string `json:"raw_settlement_hash,omitempty"`
	CanonicalSettlementHash string `json:"canonical_settlement_hash,omitempty"`
	AttachmentDecisionHash  string `json:"attachment_decision_hash,omitempty"`
	GovernanceDecisionHash  string `json:"governance_decision_hash,omitempty"`
	EnvelopeHash            string `json:"envelope_hash,omitempty"`
	FinalEvidenceViewHash   string `json:"final_evidence_view_hash,omitempty"`
}

// EnrichedEvidencePack is the spec §4 response. Wraps the canonical EvidencePack
// with proof state, score, operational metadata, and cryptographic index.
// Upstream lineage signals (Service 2 / Service 5) are already present on the
// embedded EvidencePack fields (payment_instruction_received, bank_reference, etc.)
// and are not duplicated here as nested objects.
type EnrichedEvidencePack struct {
	EvidencePack

	// Proof state
	ProofStatus         ProofStatus      `json:"proof_status"`
	ProofScore          int              `json:"proof_score"`
	ProofScoreBreakdown ProofScoreResult `json:"proof_score_breakdown"`

	// Operational metadata
	GeneratedBy        string     `json:"generated_by"`
	LastVerifiedAt     *time.Time `json:"last_verified_at,omitempty"`
	VerificationStatus bool       `json:"verification_status"`
	ExportCount        int        `json:"export_count"`

	// Derived from leaf set
	ProofComponents         ProofComponents         `json:"proof_components"`
	CryptographicSignatures CryptographicSignatures `json:"cryptographic_signatures"`
}

// TimelineEvent is one human-readable milestone in the payment proof lineage.
type TimelineEvent struct {
	Timestamp time.Time `json:"timestamp"`
	Event     string    `json:"event"`
	NodeID    string    `json:"node_id,omitempty"`
}

// LineageNode represents one node in the Merkle DAG for auditor-facing display.
type LineageNode struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	NodeType      string   `json:"node_type"` // SOURCE | TRANSFORM | DECISION | SEAL
	LeafHash      string   `json:"leaf_hash,omitempty"`
	ItemRef       string   `json:"item_ref,omitempty"`
	SchemaVersion string   `json:"schema_version,omitempty"`
	Children      []string `json:"children,omitempty"`
}

// LineageGraph is the full DAG payload for the auditor-facing lineage endpoint.
type LineageGraph struct {
	EvidencePackID string        `json:"evidence_pack_id"`
	TenantID       string        `json:"tenant_id"`
	IntentID       string        `json:"intent_id"`
	MerkleRoot     string        `json:"merkle_root"`
	Nodes          []LineageNode `json:"nodes"`
	Edges          []LineageEdge `json:"edges"`
}

// LineageEdge is a directed edge in the DAG.
type LineageEdge struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Label string `json:"label,omitempty"`
}

// VerifyResponse is the payload for POST /v1/evidence/{id}/verify.
type VerifyResponse struct {
	Status         string    `json:"status"` // VERIFIED | CORRUPTED
	EvidencePackID string    `json:"evidence_pack_id"`
	CheckedAt      time.Time `json:"checked_at"`
	StoredRoot     string    `json:"stored_root"`
	ComputedRoot   string    `json:"computed_root,omitempty"`
	Explanation    string    `json:"explanation"`
}

// DisputeExportRequest is the payload for POST /v1/dispute/export.
type DisputeExportRequest struct {
	PaymentReference string `json:"payment_reference" binding:"required"`
	TenantID         string `json:"tenant_id" binding:"required"`
	DisputeReason    string `json:"dispute_reason"`
	ExportType       string `json:"export_type"` // FINANCE_SUMMARY | AUDIT_DETAILED | BANK_PSP_PACK | RAW_JSON
	RequestedBy      string `json:"requested_by"`
	EvidencePackID   string `json:"evidence_pack_id"`
}

// ExportType constants for the dispute export endpoint.
const (
	ExportTypeFinanceSummary = "FINANCE_SUMMARY"
	ExportTypeAuditDetailed  = "AUDIT_DETAILED"
	ExportTypeBankPSPPack    = "BANK_PSP_PACK"
	ExportTypeRawJSON        = "RAW_JSON"
)

// MaskedEvidenceItem is a field-level masked version of EvidenceItem for
// business-facing layouts (spec §8 data masking).
type MaskedEvidenceItem struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	SchemaVersion string `json:"schema_version"`
	LeafHash      string `json:"leaf_hash,omitempty"`
}
