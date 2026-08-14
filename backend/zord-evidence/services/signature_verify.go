package services

import (
	"time"
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"zord-evidence/models"
	"zord-evidence/utils"
)

// ErrSignatureVerificationFailed is returned when Level 2 signature
// verification positively fails — the recorded signature does not verify
// against this deployment's trusted signing key.
var ErrSignatureVerificationFailed = errors.New("signature verification failed")

// ErrSignatureNotAvailable is returned when there is nothing to verify:
// signing isn't configured on this deployment, the pack has no recorded
// signature, or its signature predates SignedPayload being persisted (a
// legacy pack whose original signed bytes were never stored and can never be
// exactly reconstructed — see Signature.SignedPayload doc comment). Every
// error returned by VerifyPackSignature also satisfies
// errors.Is(err, ErrSignatureVerificationFailed) via double-wrapping, same
// pattern as archive_verify.go, so callers that only care about "did it
// verify" don't need special-case handling.
var ErrSignatureNotAvailable = errors.New("signature not available for verification")

// VerifyPackSignature independently re-verifies the pack's recorded ed25519
// signature. Deliberately does not read pack.Signatures[0].KeyID to select
// the verification key — it always verifies against this deployment's own
// trusted signer.PublicKey(). If the DB row's key_id doesn't match, that's
// itself a finding (FAILED), not something to trust: a compromised database
// could otherwise swap the payload, signature, AND key_id together and still
// "verify" against whatever forged key it also supplied.
//
// Pure and side-effect free — pack.Signatures is already loaded by GetPack,
// so this needs no DB round trip. Callers that want to persist the outcome
// use EnrichmentRepository.MarkVerified, which already cascades to
// evidence_pack_signatures.verification_status on overall success.
// VerifyPackSignature independently re-verifies the pack's recorded ed25519
// signature. It binds the signature to the current pack content by reconstructing
// a canonical manifest and comparing its digest to the stored SignedPayloadHash
// before verifying the ed25519 signature. This prevents a DB attacker from altering
// pack metadata/items/root while an unrelated old signed payload still verifies.
func (s *EvidenceService) VerifyPackSignature(pack *models.EvidencePack) error {
	if s.signer == nil {
		return fmt.Errorf("%w: %w: signing key not configured on this deployment", ErrSignatureVerificationFailed, ErrSignatureNotAvailable)
	}
	if len(pack.Signatures) == 0 {
		return fmt.Errorf("%w: %w: pack has no recorded signature", ErrSignatureVerificationFailed, ErrSignatureNotAvailable)
	}

	sig := pack.Signatures[0]

	if sig.SignedPayload == "" {
		return fmt.Errorf("%w: %w: signature predates payload-preserving signing (legacy pack) and cannot be independently re-verified",
			ErrSignatureVerificationFailed, ErrSignatureNotAvailable)
	}
	if sig.Alg != "ed25519" {
		return fmt.Errorf("%w: unsupported signature algorithm %q", ErrSignatureVerificationFailed, sig.Alg)
	}

	// Step 1: Reconstruct canonical manifest from current pack state
	manifest := reconstructPackManifest(pack)

	// Step 2: Compute digest and compare to stored hash
	canonicalBytes := []byte(strings.Join([]string{
		pack.EvidencePackID,
		pack.MerkleRoot,
		manifest.ScopeID,
		pack.CreatedAt.Format(time.RFC3339Nano),
		pack.RulesetVersion,
	}, "|"))
	computedHash := utils.SHA256Hex(string(canonicalBytes))

	if sig.SignedPayloadHash != "" && computedHash != sig.SignedPayloadHash {
		return fmt.Errorf("%w: current pack content hash %q does not match stored signed_payload_hash %q",
			ErrSignatureVerificationFailed, computedHash, sig.SignedPayloadHash)
	}

	sigBytes, err := decodeZordSignature(sig.Sig)
	if err != nil {
		return fmt.Errorf("%w: decode signature value: %v", ErrSignatureVerificationFailed, err)
	}

	if !ed25519.Verify(s.signer.PublicKey(), []byte(sig.SignedPayload), sigBytes) {
		return fmt.Errorf("%w: ed25519 signature does not verify against the stored payload and trusted key", ErrSignatureVerificationFailed)
	}

	return nil
}

// reconstructPackManifest recreates the canonical manifest fields from
// current pack state. Binds the signature to Merkle root and metadata.
func reconstructPackManifest(pack *models.EvidencePack) models.PackManifestV1 {
	scopeID := pack.IntentID
	if scopeID == "" {
		scopeID = pack.ClientBatchID
	}
	return models.PackManifestV1{
		EvidencePackID: pack.EvidencePackID,
		TenantID:       pack.TenantID,
		MerkleRoot:     pack.MerkleRoot,
		ScopeID:        scopeID,
		CreatedAt:      pack.CreatedAt.Format(time.RFC3339Nano),
		RulesetVersion: pack.RulesetVersion,
	}
}


// decodeZordSignature reverses Signer.Sign: strips the "ZORD" prefix and
// base64-decodes the remainder into raw ed25519 signature bytes.
func decodeZordSignature(sig string) ([]byte, error) {
	const prefix = "ZORD"
	if !strings.HasPrefix(sig, prefix) {
		return nil, fmt.Errorf("signature value missing %q prefix", prefix)
	}
	return base64.StdEncoding.DecodeString(strings.TrimPrefix(sig, prefix))
}
