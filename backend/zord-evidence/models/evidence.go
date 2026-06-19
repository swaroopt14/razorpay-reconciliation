package models

import (
	"encoding/json"
	"time"

	"github.com/shopspring/decimal"
)

const (
	LeafTypeRawSettlementLine              = "RAW_SETTLEMENT_LINE"
	LeafTypeCanonicalSettlementObservation = "CANONICAL_SETTLEMENT_OBSERVATION"
	LeafTypeAttachmentDecision             = "ATTACHMENT_DECISION"
	LeafTypeVarianceDecision               = "VARIANCE_DECISION"
	LeafTypeEnvelopeHash                   = "ENVELOPE_HASH"
	LeafTypeCanonicalIntentHash            = "CANONICAL_INTENT_HASH"
	LeafTypeGovernanceDecision             = "GOVERNANCE_DECISION_AT_CANONICAL"
	LeafTypeRawSettlementFile              = "RAW_SETTLEMENT_FILE"
	LeafTypeFinalEvidenceView              = "FINAL_EVIDENCE_VIEW"

	LeafTypeBatchAttachmentSummary = "BATCH_ATTACHMENT_SUMMARY"
	LeafTypeBatchVarianceSummary   = "BATCH_VARIANCE_SUMMARY"
	LeafTypeCanonicalBatch         = "CANONICAL_BATCH"
	LeafTypeFileContentHash        = "FILE_CONTENT_HASH"
)

// RequiredLeafTypes are the 8 externally-supplied leaves that must be present
// before GeneratePack() is triggered. Leaf 9 (FINAL_EVIDENCE_VIEW) is auto-added.
var RequiredLeafTypes = []string{
	LeafTypeRawSettlementLine,
	LeafTypeCanonicalSettlementObservation,
	LeafTypeAttachmentDecision,
	LeafTypeVarianceDecision,
	LeafTypeEnvelopeHash,
	LeafTypeCanonicalIntentHash,
	LeafTypeGovernanceDecision,
	LeafTypeRawSettlementFile,
}

var RequiredBatchLeafTypes = []string{
	LeafTypeRawSettlementFile,
	LeafTypeCanonicalBatch,
	LeafTypeBatchAttachmentSummary,
	LeafTypeBatchVarianceSummary,
	LeafTypeFileContentHash,
}

// ZeroVarianceHash is used when no financial variance exists for a transaction.
// It is computed as SHA256("ZERO_VARIANCE_V1")
const ZeroVarianceHash = "399c0a6a570f78a707a3363575916057a66710682f6e91963286395e8067f920"

