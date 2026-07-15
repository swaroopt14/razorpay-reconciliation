package canonicalizer

import (
	"crypto/hmac"
	"crypto/sha256"

	"zord-intent-engine/internal/jcs"
)

// TokenizationPolicyVersion is the static version tag hashed into
// tokenized_data_hash. Bump it if the set of tokenized fields changes.
const TokenizationPolicyVersion = "1"

// DeriveTenantScopedKey derives a per-tenant HMAC key from a master secret,
// so no per-tenant key needs to be stored anywhere — HMAC-SHA256(masterSecret, tenantID).
func DeriveTenantScopedKey(masterSecret, tenantID string) []byte {
	h := hmac.New(sha256.New, []byte(masterSecret))
	h.Write([]byte(tenantID))
	return h.Sum(nil)
}

// TokenizedDataHashInput holds the tenant-scoped tokenized beneficiary
// details attached to an intent. Empty token fields are hashed as JSON null,
// matching the hash spec's example.
type TokenizedDataHashInput struct {
	TenantID             string
	BeneficiaryNameToken string
	AccountNumberToken   string
	IFSCToken            string
	VPAToken             string
	EmailToken           string
	PhoneToken           string
}

func nullableToken(v string) any {
	if v == "" {
		return nil
	}
	return v
}

// ComputeTokenizedDataHash returns
// tokenized_data_hash = HMAC-SHA256(tenant_scoped_hash_key, JCS_Canonicalize({...tokens}))
func ComputeTokenizedDataHash(tenantScopedKey []byte, in TokenizedDataHashInput) (string, error) {
	fields := map[string]any{
		"hash_type":                   "TOKENIZED_DATA",
		"hash_version":                "1",
		"tenant_id":                   in.TenantID,
		"beneficiary_name_token":      nullableToken(in.BeneficiaryNameToken),
		"account_number_token":        nullableToken(in.AccountNumberToken),
		"ifsc_token":                  nullableToken(in.IFSCToken),
		"vpa_token":                   nullableToken(in.VPAToken),
		"email_token":                 nullableToken(in.EmailToken),
		"phone_token":                 nullableToken(in.PhoneToken),
		"tokenization_policy_version": TokenizationPolicyVersion,
	}
	return jcs.CanonicalizeAndHMACSHA256(tenantScopedKey, fields)
}
