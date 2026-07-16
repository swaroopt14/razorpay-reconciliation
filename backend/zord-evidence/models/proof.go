package models

import "time"

// ProofStatus is the state machine for a payment evidence pack.
//
// Transitions:
//
//	DRAFT → MISSING_* → PROOF_READY → PROOF_ASSEMBLED → VERIFIED → EXPORTED
//	Any state → REVOKED_SUPERSEDED (when a newer pack supersedes this one)
//	NEEDS_REVIEW is a holding state for packs that require manual intervention.
//
// FIX-09: Removed ProofStatusCertified. "CERTIFIED" implied an external
// certification step that does not exist in this service. A sealed pack is
// PROOF_ASSEMBLED. CERTIFIED is reserved for a future explicit certification
// workflow and must not be used by DeriveProofStatus.
//
// Added ProofStatusProofAssembled and ProofStatusMissingVarianceEvidence to
// replace the ambiguous CERTIFIED and the misleading MISSING_REPLAY_CHECK.
type ProofStatus string

const (
	// Informational / in-progress states.
	ProofStatusDraft        ProofStatus = "DRAFT"
	ProofStatusPartialProof ProofStatus = "PARTIAL_PROOF"
	ProofStatusNeedsReview  ProofStatus = "NEEDS_REVIEW"

	// Missing-component states (one per required proof component).
	ProofStatusMissingIntent        ProofStatus = "MISSING_INTENT"
	ProofStatusMissingSettlement    ProofStatus = "MISSING_SETTLEMENT"
	ProofStatusMissingMatchDecision ProofStatus = "MISSING_MATCH_DECISION"
	ProofStatusMissingGovernance    ProofStatus = "MISSING_GOVERNANCE"
	// FIX-09: Replaces MISSING_REPLAY_CHECK. The 5th scoring component is
	// variance-and-decision evidence, not replay/duplicate-spend detection.
	ProofStatusMissingVarianceEvidence ProofStatus = "MISSING_VARIANCE_EVIDENCE"

	// Terminal / sealed states.
	ProofStatusProofReady ProofStatus = "PROOF_READY"
	// FIX-09: Replaces CERTIFIED. Means all leaves are present and the Merkle
	// root has been sealed and signed — no external certification required.
	ProofStatusProofAssembled    ProofStatus = "PROOF_ASSEMBLED"
	ProofStatusVerified          ProofStatus = "VERIFIED"
	ProofStatusExported          ProofStatus = "EXPORTED"
	ProofStatusRevokedSuperseded ProofStatus = "REVOKED_SUPERSEDED"
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
// Note: ReplayCheckPassed is a DB/JSON field name retained for compatibility;
// its semantic meaning is "variance and decision evidence leaves are present",
// not duplicate-spend / replay detection.
type ProofComponents struct {
	PaymentInstructionAvailable bool `json:"payment_instruction_available"`
	SettlementRecordAvailable   bool `json:"settlement_record_available"`
	MatchDecisionAvailable      bool `json:"match_decision_available"`
	GovernanceDecisionAvailable bool `json:"governance_decision_available"`
	ReplayCheckPassed           bool `json:"replay_check_passed"` // semantic: variance+decision evidence present
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
//
// Status combines two independent layers — it is only VERIFIED when both
// pass. This is intentionally not the full 5-level verification model from
// the evidence refactor spec (signature, source-artifact, and business-replay
// layers aren't wired in yet) — it's Level 1 (DB/Merkle self-consistency)
// plus Level 3 (encrypted archive verification), which previously existed
// but was only invoked during dispute export, never during /verify.
//
//	VERIFIED               — DB/Merkle AND archive both verified independently.
//	CORRUPTED               — DB/Merkle recomputation does not match the stored root.
//	ARCHIVE_UNVERIFIED      — DB/Merkle passed, but the independently stored
//	                          archive failed ciphertext/decrypt/manifest checks.
//	INTERNALLY_CONSISTENT   — DB/Merkle passed, but no archive exists to check
//	                          against (e.g. archiving wasn't enabled when this
//	                          pack was created, or archive storage isn't
//	                          configured on this deployment). Not full proof.
type VerifyResponse struct {
	Status         string    `json:"status"`
	EvidencePackID string    `json:"evidence_pack_id"`
	CheckedAt      time.Time `json:"checked_at"`
	StoredRoot     string    `json:"stored_root"`
	ComputedRoot   string    `json:"computed_root,omitempty"`
	Explanation    string    `json:"explanation"`

	// DBMerkleStatus is Level 1: PASSED | FAILED.
	DBMerkleStatus string `json:"db_merkle_status"`

	// ArchiveStatus is Level 3: PASSED | FAILED | NOT_AVAILABLE.
	ArchiveStatus      string `json:"archive_status"`
	ArchiveExplanation string `json:"archive_explanation,omitempty"`
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

// EvidenceExportLogEntry is one row from evidence_export_log (who exported what/when).
type EvidenceExportLogEntry struct {
	ExportID         string    `json:"export_id"`
	EvidencePackID   string    `json:"evidence_pack_id"`
	TenantID         string    `json:"tenant_id"`
	IntentID         string    `json:"intent_id,omitempty"`
	PaymentReference string    `json:"payment_reference,omitempty"`
	ExportType       string    `json:"export_type"`
	DisputeReason    string    `json:"dispute_reason,omitempty"`
	RequestedBy      string    `json:"requested_by,omitempty"`
	ExportedAt       time.Time `json:"exported_at"`
	FileHash         string    `json:"file_hash"`
}

// ListPackExportsResponse is returned by GET /v1/evidence/packs/:packID/exports.
type ListPackExportsResponse struct {
	EvidencePackID string                   `json:"evidence_pack_id"`
	Exports        []EvidenceExportLogEntry `json:"exports"`
	Count          int                      `json:"count"`
}

// MaskedEvidenceItem is a field-level masked version of EvidenceItem for
// business-facing layouts (data masking per spec §8).
type MaskedEvidenceItem struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	SchemaVersion string `json:"schema_version"`
	LeafHash      string `json:"leaf_hash,omitempty"`
}