// PendingLeafCandidate represents a buffered leaf waiting for the full set.
type PendingLeafCandidate struct {
	ID            string  `json:"id" db:"id"`
	TenantID      string  `json:"tenant_id" db:"tenant_id"`
	IntentID      *string `json:"intent_id" db:"intent_id"`     // null for edge events
	EnvelopeID    *string `json:"envelope_id" db:"envelope_id"` // used to correlate edge
	ContractID    *string `json:"contract_id" db:"contract_id"` // buffered contract_id
	ClientBatchID *string `json:"batch_id" db:"batch_id"`
	LeafType      string  `json:"leaf_type" db:"leaf_type"`
	ItemRef       string  `json:"item_ref" db:"item_ref"`
	Hash          string  `json:"hash" db:"hash"`
	SchemaVersion string  `json:"schema_version" db:"schema_version"`
	SourceTopic   string  `json:"source_topic" db:"source_topic"`

	// 🆕 Metadata carried from RelayEvent
	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty" db:"payment_instruction_received"`
	CanonicalIntentCreated     *time.Time `json:"canonical_intent_created,omitempty" db:"canonical_intent_created"`
	MappingProfileUsed         *string    `json:"mapping_profile_used,omitempty" db:"mapping_profile_used"`
	RequiredFieldsStatus       *bool      `json:"required_fields_status,omitempty" db:"required_fields_status"`
	TokenizationStatus         *bool      `json:"tokenization_status,omitempty" db:"tokenization_status"`
	GovernanceDecision         *string    `json:"governance_decision,omitempty" db:"governance_decision"`

	// 🆕 Intent financial identity
	ClientPayoutRef *string          `json:"client_payout_ref,omitempty" db:"client_payout_ref"`
	Amount          decimal.Decimal `json:"amount,omitempty"           db:"amount"`
	Currency        string          `json:"currency,omitempty"         db:"currency"`

	// 🆕 Settlement Metadata
	SettlementRecordReceived   *time.Time `json:"settlement_record_received,omitempty" db:"settlement_record_received"`
	CanonicalSettlementCreated *time.Time `json:"canonical_settlement_created,omitempty" db:"canonical_settlement_created"`
	BankReference              *string    `json:"bank_reference,omitempty" db:"bank_reference"`
	ClientReference            *string    `json:"client_reference,omitempty" db:"client_reference"`
	AttachmentDecision         *string    `json:"attachment_decision,omitempty" db:"attachment_decision"`
	MatchConfidence            *float64   `json:"match_confidence,omitempty" db:"match_confidence"`
	ValueDateCheck             *bool      `json:"value_date_check,omitempty" db:"value_date_check"`
	AmountMatch                *bool      `json:"amount_match,omitempty" db:"amount_match"`

	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// RelayEvent is a compatible subset of the normalized outbox event
// published by zord-relay to Kafka.
type RelayEvent struct {
	EventID              string          `json:"event_id"`
	TraceID              string          `json:"trace_id"`
	EnvelopeID           string          `json:"envelope_id"`
	TenantID             string          `json:"tenant_id"`
	AggregateType        string          `json:"aggregate_type"`
	AggregateID          string          `json:"aggregate_id"`
	ContractID           string          `json:"contract_id,omitempty"`
	EventType            string          `json:"event_type"`
	Payload              json.RawMessage `json:"payload"`
	EnvelopeHash         string          `json:"envelope_hash,omitempty"`
	CanonicalHash        string          `json:"canonical_hash,omitempty"`
	GovernanceState      string          `json:"governance_state,omitempty"`
	GovernanceHash       string          `json:"governance_hash,omitempty"`
	PayloadHash          string          `json:"payload_hash,omitempty"`
	FileContentHash      string          `json:"file_content_hash,omitempty"`
	ClientBatchID        string          `json:"batchid,omitempty"`
	MappingProfileID     *string         `json:"mapping_profile_used,omitempty"`
	RequiredFieldsStatus *bool           `json:"required_fields_status,omitempty"`
	TokenizationStatus   *bool           `json:"tokenization_status,omitempty"`
	GovernanceDecision   *string         `json:"governance_decision,omitempty"`

	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty"`
	CanonicalIntentCreated     *time.Time `json:"canonical_intent_created,omitempty"`

	// 🆕 Intent financial identity
	ClientPayoutRef *string         `json:"client_payout_ref,omitempty"`
	Amount          decimal.Decimal `json:"amount,omitempty"`
	Currency        string          `json:"currency,omitempty"`

	// 🆕 Settlement Metadata
	SettlementRecordReceived   *time.Time `json:"settlement_record_received,omitempty"`
	CanonicalSettlementCreated *time.Time `json:"canonical_settlement_created,omitempty"`
	BankReference              *string    `json:"bank_reference,omitempty"`
	ClientReference            *string    `json:"client_reference,omitempty"`
	AttachmentDecision         *string    `json:"attachment_decision,omitempty"`
	MatchConfidence            *float64   `json:"match_confidence,omitempty"`
	ValueDateCheck             *bool      `json:"value_date_check,omitempty"`
	AmountMatch                *bool      `json:"amount_match,omitempty"`
}

// EvidenceItem is one proof artifact that becomes a typed leaf in the Merkle tree.
// leaf_hash = SHA256(type || ref || hash || schema_version)
type EvidenceItem struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	Hash          string `json:"hash,omitempty"`
	SchemaVersion string `json:"schema_version"`
	LeafHash      string `json:"leaf_hash,omitempty"`
}

type Signature struct {
	Signer   string    `json:"signer"`
	Alg      string    `json:"alg"`
	Sig      string    `json:"sig"`
	SignedAt time.Time `json:"signed_at"`
}

