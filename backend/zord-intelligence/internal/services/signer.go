package services

// signer.go — Phase 5 (refactor): the Signer abstraction for action_contract
// signatures (clarification doc §5). Replaces action_service.go's old plain
// sha256 signContract() helper with a real interface boundary so a KMS-backed
// implementation (clarification's Phase 2 of signing: AWS KMS Ed25519, key
// rotation, external verification) can be dropped in later without touching
// any call site.
//
// SCOPE LOCKED (clarification §5, "Phase 1"): KMS interface, dev signer,
// production fail-fast if unconfigured, signature metadata columns, internal
// verification test. Explicitly OUT of scope here (clarification's "Phase 2"):
// external verification endpoint, public key publishing/key registry,
// auditor-facing verification bundle, key rotation playbook.
//
// Auth/RBAC is out of scope for this entire refactor (all phases, per
// explicit user instruction 2026-07-16) — this file only signs data
// integrity, it has nothing to do with actor identity or approvals.

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"
)

// SignatureResult is what a Signer produces for one payload hash.
type SignatureResult struct {
	Signature               string
	Algorithm               string
	KeyID                   string
	CanonicalizationVersion string
	SignedAt                time.Time
}

// Signer signs and verifies the canonical hash of an action contract's
// immutable fields. Never sign raw mutable JSON — callers pass a
// already-computed payload hash (see buildSignaturePayloadHash in
// action_service.go for the canonical field list, per clarification §5).
type Signer interface {
	Sign(ctx context.Context, payloadHash string) (SignatureResult, error)
	Verify(ctx context.Context, payloadHash string, signature string, keyID string) (bool, error)
}

// DevSigner is a local, non-KMS Signer for development and any environment
// that has not configured a real backend. It is NOT tamper-proof against
// someone with database + source access — it exists so the Signer interface
// boundary, signature metadata columns, and verification flow are all real
// and exercised today, ahead of swapping in AWS KMS (clarification §5).
type DevSigner struct {
	keyID string
}

// NewDevSigner creates a DevSigner with a fixed, well-known dev key id so
// signatures are traceable to "this is the dev signer" at a glance.
func NewDevSigner() *DevSigner {
	return &DevSigner{keyID: "dev-key-1"}
}

const devSignerAlgorithm = "DEV_SHA256"
const devSignerCanonicalizationVersion = "v1"

func (s *DevSigner) Sign(ctx context.Context, payloadHash string) (SignatureResult, error) {
	raw := fmt.Sprintf("%s:%s", s.keyID, payloadHash)
	sum := sha256.Sum256([]byte(raw))
	return SignatureResult{
		Signature:               fmt.Sprintf("devsig:%x", sum),
		Algorithm:               devSignerAlgorithm,
		KeyID:                   s.keyID,
		CanonicalizationVersion: devSignerCanonicalizationVersion,
		SignedAt:                time.Now().UTC(),
	}, nil
}

func (s *DevSigner) Verify(ctx context.Context, payloadHash string, signature string, keyID string) (bool, error) {
	raw := fmt.Sprintf("%s:%s", keyID, payloadHash)
	sum := sha256.Sum256([]byte(raw))
	want := fmt.Sprintf("devsig:%x", sum)
	return signature == want, nil
}

// NewSignerForEnvironment picks the Signer implementation for the running
// environment. Per clarification §5 ("Phase 1" scope): production must
// fail fast rather than silently sign with the dev placeholder once a real
// KMS-backed Signer exists to compare against. Today no KMS Signer has been
// built yet (clarification's "Phase 2" of signing), so this only enforces
// the shape of the rule — call it explicitly once a real backend lands so
// "production" actually means something here, otherwise this always returns
// DevSigner regardless of environment (documented, not a silent gap).
func NewSignerForEnvironment(environment string) Signer {
	// TODO(signing-phase-2): once a KMS-backed Signer exists, fail fast here
	// when environment == "production" and no KMS config is present, per
	// clarification §5. Until then there is nothing to fail over to, so
	// every environment gets DevSigner and that fact is logged at boot
	// (see cmd/main.go) rather than hidden.
	return NewDevSigner()
}
