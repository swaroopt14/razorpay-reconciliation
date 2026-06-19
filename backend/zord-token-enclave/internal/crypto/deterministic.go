package crypto

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// NormalizationVersion is included in the HMAC input so future normalization
// changes produce different token IDs, preventing silent value collisions.
const NormalizationVersion = "v1"

// NormalizeValue performs basic cleanup before hashing.
func NormalizeValue(val string) string {
	return strings.ToLower(strings.TrimSpace(val))
}

// GenerateDeterministicToken creates a stable token ID scoped to a specific
// tenant and token kind. Identical values across tenants or across kinds
// produce different token IDs.
//
// Input to HMAC:
//
//	tenantID || "|" || tokenKind || "|" || NormalizationVersion || "|" || normalizedValue
//
// This matches the target design:
//
//	HMAC(token_secret_version, tenant_id || token_kind || normalization_version || normalized_value)
func GenerateDeterministicToken(secret []byte, tenantID, tokenKind, normalizedValue string) string {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(tenantID))
	h.Write([]byte("|"))
	h.Write([]byte(tokenKind))
	h.Write([]byte("|"))
	h.Write([]byte(NormalizationVersion))
	h.Write([]byte("|"))
	h.Write([]byte(normalizedValue))
	return hex.EncodeToString(h.Sum(nil))
}