// EvidencePack is the canonical committed proof bundle for one lifecycle.
// Mode: INTELLIGENCE_ATTACH | SECONDARY_DISPATCH | FULL_CONTROL
type EvidencePack struct {
	EvidencePackID                    string            `json:"evidence_pack_id"`
	TenantID                          string            `json:"tenant_id"`
	IntentID                          string            `json:"intent_id"`
	ContractID                        string            `json:"contract_id"`
	ClientBatchID                     string            `json:"batch_id"`
	Mode                              string            `json:"mode"`
	PackStatus                        string            `json:"pack_status"`
	Items                             []EvidenceItem    `json:"items"`
	MerkleRoot                        string            `json:"merkle_root"`
	RulesetVersion                    string            `json:"ruleset_version"`
	SchemaVersions                    map[string]string `json:"schema_versions"`
	Signatures                        []Signature       `json:"signatures"`
	SupersedesPackID                  string            `json:"supersedes_pack_id,omitempty"`
	PackCompletenessScore             float64           `json:"pack_completeness_score"`
	LeafCount                         int               `json:"leaf_count"`
	RequiredLeafCount                 int               `json:"required_leaf_count"`
	SettlementLeafPresentFlag         bool              `json:"settlement_leaf_present_flag"`
	AttachmentDecisionLeafPresentFlag bool              `json:"attachment_decision_leaf_present_flag"`
	ZordSignature                     string            `json:"zord_signature,omitempty" db:"zord_signature"`

	// 🆕 Traceability & Status Fields
	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty"`
	CanonicalIntentCreated     *time.Time `json:"canonical_intent_created,omitempty"`
	MappingProfileUsed         *string    `json:"mapping_profile_used,omitempty"`
	RequiredFieldsStatus       *bool      `json:"required_fields_status,omitempty"`
	TokenizationStatus         *bool      `json:"tokenization_status,omitempty"`
	GovernanceDecision         *string    `json:"governance_decision,omitempty"`

	// 🆕 Intent financial identity
	ClientPayoutRef *string         `json:"client_payout_ref,omitempty"`
	Amount          decimal.Decimal `json:"amount,omitempty"`
	Currency        string          `json:"currency,omitempty"`

	// 🆕 Settlement Metadata
	SettlementRecordReceived   *time.Time `json:"settlement_record_received,omitempty"`
	CanonicalSettlementCreated *time.Time `json:"canonical_settlement_created,omitempty"`
	BankReference              *string    `json:"bank_reference,omitempty"`
	ClientReference            *string    `json:"client_reference,omitempty"`
	AttachmentDecision         *string    `json:"attachment_decision,omitempty"`
	MatchConfidence            *float64   `json:"match_confidence,omitempty"`
	ValueDateCheck             *bool      `json:"value_date_check,omitempty"`
	AmountMatch                *bool      `json:"amount_match,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}

func (p *EvidencePack) ComputeCompletenessMetadata() {
	hasRawSettlementFile := false
	hasRawSettlementLine := false
	hasCanonicalSettlementObs := false
	hasAttachmentDecision := false
	hasVarianceDecision := false
	hasBatchAttachmentSummary := false
	hasBatchVarianceSummary := false

	for _, item := range p.Items {
		switch item.Type {
		case LeafTypeRawSettlementFile:
			hasRawSettlementFile = true
		case LeafTypeRawSettlementLine:
			hasRawSettlementLine = true
		case LeafTypeCanonicalSettlementObservation:
			hasCanonicalSettlementObs = true
		case LeafTypeAttachmentDecision:
			hasAttachmentDecision = true
		case LeafTypeVarianceDecision:
			hasVarianceDecision = true
		case LeafTypeBatchAttachmentSummary:
			hasBatchAttachmentSummary = true
		case LeafTypeBatchVarianceSummary:
			hasBatchVarianceSummary = true
		}
	}

	p.LeafCount = len(p.Items)

	if p.ClientBatchID != "" {
		p.RequiredLeafCount = 5
		p.SettlementLeafPresentFlag = hasRawSettlementFile
		p.AttachmentDecisionLeafPresentFlag = hasBatchAttachmentSummary && hasBatchVarianceSummary
	} else {
		p.RequiredLeafCount = 9
		p.SettlementLeafPresentFlag = hasRawSettlementFile && hasRawSettlementLine && hasCanonicalSettlementObs
		p.AttachmentDecisionLeafPresentFlag = hasAttachmentDecision && hasVarianceDecision
	}

	if p.RequiredLeafCount > 0 {
		p.PackCompletenessScore = float64(p.LeafCount) / float64(p.RequiredLeafCount)
		if p.PackCompletenessScore > 1.0 {
			p.PackCompletenessScore = 1.0
		}
	}
}

// GenerateEvidenceRequest: upstream services supply all proof artifact items.
// evidence_pack_id is generated exclusively inside Service 6.
// All other IDs (intent_id, contract_id, item refs) come from upstream.
type GenerateEvidenceRequest struct {
	TenantID         string            `json:"tenant_id" binding:"required"`
	IntentID         string            `json:"intent_id"` // required for intent mode
	ClientBatchID    string            `json:"batch_id"`  // required for batch mode
	EnvelopeID       string            `json:"envelope_id"`
	TraceID          string            `json:"trace_id"`
	ContractID       string            `json:"contract_id"`
	Mode             string            `json:"mode" binding:"required"`
	RulesetVersion   string            `json:"ruleset_version" binding:"required"`
	SchemaVersions   map[string]string `json:"schema_versions" binding:"required"`
	SupersedesPackID string            `json:"supersedes_pack_id"`

	// 🆕 Traceability & Status Fields
	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty"`
	CanonicalIntentCreated     *time.Time `json:"canonical_intent_created,omitempty"`
	MappingProfileUsed         *string    `json:"mapping_profile_used,omitempty"`
	RequiredFieldsStatus       *bool      `json:"required_fields_status,omitempty"`
	TokenizationStatus         *bool      `json:"tokenization_status,omitempty"`
	GovernanceDecision         *string    `json:"governance_decision,omitempty"`

	// 🆕 Intent financial identity
	ClientPayoutRef *string         `json:"client_payout_ref,omitempty"`
	Amount          decimal.Decimal `json:"amount,omitempty"`
	Currency        string          `json:"currency,omitempty"`

	// 🆕 Settlement Metadata
	SettlementRecordReceived   *time.Time `json:"settlement_record_received,omitempty"`
	CanonicalSettlementCreated *time.Time `json:"canonical_settlement_created,omitempty"`
	BankReference              *string    `json:"bank_reference,omitempty"`
	ClientReference            *string    `json:"client_reference,omitempty"`
	AttachmentDecision         *string    `json:"attachment_decision,omitempty"`
	MatchConfidence            *float64   `json:"match_confidence,omitempty"`
	ValueDateCheck             *bool      `json:"value_date_check,omitempty"`
	AmountMatch                *bool      `json:"amount_match,omitempty"`

	Items []EvidenceItem `json:"items" binding:"required"`
}

