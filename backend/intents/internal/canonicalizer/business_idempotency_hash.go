package canonicalizer

import (
	"strings"

	"zord-intent-engine/internal/jcs"
)

// BusinessIdempotencyHashInput holds the fields for the "preferred" formula
// — used when the customer supplies a reliable unique payout reference.
type BusinessIdempotencyHashInput struct {
	TenantID        string
	SourceSystem    string
	ClientPayoutRef string
	AmountMinor     int64
	Currency        string
}

// ComputeBusinessIdempotencyHash returns
// business_idempotency_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...preferred fields}))
func ComputeBusinessIdempotencyHash(in BusinessIdempotencyHashInput) (string, error) {
	fields := map[string]any{
		"hash_type":         "BUSINESS_IDEMPOTENCY",
		"hash_version":      "1",
		"tenant_id":         in.TenantID,
		"source_system":     strings.ToUpper(strings.TrimSpace(in.SourceSystem)),
		"client_payout_ref": strings.TrimSpace(in.ClientPayoutRef),
		"amount_minor":      in.AmountMinor,
		"currency":          strings.ToUpper(strings.TrimSpace(in.Currency)),
	}
	return jcs.CanonicalizeAndSHA256(fields)
}

// BusinessIdempotencyFallbackHashInput holds the fields for the "fallback"
// formula — used only when there is no reliable unique payment reference.
// This should normally produce a possible-duplicate warning, not an
// automatic hard rejection, since two legitimate payments may share the same
// beneficiary and amount.
type BusinessIdempotencyFallbackHashInput struct {
	TenantID               string
	BeneficiaryFingerprint string
	AmountMinor            int64
	Currency               string
	ExecutionDate          string
	InvoiceRef             string
	PurposeCode            string
}

// ComputeBusinessIdempotencyFallbackHash returns
// business_idempotency_fallback_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...fallback fields}))
func ComputeBusinessIdempotencyFallbackHash(in BusinessIdempotencyFallbackHashInput) (string, error) {
	fields := map[string]any{
		"hash_type":               "BUSINESS_IDEMPOTENCY_FALLBACK",
		"hash_version":            "1",
		"tenant_id":               in.TenantID,
		"beneficiary_fingerprint": in.BeneficiaryFingerprint,
		"amount_minor":            in.AmountMinor,
		"currency":                strings.ToUpper(strings.TrimSpace(in.Currency)),
		"execution_date":          in.ExecutionDate,
		"invoice_ref":             strings.TrimSpace(in.InvoiceRef),
		"purpose_code":            strings.ToUpper(strings.TrimSpace(in.PurposeCode)),
	}
	return jcs.CanonicalizeAndSHA256(fields)
}

// IsReliableClientPayoutRef reports whether ref is a real, usable payout
// reference for the preferred business-idempotency formula (as opposed to
// empty or the "NA" sentinel some sources send).
func IsReliableClientPayoutRef(ref string) bool {
	ref = strings.TrimSpace(ref)
	return ref != "" && ref != "NA"
}
