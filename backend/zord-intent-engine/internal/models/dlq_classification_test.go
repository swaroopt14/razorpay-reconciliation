package models

import "testing"

// TestClassifyDLQ_HardStrictRequiredFieldMissing_IsManualReview covers R-09:
// a HARD_STRICT reject is a tenant-fixable file issue ("fix the file,
// resubmit"), not a system/infra fault — it must land in the same
// NEEDS_MANUAL_REVIEW bucket as the pre-existing SEMANTIC_INVALID, never
// DLQ_TERMINAL.
func TestClassifyDLQ_HardStrictRequiredFieldMissing_IsManualReview(t *testing.T) {
	if got := ClassifyDLQ("HARD_STRICT_REQUIRED_FIELD_MISSING"); got != DLQStatusManualReview {
		t.Fatalf("ClassifyDLQ(HARD_STRICT_REQUIRED_FIELD_MISSING) = %q, want %q", got, DLQStatusManualReview)
	}
}
