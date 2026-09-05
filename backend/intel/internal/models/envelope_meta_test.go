package models

import "testing"

// corrective-action-report P1-01: unknown major schema versions must be
// rejected (routed to DLQ by the caller) while missing/legacy/known values
// are accepted.
func TestIsKnownSchemaVersion(t *testing.T) {
	tests := []struct {
		name string
		v    string
		want bool
	}{
		{"empty accepted (producer doesn't send it yet)", "", true},
		{"legacy accepted", DefaultEventVersion, true},
		{"known v1 accepted", "v1", true},
		{"unknown v2 rejected", "v2", false},
		{"garbage rejected", "not-a-version", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsKnownSchemaVersion(tt.v); got != tt.want {
				t.Errorf("IsKnownSchemaVersion(%q) = %v, want %v", tt.v, got, tt.want)
			}
		})
	}
}