// ReplayRequest instructs Service 6 to rebuild the pack from the same inputs
// with pinned ruleset/mapping/schema versions and compare the Merkle root.
type ReplayRequest struct {
	TenantID        string            `json:"tenant_id" binding:"required"`
	IntentID        string            `json:"intent_id" binding:"required"`
	ContractID      string            `json:"contract_id"`
	Mode            string            `json:"mode" binding:"required"`
	RulesetVersion  string            `json:"ruleset_version" binding:"required"`
	MappingVersions map[string]string `json:"mapping_versions" binding:"required"`
	SchemaVersions  map[string]string `json:"schema_versions" binding:"required"`
	OriginalPackID  string            `json:"original_pack_id" binding:"required"`
	RequestedBy     string            `json:"requested_by"`
	Items           []EvidenceItem    `json:"items" binding:"required"`
}

type ReplayResponse struct {
	ReplayJobID      string `json:"replay_job_id"`
	NewPackID        string `json:"new_pack_id"`
	Equivalent       bool   `json:"equivalent"`
	OldMerkleRoot    string `json:"old_merkle_root"`
	NewMerkleRoot    string `json:"new_merkle_root"`
	Explanation      string `json:"explanation"`
	RulesetVersion   string `json:"ruleset_version"`
	ReplayComparison string `json:"replay_comparison"`
}

type EvidenceViewResponse struct {
	ViewType       string         `json:"view_type"`
	EvidencePackID string         `json:"evidence_pack_id"`
	TenantID       string         `json:"tenant_id"`
	IntentID       string         `json:"intent_id"`
	ContractID     string         `json:"contract_id"`
	ClientBatchID  string         `json:"batch_id,omitempty"`
	Mode           string         `json:"mode"`
	MerkleRoot     string         `json:"merkle_root"`
	RulesetVersion string         `json:"ruleset_version"`
	CreatedAt      time.Time      `json:"created_at"`
	Highlights     map[string]any `json:"highlights"`
}

// ListPacksResponse returned from GET /v1/evidence/packs?intent_id=...
type ListPacksResponse struct {
	Packs []EvidencePackSummary `json:"packs"`
	Total int                   `json:"total"`
}

