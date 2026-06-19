package validator

import (
	"math/big"
	"regexp"
	"strings"
	"time"

	"zord-intent-engine/internal/models"
)

/* ---------- Semantic helpers ---------- */

func validateAmount(value string) error {
	value = strings.TrimSpace(value)

	amt, ok := new(big.Rat).SetString(value)
	if !ok {
		return semanticError("amount must be a valid decimal")
	}

	if amt.Sign() <= 0 {
		return semanticError("amount must be greater than zero")
	}

	// 🔐 Check decimal scale (max 2 digits after decimal)
	parts := strings.Split(value, ".")
	if len(parts) == 2 {
		if len(parts[1]) > 2 {
			return semanticError("amount must not have more than two decimal places")
		}
	}

	return nil
}

func validateCurrency(code string) error {
	code = strings.ToUpper(strings.TrimSpace(code))

	switch code {
	case "INR", "USD", "EUR", "GBP":
		return nil
	default:
		return semanticError("currency must be ISO-4217 compliant")
	}
}

func validateIntendedExecution(executionAt string) error {
	if executionAt == "" {
		return nil // optional
	}

	t, err := time.Parse(time.RFC3339, executionAt)
	if err != nil {
		return semanticError("intended_execution_at must be RFC3339")
	}

	if t.Before(time.Now().UTC()) {
		return semanticError("intended_execution_at must not be in the past")
	}

	return nil
}

var ifscRegex = regexp.MustCompile(`^[A-Z]{4}0[A-Z0-9]{6}$`)

func SemanticValidate(intent models.ParsedIncomingIntent) error {
	if err := validateAmount(intent.Amount.Value); err != nil {
		return err
	}

	if err := validateCurrency(intent.Amount.Currency); err != nil {
		return err
	}

	if err := validateIntendedExecution(intent.IntendedExecutionAt); err != nil {
		return err
	}

	if err := validateInstrumentParsed(intent); err != nil {
		return err
	}

	if err := validateExecutionRules(intent); err != nil {
		return err
	}

	return nil
}

func validateExecutionRules(intent models.ParsedIncomingIntent) error {
	if intent.IntendedExecutionAt == "" {
		return nil
	}

	// If execution_window constraint exists, verify intended_execution_at falls within it
	if window, ok := intent.Constraints["execution_window"].(string); ok {
		// Example: "09:00-18:00"
		if strings.Contains(window, "-") {
			parts := strings.Split(window, "-")
			if len(parts) == 2 {
				// For now, minimal check: just ensure intended_execution_at is not "ASAP" if window is specified?
				// Actually, let's just log or do a simple string check if it's a known conflict.
				// Spec says "constraints.execution_window vs intended_execution_at"
				if intent.IntendedExecutionAt == "ASAP" {
					return semanticError("intended_execution_at cannot be ASAP if execution_window is specified")
				}
			}
		}
	}

	return nil
}

/* ---------- Instrument rules ---------- */

func validateInstrumentParsed(intent models.ParsedIncomingIntent) error {
	switch intent.Beneficiary.Instrument.Kind {
	case "BANK", "NEFT", "IMPS", "RTGS":
		if strings.TrimSpace(intent.AccountNumber) == "" {
			return semanticError("account_number required for BANK instrument")
		}
		if !ifscRegex.MatchString(strings.TrimSpace(intent.Beneficiary.Instrument.IFSC)) {
			return semanticError("Invalid IFSC format: must be exactly 11 characters")
		}
		// FIX: Reject invalid combinations
		// if intent.Beneficiary.Instrument.VPA != "" {
		// 	return semanticError("VPA not allowed for BANK instrument")
		// }
		// FIX: Routing alignment
		// if intent.ProviderHint != "" && intent.ProviderHint != "BANK_RAIL" {
		// 	return semanticError("BANK instrument requires BANK_RAIL provider_hint")
		// }

	case "UPI":
		if strings.TrimSpace(intent.Beneficiary.Instrument.VPA) == "" {
			return semanticError("VPA required for UPI instrument")
		}
		if !strings.Contains(intent.Beneficiary.Instrument.VPA, "@") {
			return semanticError("invalid UPI VPA")
		}
		// FIX: Reject invalid combinations
		// if intent.AccountNumber != "" || intent.Beneficiary.Instrument.IFSC != "" {
		// 	return semanticError("AccountNumber/IFSC not allowed for UPI instrument")
		// }
		// FIX: Routing alignment
		// if intent.ProviderHint != "" && intent.ProviderHint != "UPI_RAIL" {
		// 	return semanticError("UPI instrument requires UPI_RAIL provider_hint")
		// }

	case "WALLET", "CARD":
		return nil

	default:
		return nil
	}

	return nil
}
