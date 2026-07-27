package canonicalizer

import "zord-intent-engine/internal/jcs"

// RawRowEvidenceLeafHashInput binds a raw-row hash to the exact artifact
// version and row location sealed by the artifact-sealing service. ArtifactID/
// ArtifactVersionID/RowIndex are populated by that upstream service, not
// derived here — left blank/zero until it exists.
type RawRowEvidenceLeafHashInput struct {
	TenantID          string
	ArtifactID        string
	ArtifactVersionID string
	SourceRowRef      string
	RowIndex          int
	RawRowHash        string
}

// ComputeRawRowEvidenceLeafHash returns
// raw_row_leaf_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...}))
func ComputeRawRowEvidenceLeafHash(in RawRowEvidenceLeafHashInput) (string, error) {
	fields := map[string]any{
		"hash_type":           "RAW_ROW_EVIDENCE_LEAF",
		"hash_version":        "1",
		"tenant_id":           in.TenantID,
		"artifact_id":         in.ArtifactID,
		"artifact_version_id": in.ArtifactVersionID,
		"source_row_ref":      in.SourceRowRef,
		"row_index":           in.RowIndex,
		"raw_row_hash":        in.RawRowHash,
	}
	return jcs.CanonicalizeAndSHA256(fields)
}

// CanonicalRowEvidenceLeafHashInput binds the interpreted row facts to the
// exact artifact version. ArtifactID/ArtifactVersionID are populated by an
// upstream service, not derived here — left blank until it exists.
type CanonicalRowEvidenceLeafHashInput struct {
	TenantID          string
	ArtifactID        string
	ArtifactVersionID string
	SourceRowRef      string
	CanonicalRowHash  string
}

// ComputeCanonicalRowEvidenceLeafHash returns
// canonical_row_leaf_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...}))
func ComputeCanonicalRowEvidenceLeafHash(in CanonicalRowEvidenceLeafHashInput) (string, error) {
	fields := map[string]any{
		"hash_type":           "CANONICAL_ROW_EVIDENCE_LEAF",
		"hash_version":        "1",
		"tenant_id":           in.TenantID,
		"artifact_id":         in.ArtifactID,
		"artifact_version_id": in.ArtifactVersionID,
		"source_row_ref":      in.SourceRowRef,
		"canonical_row_hash":  in.CanonicalRowHash,
	}
	return jcs.CanonicalizeAndSHA256(fields)
}