type EvidencePackSummary struct {
	EvidencePackID                    string  `json:"evidence_pack_id"`
	TenantID                          string  `json:"tenant_id"`
	IntentID                          string  `json:"intent_id"`
	ContractID                        string  `json:"contract_id"`
	ClientBatchID                     string  `json:"batch_id,omitempty"`
	Mode                              string  `json:"mode"`
	PackStatus                        string  `json:"pack_status"`
	MerkleRoot                        string  `json:"merkle_root"`
	RulesetVersion                    string  `json:"ruleset_version"`
	SupersedesPackID                  string  `json:"supersedes_pack_id,omitempty"`
	PackCompletenessScore             float64 `json:"pack_completeness_score"`
	LeafCount                         int     `json:"leaf_count"`
	RequiredLeafCount                 int     `json:"required_leaf_count"`
	SettlementLeafPresentFlag         bool    `json:"settlement_leaf_present_flag"`
	AttachmentDecisionLeafPresentFlag bool    `json:"attachment_decision_leaf_present_flag"`

	// 🆕 Traceability & Status Fields
	PaymentInstructionReceived *time.Time `json:"payment_instruction_received,omitempty"`
	CanonicalIntentCreated     *time.Time `json:"canonical_intent_created,omitempty"`
	MappingProfileUsed         *string    `json:"mapping_profile_used,omitempty"`
	RequiredFieldsStatus       *bool      `json:"required_fields_status,omitempty"`
	TokenizationStatus         *bool      `json:"tokenization_status,omitempty"`
	GovernanceDecision         *string    `json:"governance_decision,omitempty"`

	// 🆕 Intent financial identity
	ClientPayoutRef *string         `json:"client_payout_ref,omitempty"`
	Amount          decimal.Decimal `json:"amount,omitempty"`
	Currency        string          `json:"currency,omitempty"`

	// 🆕 Settlement Metadata
	SettlementRecordReceived   *time.Time `json:"settlement_record_received,omitempty"`
	CanonicalSettlementCreated *time.Time `json:"canonical_settlement_created,omitempty"`
	BankReference              *string    `json:"bank_reference,omitempty"`
	ClientReference            *string    `json:"client_reference,omitempty"`
	AttachmentDecision         *string    `json:"attachment_decision,omitempty"`
	MatchConfidence            *float64   `json:"match_confidence,omitempty"`
	ValueDateCheck             *bool      `json:"value_date_check,omitempty"`
	AmountMatch                *bool      `json:"amount_match,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}

// ReplayJob is the §14.5 evidence_replay_jobs row.
type ReplayJob struct {
	ReplayJobID          string            `json:"replay_job_id"`
	TenantID             string            `json:"tenant_id"`
	SourceEvidencePackID string            `json:"source_evidence_pack_id"`
	IntentID             string            `json:"intent_id"`
	ContractID           string            `json:"contract_id"`
	RulesetVersion       string            `json:"ruleset_version"`
	MappingVersions      map[string]string `json:"mapping_versions"`
	RequestedBy          string            `json:"requested_by"`
	Status               string            `json:"status"`
	NewEvidencePackID    string            `json:"new_evidence_pack_id,omitempty"`
	EquivalenceResult    string            `json:"equivalence_result,omitempty"`
	DifferenceSummary    map[string]any    `json:"difference_summary,omitempty"`
	CreatedAt            time.Time         `json:"created_at"`
	CompletedAt          *time.Time        `json:"completed_at,omitempty"`
}

// InclusionProof is the §14.4 merkle_inclusion_proofs row for selective disclosure.
type InclusionProof struct {
	EvidencePackID string    `json:"evidence_pack_id"`
	LeafHash       string    `json:"leaf_hash"`
	ProofPath      []string  `json:"proof_path"` // sibling hashes from leaf to root
	CreatedAt      time.Time `json:"created_at"`
}

// EvidenceArchive is the §14.3 evidence_archives row.
type EvidenceArchive struct {
	ArchiveID       string    `json:"archive_id"`
	EvidencePackID  string    `json:"evidence_pack_id"`
	TenantID        string    `json:"tenant_id"`
	ObjectRef       string    `json:"object_ref"`
	EncryptionKeyID string    `json:"encryption_key_id,omitempty"`
	ArchiveHash     string    `json:"archive_hash"`
	ArchiveVersion  string    `json:"archive_version"`
	CreatedAt       time.Time `json:"created_at"`
}
