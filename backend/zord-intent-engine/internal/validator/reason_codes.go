package validator

func MapErrorToReasonCode(err error) string {
	msg := err.Error()

	switch {
	case contains(msg, "structural"):
		return "SCHEMA_VALIDATION_FAILED"
	case contains(msg, "amount"):
		return "INVALID_AMOUNT"
	case contains(msg, "currency"):
		return "INVALID_CURRENCY"
	case contains(msg, "instrument"):
		return "INVALID_INSTRUMENT"
	default:
		return "VALIDATION_FAILED"
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (stringIndex(s, substr) >= 0)
}

// simple index helper (avoid importing strings everywhere)
func stringIndex(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
