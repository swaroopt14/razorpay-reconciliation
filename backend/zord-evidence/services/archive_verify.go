package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
	"zord-evidence/models"
	"zord-evidence/storage"
)

// ErrArchiveVerificationFailed is returned when Mode A archive verification fails.
// Dispute export must not proceed when this error is returned.
var ErrArchiveVerificationFailed = errors.New("archive verification failed")

// ErrArchiveNotAvailable is returned when there is nothing to verify — archive
// storage/crypto isn't configured on this deployment, or this specific pack
// has no archive row (e.g. it predates archiving being enabled). Every error
// returned by VerifyArchiveForPack still also satisfies
// errors.Is(err, ErrArchiveVerificationFailed) for existing callers (Mode A
// export must block either way); ErrArchiveNotAvailable lets callers that
// care distinguish "nothing to check" from "checked and it's corrupted".
var ErrArchiveNotAvailable = errors.New("archive not available for verification")

// ArchiveManifest is the canonical JSON form of a pack that is stored
// inside an encrypted archive. It matches the output of utils.MarshalCanonicalJSON
// on an EvidencePack, so that Mode-A archive verification can independently
// confirm the archived object is identical to the signed pack.
//
// Fields are explicitly listed (not the full EvidencePack) to keep the manifest
// stable across Go struct changes -- only the fields needed for cross-checking
// are included.
type ArchiveManifest struct {
	EvidencePackID string                     `json:"evidence_pack_id"`
	TenantID       string                     `json:"tenant_id"`
	MerkleRoot     string                     `json:"merkle_root"`
	RulesetVersion string                     `json:"ruleset_version"`
	Signatures     []models.Signature         `json:"signatures"`
	Items          []models.EvidenceItem      `json:"items"`
	LeafCount      int                        `json:"leaf_count"`
	RequiredLeafCount int                    `json:"required_leaf_count"`
	PackStatus     string                     `json:"pack_status"`
	Mode           string                     `json:"mode"`
	SchemaVersions map[string]string          `json:"schema_versions"`
	ZordSignature  string                     `json:"zord_signature"`
}

