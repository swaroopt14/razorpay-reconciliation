package validator

// ValidationError is a typed domain error used by validation logic.
// It carries a stable, spec-compliant reason code.
type ValidationError struct {
	Code string
	Msg  string
}

func (e ValidationError) Error() string {
	return e.Msg
}

/* ---------- Constructors ---------- */

// SCHEMA validation failures
func schemaError(msg string) error {
	return ValidationError{
		Code: "SCHEMA_INVALID",
		Msg:  msg,
	}
}

// SEMANTIC validation failures
func semanticError(msg string) error {
	return ValidationError{
		Code: "SEMANTIC_INVALID",
		Msg:  msg,
	}
}

// corridorError reuses the same reason code the preguard corridor check used
// to emit ("TENANT_CORRIDOR_NOT_ALLOWED"), so existing DLQ dashboards/filters
// keyed on that code keep working even though the check now runs earlier.
func corridorError(msg string) error {
	return ValidationError{
		Code: "TENANT_CORRIDOR_NOT_ALLOWED",
		Msg:  msg,
	}
}
