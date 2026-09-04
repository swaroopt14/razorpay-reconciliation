package models

import (
	"time"

	"github.com/shopspring/decimal"
)

// ---------------------------------------------------------------------------
// FINANCE_SUMMARY view (spec §6.1)
// High-level executive brief surfaced for finance / ops teams.
// ---------------------------------------------------------------------------

// FinanceSummaryView is the structured payload for FINANCE_SUMMARY exports.
// All eight required fields are derived deterministically from the EvidencePack.
type FinanceSummaryView struct {
	// Payment reference — client_payout_ref carried on the pack; falls back to
	// the payment_reference supplied in the export request.
	PaymentReference string `json:"payment_reference"`

	// Amount and currency of the payment instruction (from Service 2).
	Amount   decimal.Decimal `json:"amount"`
	Currency string          `json:"currency"`

	// UTR is the bank_reference (masked: last-4 digits visible per §8).
	UTR string `json:"utr"`

	// Status is the pack_status field (e.g. ACTIVE, SUPERSEDED).
	Status string `json:"status"`

	// Matched is true when attachment_decision == "MATCHED".
	Matched bool `json:"matched"`

	// VarianceLabel is "ZERO" when the variance leaf hash equals ZeroVarianceHash,
	// otherwise "NON-ZERO".
	VarianceLabel string `json:"variance"`

	// ProofScore is the deterministic weighted score (0–100).
	ProofScore int `json:"proof_score"`

	// Explanation is a single human-readable sentence summarising the payment status.
	Explanation string `json:"explanation"`

	// ZordSignature is the cryptographic seal over the pack generated using the service's private key.
	ZordSignature string `json:"zord_signature,omitempty"`
}

// ---------------------------------------------------------------------------
// AUDIT_DETAILED view (spec §6.2)
// Compliance-focused pack for regulators and internal audit teams.
// ---------------------------------------------------------------------------

// AuditTimestamps groups all lifecycle timestamps in chronological order.
type AuditTimestamps struct {
	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty"`
	CanonicalIntentCreated     *time.Time `json:"canonical_intent_created,omitempty"`
	SettlementRecordReceived   *time.Time `json:"settlement_record_received,omitempty"`
	CanonicalSettlementCreated *time.Time `json:"canonical_settlement_created,omitempty"`
	PackCreatedAt              time.Time  `json:"pack_created_at"`
}

// AuditMappingProfiles captures the processing profile metadata.
type AuditMappingProfiles struct {
	MappingProfileUsed string            `json:"mapping_profile_used,omitempty"`
	RulesetVersion     string            `json:"ruleset_version"`
	SchemaVersions     map[string]string `json:"schema_versions,omitempty"`
}

// AuditGovernanceStatus captures the compliance gate results from Service 2.
type AuditGovernanceStatus struct {
	GovernanceDecision   string `json:"governance_decision,omitempty"`
	RequiredFieldsStatus *bool  `json:"required_fields_status,omitempty"`
	TokenizationStatus   *bool  `json:"tokenization_status,omitempty"`
}

// ProofComponentsChecklist is a ✓/✗ checklist for each of the six scoring components.
type ProofComponentsChecklist struct {
	PaymentInstruction bool `json:"payment_instruction"`
	SettlementRecord   bool `json:"settlement_record"`
	MatchDecision      bool `json:"match_decision"`
	GovernanceCheck    bool `json:"governance_check"`
	ReplayProtection   bool `json:"replay_protection"`
	CryptographicSeal  bool `json:"cryptographic_seal"`
}

// AuditDetailedView is the structured payload for AUDIT_DETAILED exports.
// It covers all seven required sections.
type AuditDetailedView struct {
	EvidencePackID string `json:"evidence_pack_id"`
	IntentID       string `json:"intent_id"`
	TenantID       string `json:"tenant_id"`
	ContractID     string `json:"contract_id,omitempty"`

	// Section 1 — Timestamps
	Timestamps AuditTimestamps `json:"timestamps"`

	// Section 2 — Mapping profiles
	MappingProfiles AuditMappingProfiles `json:"mapping_profiles"`

	// Section 3 — Cryptographic hashes (all leaf hashes)
	Hashes CryptographicSignatures `json:"hashes"`

	// Section 4 — Governance status
	GovernanceStatus AuditGovernanceStatus `json:"governance_status"`

	// Section 5 — Merkle root and signature
	MerkleRoot string      `json:"merkle_root"`
	Signature  *Signature  `json:"signature,omitempty"`

	// Section 6 — Verification status (completeness flags)
	VerificationStatus         bool    `json:"verification_status"`
	PackCompletenessScore      float64 `json:"pack_completeness_score"`
	SettlementLeafPresent      bool    `json:"settlement_leaf_present"`
	AttachmentDecisionPresent  bool    `json:"attachment_decision_present"`

	// Section 7 — Proof components checklist
	ProofComponentsChecklist ProofComponentsChecklist `json:"proof_components_checklist"`
	ProofScore               int                      `json:"proof_score"`

	// ZordSignature is the cryptographic seal over the pack generated using the service's private key.
	ZordSignature string `json:"zord_signature,omitempty"`
}

// ---------------------------------------------------------------------------
// BANK_PSP_PACK view (spec §6.3)
// External execution pack for banks and PSPs.
// ---------------------------------------------------------------------------

// BankPSPPackView is the structured payload for BANK_PSP_PACK exports.
type BankPSPPackView struct {
	// UTR is the bank_reference (masked: last-4 digits visible per §8).
	UTR string `json:"utr"`

	// ClientReference is the client_reference from Service 5.
	ClientReference string `json:"client_reference,omitempty"`

	// ValueDate is the settlement date in YYYY-MM-DD format.
	ValueDate string `json:"value_date"`

	// Amount and currency of the payment.
	Amount   decimal.Decimal `json:"amount"`
	Currency string          `json:"currency"`

	// VarianceReason is "ZERO" or "NON-ZERO" based on variance leaf hash.
	VarianceReason string `json:"variance_reason"`

	// SettlementRecord is the ref of the canonical settlement observation leaf.
	SettlementRecord string `json:"settlement_record,omitempty"`

	// IssueStatement is a clear one-line statement of the dispute context.
	// Format: "<dispute_reason> — <attachment_decision> — UTR:<masked_utr>"
	IssueStatement string `json:"issue_statement"`

	// ZordSignature is the cryptographic seal over the pack generated using the service's private key.
	ZordSignature string `json:"zord_signature,omitempty"`
}

// ---------------------------------------------------------------------------
// ExportPreviewResponse — returned by GET /v1/dispute/export/preview
// ---------------------------------------------------------------------------

// ExportPreviewResponse is the structured JSON response for the preview endpoint.
// Only one of the three view fields will be populated, depending on export_type.
type ExportPreviewResponse struct {
	ExportType     string `json:"export_type"`
	EvidencePackID string `json:"evidence_pack_id"`
	TenantID       string `json:"tenant_id"`
	IntentID       string `json:"intent_id,omitempty"`

	// Populated when export_type == FINANCE_SUMMARY
	FinanceSummary *FinanceSummaryView `json:"finance_summary,omitempty"`

	// Populated when export_type == AUDIT_DETAILED
	AuditDetailed *AuditDetailedView `json:"audit_detailed,omitempty"`

	// Populated when export_type == BANK_PSP_PACK
	BankPSPPack *BankPSPPackView `json:"bank_psp_pack,omitempty"`
}
