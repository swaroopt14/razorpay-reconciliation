package utils

import (
	"encoding/json"
	"time"

	"zord-evidence/models"
)

// MarshalCanonicalJSON produces deterministic JSON bytes for hashing.
// encoding/json sorts map keys, so SchemaVersions and similar maps are stable.
// Callers must pass the same Go value shape at write and verify time.
func MarshalCanonicalJSON(v any) ([]byte, error) {
	return json.Marshal(v)
}

// TestVector generates a cross-language test vector for signature verification.
// The output is deterministic canonical JSON that can be consumed by Python, Java, Rust, etc.
// Format: {"evidence_pack_id":"...","tenant_id":"...","merkle_root":"...",
//
//	"ruleset_version":"...","canonicalization_version":"v1|v2","signatures":[...]}
func TestVector(pack *models.EvidencePack, signatures []models.Signature, canonicalizationVersion string) (map[string]interface{}, error) {
	manifest := models.PackManifestV1{
		EvidencePackID:          pack.EvidencePackID,
		TenantID:                pack.TenantID,
		MerkleRoot:              pack.MerkleRoot,
		ScopeID:                 "",
		CreatedAt:               pack.CreatedAt.Format(time.RFC3339Nano),
		RulesetVersion:          pack.RulesetVersion,
		CanonicalizationVersion: canonicalizationVersion,
	}

	// Build scope_id based on pack mode
	if pack.Mode == "INTELLIGENCE_ATTACH" || pack.Mode == "FULL_CONTROL" {
		manifest.ScopeID = pack.IntentID
	} else {
		manifest.ScopeID = pack.ClientBatchID
	}

	// Construct the test vector
	vector := map[string]interface{}{
		"evidence_pack_id":         pack.EvidencePackID,
		"tenant_id":                pack.TenantID,
		"merkle_root":              pack.MerkleRoot,
		"ruleset_version":          pack.RulesetVersion,
		"canonicalization_version": canonicalizationVersion,
		"signatures":               signatures,
	}

	// Add manifest as canonical JSON string
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		return nil, err
	}
	vector["manifest"] = string(manifestBytes)

	return vector, nil
}
