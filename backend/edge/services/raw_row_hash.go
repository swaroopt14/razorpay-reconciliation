package services

import (
	"encoding/base64"

	"zord-edge/jcs"
)

// ComputeRawRowHash returns
// raw_row_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, raw_row_base64}))
// for the exact original row bytes (pre-canonicalization, pre-encryption) —
// the same bytes already hashed plain-SHA256 into payload_hash.
func ComputeRawRowHash(exactOriginalRowBytes []byte) (string, error) {
	fields := map[string]any{
		"hash_type":      "RAW_ROW",
		"hash_version":   "1",
		"raw_row_base64": base64.StdEncoding.EncodeToString(exactOriginalRowBytes),
	}
	return jcs.CanonicalizeAndSHA256(fields)
}
