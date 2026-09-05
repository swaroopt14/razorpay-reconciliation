package validator

import (
	"zord-intent-engine/internal/models"
)

func StructuralValidate(intent models.ParsedIncomingIntent) error {
	if intent.IntentType == "" {
		return schemaError("intent_type is required")
	}

	// if intent.AccountNumber == "" {
	// 	return schemaError("account_number is required")
	// }

	if intent.Amount.Value == "" || intent.Amount.Currency == "" {
		return schemaError("amount.value and amount.currency are required")
	}

	// if intent.Beneficiary.Instrument.Kind == "" {
	// 	return schemaError("beneficiary.instrument.kind is required")
	// }

	return nil
}
