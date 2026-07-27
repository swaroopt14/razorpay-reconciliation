package utils

import (
	"crypto/sha256"
	"encoding/hex"
)

// SHA256Hex returns the hex-encoded SHA-256 digest of a string.
func SHA256Hex(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:])
}

// SHA256Bytes returns the hex-encoded SHA-256 digest of a raw byte slice.
// Used by the Merkle domain-separation scheme (V2) where the input is
// assembled as a byte slice with a domain-prefix byte rather than a string.
func SHA256Bytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
