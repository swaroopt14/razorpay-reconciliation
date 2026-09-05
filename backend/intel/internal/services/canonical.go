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
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
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

// canonicalJSONHash is INTEL-10's counterpart to canonicalHash, for values
// that do NOT arrive as a fixed Go struct: req.InputRefsJSON/PayloadJSON are
// free-form JSON strings assembled by several different producers (the
// policy DSL's projection-metric map, sla_worker's hand-written template,
// future producers), so there is no single struct to route them through
// canonicalHash. Instead this parses to a generic normalized JSON value and
// re-encodes it, which fixes the two failure modes corrective-action-report
// INTEL-10 identified in the previous raw sha256.Sum256([]byte(raw))
// approach:
//
//  1. Key order / whitespace: encoding/json.Marshal always sorts
//     map[string]T keys and drops insignificant whitespace on decode, so
//     re-encoding a decoded value is order/whitespace-independent for free.
//  2. Array order: NOT free — JSON arrays are ordered by spec and Go
//     preserves that order through decode/re-encode. So a flat array of
//     scalars (string/number/bool/null — e.g. a reason-codes list or a
//     scope-refs list) is explicitly sorted by its own canonical encoding
//     before re-marshaling, treating it as an unordered set for hashing
//     purposes. An array containing objects or nested arrays is left in
//     place: reordering a structured/genuinely-ordered sequence (e.g. an
//     ordered breakdown of steps) is not something a generic hasher can
//     safely infer, so only flat scalar arrays get this treatment.
//
// Numbers are decoded via json.Number (UseNumber), not float64, so the
// original numeric literal's digits are preserved exactly rather than
// re-formatted — relevant given this codebase's money-precision fields.
//
// Unlike the old raw-string hash, this can fail (invalid JSON in): callers
// must treat that as a hard error, not silently hash the broken input.
func canonicalJSONHash(raw string) (string, error) {
	dec := json.NewDecoder(strings.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return "", fmt.Errorf("canonicalJSONHash: invalid JSON: %w", err)
	}

	b, err := json.Marshal(canonicalizeJSONValue(v))
	if err != nil {
		return "", fmt.Errorf("canonicalJSONHash marshal: %w", err)
	}
	sum := sha256.Sum256(b)
	return fmt.Sprintf("%x", sum), nil
}

// canonicalizeJSONValue recursively normalizes a value decoded from JSON
// (via an `any` with UseNumber), sorting flat scalar arrays in place — see
// canonicalJSONHash's doc comment for why only flat arrays are sorted.
func canonicalizeJSONValue(v any) any {
	switch val := v.(type) {
	case map[string]any:
		for k, elem := range val {
			val[k] = canonicalizeJSONValue(elem)
		}
		return val
	case []any:
		normalized := make([]any, len(val))
		allScalar := true
		for i, elem := range val {
			normalized[i] = canonicalizeJSONValue(elem)
			if !isScalarJSONValue(normalized[i]) {
				allScalar = false
			}
		}
		if allScalar {
			sortScalarJSONSlice(normalized)
		}
		return normalized
	default:
		return v
	}
}

func isScalarJSONValue(v any) bool {
	switch v.(type) {
	case map[string]any, []any:
		return false
	default:
		return true
	}
}

// sortScalarJSONSlice sorts elements by their own canonical JSON encoding,
// which orders consistently across mixed scalar types (string/json.Number/
// bool/nil) without needing type-specific comparison logic.
//
// Sorts a slice of (encoding, element) pairs together rather than sorting
// elems directly against a parallel encoded[] slice — sort.SliceStable only
// permutes the slice passed to it, so a separate parallel array would drift
// out of sync with elems as swaps happen.
func sortScalarJSONSlice(elems []any) {
	type pair struct {
		encoded []byte
		value   any
	}
	pairs := make([]pair, len(elems))
	for i, elem := range elems {
		b, err := json.Marshal(elem)
		if err != nil {
			// Scalars (string/json.Number/bool/nil) always marshal
			// successfully; this branch is unreachable in practice.
			return
		}
		pairs[i] = pair{encoded: b, value: elem}
	}
	sort.SliceStable(pairs, func(i, j int) bool {
		return bytes.Compare(pairs[i].encoded, pairs[j].encoded) < 0
	})
	for i, p := range pairs {
		elems[i] = p.value
	}
}
