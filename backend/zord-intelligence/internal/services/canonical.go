package services

// canonical.go — corrective-action-report P1-05/P1-06: a single canonical
// hashing helper shared by the action idempotency key and the signature
// payload, replacing the ad-hoc pipe-delimited fmt.Sprintf concatenation
// both used before. Delimiter characters embedded in a value (e.g. a
// tenant_id or scope ref containing "|") could previously make two distinct
// inputs collide into the same hash; JSON escaping makes that impossible.
//
// WHY NOT A FULL JCS (RFC 8785) IMPLEMENTATION?
// JCS mainly exists to make map/object key ordering and numeric formatting
// deterministic. Every value hashed through this package is a fixed-shape
// Go struct (canonicalActionIdentity, canonicalSignaturePayload,
// models.ScopeRefs) — never a map — so Go's encoding/json already emits
// fields in a fixed, struct-declaration order on every call. A full JCS
// library would add a dependency to normalize edge cases (unordered nested
// maps, float formatting) that never occur here.

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
)

// canonicalHash marshals v — which must be a struct (or a value composed
// entirely of structs), never a bare map, so field order is deterministic —
// to JSON and returns the SHA-256 hex digest of the resulting bytes.
func canonicalHash(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", fmt.Errorf("canonicalHash marshal: %w", err)
	}
	sum := sha256.Sum256(b)
	return fmt.Sprintf("%x", sum), nil
}
