package canonicalizer

import (
	"strings"

	"zord-intent-engine/internal/models"
)

type MappingProfile struct {
	ProfileID   string            `json:"profile_id"`
	Version     string            `json:"version"`
	MappingRules map[string]string `json:"mapping_rules"`
	IsActive    bool              `json:"is_active"`
}

func CanonicalizeIntent(input models.ParsedIncomingIntent) models.ParsedIncomingIntent {

	out := input // copy

	// intent_type
	out.IntentType = strings.ToUpper(strings.TrimSpace(out.IntentType))

	// account_number
	out.AccountNumber = strings.TrimSpace(out.AccountNumber)
	out.Beneficiary.Name = strings.TrimSpace(out.Beneficiary.Name)

	// amount
	out.Amount.Value = normalizeAmountValue(out.Amount.Value)
	out.Amount.Currency = strings.ToUpper(strings.TrimSpace(out.Amount.Currency))

	// beneficiary.instrument.kind
	out.Beneficiary.Instrument.Kind =
		strings.ToUpper(strings.TrimSpace(out.Beneficiary.Instrument.Kind))

	// beneficiary country
	if out.Beneficiary.Country != "" {
		out.Beneficiary.Country =
			strings.ToUpper(strings.TrimSpace(out.Beneficiary.Country))
	}
	out.Remitter.Phone = strings.TrimSpace(out.Remitter.Phone)
	out.Remitter.Email = strings.ToLower(strings.TrimSpace(out.Remitter.Email))

	//  purpose_code
	out.PurposeCode = strings.ToUpper(strings.TrimSpace(out.PurposeCode))

	// idempotency_key
	out.IdempotencyKey = strings.TrimSpace(out.IdempotencyKey)

	// intended_execution_at
	out.IntendedExecutionAt = strings.TrimSpace(out.IntendedExecutionAt)

	// remitter, constraints, metadata → untouched
	return out
}

// normalization
func normalizeAmountValue(v string) string {
	v = strings.TrimSpace(v)
	v = strings.TrimLeft(v, "0")

	if v == "" {
		return "0"
	}
	return v
}
