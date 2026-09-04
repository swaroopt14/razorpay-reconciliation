package services

import (
	"crypto/sha256"
	"fmt"
	"strings"
	"zord-evidence/models"
)

// MaskingLevel controls how aggressively PII is suppressed.
type MaskingLevel int

const (
	// MaskingLevelBusiness is used for finance summary and general business-facing
	// layouts. Account numbers, routing codes, and consumer IDs are tokenised.
	MaskingLevelBusiness MaskingLevel = iota

	// MaskingLevelAudit is used for compliance / audit packs — technical hashes
	// are preserved but raw PII strings are still masked.
	MaskingLevelAudit

	// MaskingLevelFull returns all data unmasked. Only for admin-permissioned callers.
	MaskingLevelFull
)

// piiLeafTypes are leaf types whose item_ref values may contain account numbers,
// UTR codes, or other consumer-identifiable references. Per spec §8 these must
// be tokenised for business-facing outputs.
var piiLeafTypes = map[string]bool{
	models.LeafTypeRawSettlementLine:              true,
	models.LeafTypeCanonicalSettlementObservation: true,
	models.LeafTypeRawSettlementFile:              true,
}

// MaskItemRef replaces the item_ref with a deterministic SHA-256 token so that
// the same ref always produces the same token (stable across export calls) while
// making the original value unrecoverable without the pre-image.
func MaskItemRef(ref string) string {
	sum := sha256.Sum256([]byte(ref))
	return "tkn_" + fmt.Sprintf("%x", sum[:8])
}

// MaskUTR obfuscates a UTR/RRN by showing only the last 4 characters.
func MaskUTR(utr string) string {
	if len(utr) <= 4 {
		return strings.Repeat("*", len(utr))
	}
	return strings.Repeat("*", len(utr)-4) + utr[len(utr)-4:]
}

// MaskAccountNumber obfuscates a bank account number leaving only last 4 digits.
// func MaskAccountNumber(acc string) string {
// 	digits := strings.Map(func(r rune) rune {
// 		if r >= '0' && r <= '9' {
// 			return r
// 		}
// 		return -1
// 	}, acc)
// 	if len(digits) <= 4 {
// 		return "****"
// 	}
// 	return strings.Repeat("*", len(digits)-4) + digits[len(digits)-4:]
// }

// MaskEvidenceItems applies the appropriate masking level to a slice of
// EvidenceItems for business-facing serialisation.
func MaskEvidenceItems(items []models.EvidenceItem, level MaskingLevel) []models.MaskedEvidenceItem {
	out := make([]models.MaskedEvidenceItem, 0, len(items))
	for _, item := range items {
		ref := item.Ref
		if level < MaskingLevelFull && piiLeafTypes[item.Type] {
			ref = MaskItemRef(item.Ref)
		}
		out = append(out, models.MaskedEvidenceItem{
			Type:          item.Type,
			Ref:           ref,
			SchemaVersion: item.SchemaVersion,
			LeafHash:      item.LeafHash,
		})
	}
	return out
}
