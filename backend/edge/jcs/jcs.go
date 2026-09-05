// Package jcs provides deterministic JSON canonicalization and hashing for
// the tamper-evidence hashes computed at ingest time (raw_row_hash and
// friends). Mirrors zord-intent-engine/internal/jcs so both services produce
// byte-identical output for the same hash spec.
package jcs

import (
	"bytes"
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

// CanonicalizeAndSHA256 is a convenience wrapper: Canonicalize(v) then
// SHA256Hex of the result.
func CanonicalizeAndSHA256(v any) (string, error) {
	b, err := Canonicalize(v)
	if err != nil {
		return "", err
	}
	return SHA256Hex(b), nil
}
