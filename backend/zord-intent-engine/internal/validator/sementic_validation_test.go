package validator

import "testing"

// TestValidateCurrency_INROnlySingleSourceOfTruth is a Phase 4 regression
// test for ledger item #9: currency policy must be enforced once, at the
// semantic-validation stage, instead of passing here only to be rejected
// later by guards.RunPreGuards with a different stage/duplicate check.
func TestValidateCurrency_INROnlySingleSourceOfTruth(t *testing.T) {
	if err := validateCurrency("INR"); err != nil {
		t.Fatalf("expected INR to pass, got error: %v", err)
	}
	if err := validateCurrency("inr"); err != nil {
		t.Fatalf("expected lowercase inr to pass, got error: %v", err)
	}

	for _, code := range []string{"USD", "EUR", "GBP"} {
		err := validateCurrency(code)
		if err == nil {
			t.Fatalf("expected %s to be rejected", code)
		}
		ve, ok := err.(ValidationError)
		if !ok {
			t.Fatalf("expected ValidationError for %s, got %T", code, err)
		}
		if ve.Code != "TENANT_CORRIDOR_NOT_ALLOWED" {
			t.Fatalf("expected reason code TENANT_CORRIDOR_NOT_ALLOWED for %s (to preserve existing DLQ classification), got %q", code, ve.Code)
		}
	}
}
