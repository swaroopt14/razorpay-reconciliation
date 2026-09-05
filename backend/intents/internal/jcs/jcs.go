// Package jcs provides deterministic JSON canonicalization and hashing
// helpers shared by every hash spec in this service (canonical_row_hash,
// canonical_payload_manifest_hash, mapping_profile_hash, business_idempotency
// hashes, tokenized_data_hash, governance hashes, evidence leaf hashes).
//
// This package has no internal dependencies so it can be imported from both
// internal/models and internal/canonicalizer without creating an import
// cycle.
package jcs

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// Canonicalize serializes v into a deterministic JSON byte sequence: object
// keys sorted (Go's encoding/json sorts map[string]any keys
// lexicographically), no insignificant whitespace, and no HTML-escaping.
// This matches RFC 8785 (JCS) output for the flat, ASCII-keyed objects
// hashed across this service.
func Canonicalize(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// SHA256Hex returns the hex-encoded SHA-256 digest of data.
func SHA256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// HMACSHA256Hex returns the hex-encoded HMAC-SHA256 of data keyed by key.
func HMACSHA256Hex(key, data []byte) string {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

// CanonicalizeAndSHA256 is a convenience wrapper: Canonicalize(v) then
// SHA256Hex of the result.
func CanonicalizeAndSHA256(v any) (string, error) {
	b, err := Canonicalize(v)
	if err != nil {
		return "", err
	}
	return SHA256Hex(b), nil
}

// CanonicalizeAndHMACSHA256 is a convenience wrapper: Canonicalize(v) then
// HMACSHA256Hex of the result keyed by key.
func CanonicalizeAndHMACSHA256(key []byte, v any) (string, error) {
	b, err := Canonicalize(v)
	if err != nil {
		return "", err
	}
	return HMACSHA256Hex(key, b), nil
}