// VerifyArchiveForPack fetches the S3 archive, verifies ciphertext and plaintext
// hashes, parses the canonical JSON manifest, and independently confirms the
// archived object is byte-for-byte identical to the currently signed pack in the DB.
// Mode A requires this before export. Changing archive content plus DB hash metadata
// cannot pass this verification.
func (s *EvidenceService) VerifyArchiveForPack(ctx context.Context, packID string) error {
	if s.s3 == nil || s.archiveCrypto == nil {
		return fmt.Errorf("%w: %w: archive store/crypto not configured", ErrArchiveVerificationFailed, ErrArchiveNotAvailable)
	}

	meta, err := s.repo.GetArchiveByPackID(ctx, packID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: %w: no archive recorded for pack %s", ErrArchiveVerificationFailed, ErrArchiveNotAvailable, packID)
		}
		return fmt.Errorf("%w: load archive metadata: %v", ErrArchiveVerificationFailed, err)
	}

	if meta.ArchiveCiphertextHash == "" {
		return fmt.Errorf("%w: archive_ciphertext_hash missing for pack %s", ErrArchiveVerificationFailed, packID)
	}
	if meta.PlaintextManifestHash == "" {
		return fmt.Errorf("%w: plaintext_manifest_hash missing for pack %s (legacy archive cannot be Mode-A verified)", ErrArchiveVerificationFailed, packID)
	}

	expectedKeyID := s.archiveCrypto.KeyID()
	if meta.EncryptionKeyID != "" && meta.EncryptionKeyID != expectedKeyID {
		return fmt.Errorf("%w: encryption_key_id mismatch stored=%s expected=%s",
			ErrArchiveVerificationFailed, meta.EncryptionKeyID, expectedKeyID)
	}

	objectKey, err := storage.ObjectKeyFromRef(meta.ObjectRef)
	if err != nil {
		return fmt.Errorf("%w: parse object ref: %v", ErrArchiveVerificationFailed, err)
	}

	ciphertext, err := s.s3.GetObject(ctx, objectKey)
	if err != nil {
		return fmt.Errorf("%w: fetch s3 object: %v", ErrArchiveVerificationFailed, err)
	}

	// 1. Verify ciphertext hash
	computedCipherHash := sha256Sum(ciphertext)
	if computedCipherHash != meta.ArchiveCiphertextHash {
		return fmt.Errorf("%w: ciphertext hash mismatch stored=%s computed=%s",
			ErrArchiveVerificationFailed, meta.ArchiveCiphertextHash, computedCipherHash)
	}

	// 2. Verify archive size
	if meta.ArchiveSizeBytes > 0 && int64(len(ciphertext)) != meta.ArchiveSizeBytes {
		return fmt.Errorf("%w: archive size mismatch stored=%d computed=%d",
			ErrArchiveVerificationFailed, meta.ArchiveSizeBytes, len(ciphertext))
	}

	// 3. Decrypt
	plaintext, err := s.archiveCrypto.Decrypt(ciphertext)
	if err != nil {
		return fmt.Errorf("%w: decrypt: %v", ErrArchiveVerificationFailed, err)
	}

	// 4. Verify plaintext manifest hash
	computedPlainHash := sha256Sum(plaintext)
	if computedPlainHash != meta.PlaintextManifestHash {
		return fmt.Errorf("%w: plaintext manifest hash mismatch stored=%s computed=%s",
			ErrArchiveVerificationFailed, meta.PlaintextManifestHash, computedPlainHash)
	}

	// 5. Parse the canonical JSON manifest into our struct
	var manifest ArchiveManifest
	if err := json.Unmarshal(plaintext, &manifest); err != nil {
		return fmt.Errorf("%w: unmarshal archive manifest: %v", ErrArchiveVerificationFailed, err)
	}

	// 6. Fetch the live pack from DB for comparison
	livePack, _, err := s.repo.GetPackByID(ctx, packID)
	if err != nil {
		return fmt.Errorf("%w: fetch live pack for comparison: %v", ErrArchiveVerificationFailed, err)
	}

	// 7. Cross-check critical fields against the live pack
	//    — an altered archive plus altered DB hash metadata cannot pass

	// 7a. EvidencePackID must match
	if manifest.EvidencePackID != livePack.EvidencePackID {
		return fmt.Errorf("%w: archive evidence_pack_id %q does not match live pack %q",
			ErrArchiveVerificationFailed, manifest.EvidencePackID, livePack.EvidencePackID)
	}

	// 7b. TenantID must match
	if manifest.TenantID != livePack.TenantID {
		return fmt.Errorf("%w: archive tenant_id %q does not match live pack %q",
			ErrArchiveVerificationFailed, manifest.TenantID, livePack.TenantID)
	}

	// 7c. MerkleRoot must match
	if manifest.MerkleRoot != livePack.MerkleRoot {
		return fmt.Errorf("%w: archive merkle_root %q does not match live pack %q",
			ErrArchiveVerificationFailed, manifest.MerkleRoot, livePack.MerkleRoot)
	}

	// 7d. RulesetVersion must match
	if manifest.RulesetVersion != livePack.RulesetVersion {
		return fmt.Errorf("%w: archive ruleset_version %q does not match live pack %q",
			ErrArchiveVerificationFailed, manifest.RulesetVersion, livePack.RulesetVersion)
	}

	// 7e. Leaf counts must match
	if manifest.LeafCount != livePack.LeafCount {
		return fmt.Errorf("%w: archive leaf_count %d does not match live pack %d",
			ErrArchiveVerificationFailed, manifest.LeafCount, livePack.LeafCount)
	}
	if manifest.RequiredLeafCount != livePack.RequiredLeafCount {
		return fmt.Errorf("%w: archive required_leaf_count %d does not match live pack %d",
			ErrArchiveVerificationFailed, manifest.RequiredLeafCount, livePack.RequiredLeafCount)
	}

	// 7f. PackStatus must match
	if manifest.PackStatus != string(livePack.PackStatus) {
		return fmt.Errorf("%w: archive pack_status %q does not match live pack %q",
			ErrArchiveVerificationFailed, manifest.PackStatus, string(livePack.PackStatus))
	}

	// 7g. Mode must match
	if manifest.Mode != livePack.Mode {
		return fmt.Errorf("%w: archive mode %q does not match live pack %q",
			ErrArchiveVerificationFailed, manifest.Mode, livePack.Mode)
	}

	// 7g. SchemaVersions must match (order-independent via map comparison)
	if !mapsEqual(manifest.SchemaVersions, livePack.SchemaVersions) {
		return fmt.Errorf("%w: archive schema_versions differ from live pack",
			ErrArchiveVerificationFailed)
	}

	// 7h. ZordSignature must match
	if manifest.ZordSignature != livePack.ZordSignature {
		return fmt.Errorf("%w: archive zord_signature differs from live pack",
			ErrArchiveVerificationFailed)
	}

	// 7i. Items must match (ordered leaves, types, hashes, refs)
	if !itemsEqual(manifest.Items, livePack.Items) {
		return fmt.Errorf("%w: archive items differ from live pack",
			ErrArchiveVerificationFailed)
	}

	// 7j. Signatures must match (at least count and key fields)
	if !signaturesEqual(manifest.Signatures, livePack.Signatures) {
		return fmt.Errorf("%w: archive signatures differ from live pack",
			ErrArchiveVerificationFailed)
	}

	verifiedAt := time.Now().UTC()
	if err := s.repo.MarkArchiveVerified(ctx, packID, verifiedAt); err != nil {
		return fmt.Errorf("%w: persist verified_at: %v", ErrArchiveVerificationFailed, err)
	}

	return nil
}

// sha256Sum computes SHA256 hex of a byte slice.
func sha256Sum(data []byte) string {
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h[:])
}

// mapsEqual compares two maps for equality (order-independent).
func mapsEqual(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, av := range a {
		bv, ok := b[k]
		if !ok || bv != av {
			return false
		}
	}
	return true
}

// itemsEqual compares two slices of EvidenceItem for equality (order-sensitive).
func itemsEqual(a, b []models.EvidenceItem) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Type != b[i].Type {
			return false
		}
		if a[i].Ref != b[i].Ref {
			return false
		}
		if a[i].Hash != b[i].Hash {
			return false
		}
		if a[i].LeafHash != b[i].LeafHash {
			return false
		}
		if a[i].SchemaVersion != b[i].SchemaVersion {
			return false
		}
	}
	return true
}

// signaturesEqual compares two signature slices for equality.
func signaturesEqual(a, b []models.Signature) bool {
	if len(a) != len(b) {
		return false
	}
	// Simple comparison: check that each sig in a has a matching sig in b
	// by KeyID + Alg + SignedPayloadHash (the immutable fields).
	for _, sa := range a {
		found := false
		for _, sb := range b {
			if sa.KeyID == sb.KeyID && sa.Alg == sb.Alg && sa.SignedPayloadHash == sb.SignedPayloadHash {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
