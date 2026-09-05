package models

import "time"

// Overall verification status — the composed result of every layer /verify
// actually ran for a pack. See VerifyResponse doc comment (proof.go) for the
// precise semantics of each value.
const (
	VerificationOverallVerified             = "VERIFIED"
	VerificationOverallCorrupted            = "CORRUPTED"
	VerificationOverallCompromised          = "COMPROMISED"
	VerificationOverallInternallyConsistent = "INTERNALLY_CONSISTENT"
)

// Per-layer status values, shared by all verification layers.
const (
	VerificationLayerStatusPassed       = "PASSED"
	VerificationLayerStatusFailed       = "FAILED"
	VerificationLayerStatusNotAvailable = "NOT_AVAILABLE"
)

// Verification layer identifiers. Only DBMerkle/Archive/Signature exist
// today (Levels 1-3); SourceArtifact/BusinessReplay (Levels 4-5) are reserved
// here so evidence_verification_failures doesn't need a schema change when
// those layers are built.
const (
	VerificationLayerDBMerkle       = "DB_MERKLE"
	VerificationLayerArchive        = "ARCHIVE"
	VerificationLayerSignature      = "SIGNATURE"
	VerificationLayerSourceArtifact = "SOURCE_ARTIFACT"
	VerificationLayerBusinessReplay = "BUSINESS_REPLAY"
)

// VerificationRun is one immutable record of a single POST .../verify call —
// the audit trail the spec's evidence_verification_runs table exists for.
// Unlike evidence_packs.verification_status (a single mutable latest-check
// boolean), every call to /verify creates a new row here, so "was this pack
// ever found corrupted" is answerable even after a later check passes.
type VerificationRun struct {
	VerificationRunID string    `json:"verification_run_id"`
	EvidencePackID    string    `json:"evidence_pack_id"`
	TenantID          string    `json:"tenant_id"`
	OverallStatus     string    `json:"overall_status"`
	DBMerkleStatus    string    `json:"db_merkle_status"`
	ArchiveStatus     string    `json:"archive_status"`
	SignatureStatus   string    `json:"signature_status"`
	StoredRoot        string    `json:"stored_root,omitempty"`
	ComputedRoot      string    `json:"computed_root,omitempty"`
	Explanation       string    `json:"explanation,omitempty"`
	CheckedAt         time.Time `json:"checked_at"`
	CreatedAt         time.Time `json:"created_at"`

	// Failures is populated by the caller before SaveRun for any layer that
	// didn't PASS (the caller already has the human-readable reason from
	// that layer's own error, e.g. VerifyArchiveForPack's returned error) and
	// is populated by the repository on read (history endpoint). SaveRun
	// persists exactly what's here — it does not re-derive reasons from the
	// per-layer status fields, since it has no access to the original error text.
	Failures []VerificationFailure `json:"failures,omitempty"`
}

// VerificationFailure is one layer that did not PASS on a given run (FAILED
// or NOT_AVAILABLE). A fully VERIFIED run has none. Normalized into its own
// table (rather than fixed columns) so adding Level 4/5 layers later doesn't
// require a schema migration on the run table itself.
type VerificationFailure struct {
	VerificationFailureID string    `json:"verification_failure_id"`
	VerificationRunID     string    `json:"verification_run_id"`
	EvidencePackID        string    `json:"evidence_pack_id"`
	Layer                 string    `json:"layer"`
	Status                string    `json:"status"`
	Reason                string    `json:"reason,omitempty"`
	CreatedAt             time.Time `json:"created_at"`
}

// VerificationRunsResponse is the payload for GET .../verification-runs.
type VerificationRunsResponse struct {
	EvidencePackID string            `json:"evidence_pack_id"`
	Runs           []VerificationRun `json:"runs"`
	Count          int               `json:"count"`
}
