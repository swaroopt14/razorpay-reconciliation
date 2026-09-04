package services

// signer.go — Phase 5 (refactor): the Signer abstraction for action_contract
// signatures (clarification doc §5). Replaces action_service.go's old plain
// sha256 signContract() helper with a real interface boundary so a KMS-backed
// implementation (clarification's Phase 2 of signing: AWS KMS Ed25519, key
// rotation, external verification) can be dropped in later without touching
// any call site.
//
// SCOPE LOCKED (clarification §5, "Phase 1"): KMS interface, dev signer,
// signature metadata columns, internal verification test. Explicitly OUT of
// scope here (clarification's "Phase 2"): external verification endpoint,
// public key publishing/key registry, auditor-facing verification bundle,
// key rotation playbook.
//
// PRODUCTION-WITHOUT-SIGNER BEHAVIOR: corrective-action-report P0-07
// (2026-07-29) made NewSignerForEnvironment log.Fatal when
// environment=production had no real signer, so no financial action could
// ever be signed by a fake digest. INTEL-09 (2026-08-19) narrowed that:
// crashing the whole process also took down recommendation/projection
// intelligence, which never needed a signer at all. NewSignerForEnvironment
// now returns (nil, ErrNoProductionSigner) instead of crashing; the actual
// fail-closed enforcement moved to action_service.go's mayActuate check,
// which is the part that actually needs it.
//
// Auth/RBAC is out of scope for this entire refactor (all phases, per
// explicit user instruction 2026-07-16) — this file only signs data
// integrity, it has nothing to do with actor identity or approvals. A real
// KMS-backed Signer plus RBAC-authorized action publication is expected to
// land later from upstream; this file's job is only to make sure the
// service degrades safely (recommendation-only) until then.

import (
	"context"
	"crypto/sha256"
	"errors"
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

// unsignedIntegrityDigestAlgorithm and unsignedIntegrityDigestKeyID mark a
// contract that was created with NO Signer configured at all (production,
// pre-KMS — see ErrNoProductionSigner). Distinct from devSignerAlgorithm so
// the two "not a real signature" states are never confused in stored data:
// DEV_SHA256 means "a dev signer was deliberately used" (non-prod);
// UNSIGNED_NO_SIGNER means "no signer was available when this was created"
// (prod, actuation-blocked path — see action_service.go resolveSignature).
const unsignedIntegrityDigestAlgorithm = "UNSIGNED_NO_SIGNER"
const unsignedIntegrityDigestKeyID = "none"

// unsignedIntegrityDigest produces a placeholder SignatureResult for
// non-actuating (advisory/audit-only) ActionContracts created while no
// Signer is configured. It carries no authenticity property whatsoever —
// callers must never use it for anything that reaches the actuation outbox
// (see mayActuate in action_service.go, which is what keeps this off the
// money-impacting path).
func unsignedIntegrityDigest(payloadHash string) SignatureResult {
	sum := sha256.Sum256([]byte(payloadHash))
	return SignatureResult{
		Signature:               fmt.Sprintf("unsigned:%x", sum),
		Algorithm:               unsignedIntegrityDigestAlgorithm,
		KeyID:                   unsignedIntegrityDigestKeyID,
		CanonicalizationVersion: devSignerCanonicalizationVersion,
		SignedAt:                time.Now().UTC(),
	}
}

// ErrNoProductionSigner is returned by NewSignerForEnvironment when running
// in environment=production with no KMS-backed Signer configured. Callers
// (cmd/main.go) must NOT treat this as fatal — see INTEL-09: the service
// should still boot and serve recommendations/projections with signer=nil;
// only the actuation subsystem (action_service.go CreateAction, gated by
// mayActuate) must fail closed when it sees a nil signer.
var ErrNoProductionSigner = errors.New(
	"no KMS/Vault-backed Signer configured for environment=production — " +
		"DevSigner is a plain SHA-256 integrity digest, not a cryptographic " +
		"signature, and must never be used to authorize money-impacting " +
		"actions in production; actuation is disabled until a real signer is wired in")

// NewSignerForEnvironment picks the Signer implementation for the running
// environment.
//
// INTEL-09 (P1): this used to log.Fatal — and take the entire service down,
// recommendations included — when environment=production had no real signer
// configured (corrective-action-report P0-07). That blast radius was too
// wide: it either forces total downtime or tempts a team into weakening the
// check just to deploy. Now it returns (nil, ErrNoProductionSigner) instead,
// and the caller decides what that means per-subsystem: recommendation/
// projection intelligence has no business needing a signer and must keep
// working (main.go boots unconditionally); the actuation subsystem must
// fail closed on every attempt to publish a money-impacting action
// (action_service.go CreateAction refuses when mayActuate && signer==nil).
//
// No KMS-backed Signer exists yet (clarification's "Phase 2" of signing).
// When one is built, wire it in here for environment=="production" instead
// of returning ErrNoProductionSigner.
func NewSignerForEnvironment(environment string) (Signer, error) {
	if environment == "production" {
		return nil, ErrNoProductionSigner
	}
	// Non-production: DevSigner is fine, and the boot log (cmd/main.go)
	// already labels it as integrity-only / DEV_SHA256, never "signed".
	return NewDevSigner(), nil
}
