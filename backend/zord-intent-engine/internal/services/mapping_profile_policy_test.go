package services

import (
	"encoding/json"
	"testing"

	"zord-intent-engine/internal/models"
)

// TestComputeProfileHash_DeterministicAndContentSensitive is a Phase 3
// regression test: two profiles with identical policy content must hash
// identically regardless of profile_id/version, and any policy change must
// change the hash.
func TestComputeProfileHash_DeterministicAndContentSensitive(t *testing.T) {
	base := models.MappingProfile{
		ProfileID:                "profile-a",
		ProfileVersion:           "1.0.0",
		ColumnMap:                map[string]string{"amount.value": "Amt"},
		StrictRequiredFieldsJSON: json.RawMessage(`["client_payout_ref"]`),
		SoftInferableFieldsJSON:  json.RawMessage(`[]`),
		FieldKindPolicyJSON:      json.RawMessage(`{}`),
		SensitiveFieldPolicyJSON: json.RawMessage(`{}`),
		ValidationMode:           models.ValidationModeStrict,
	}
	renamed := base
	renamed.ProfileID = "profile-b"
	renamed.ProfileVersion = "2.0.0"

	if base.ComputeProfileHash() != renamed.ComputeProfileHash() {
		t.Fatal("expected identical policy content to hash identically regardless of profile_id/version")
	}

	changed := base
	changed.StrictRequiredFieldsJSON = json.RawMessage(`["client_payout_ref", "invoice_ref"]`)
	if base.ComputeProfileHash() == changed.ComputeProfileHash() {
		t.Fatal("expected a policy content change to change the hash")
	}
}

func TestIsFieldRequired(t *testing.T) {
	p := models.MappingProfile{
		StrictRequiredFieldsJSON: json.RawMessage(`["client_payout_ref", "provider_hint"]`),
	}
	if !p.IsFieldRequired("client_payout_ref") {
		t.Fatal("expected client_payout_ref to be required")
	}
	if p.IsFieldRequired("intended_execution_at") {
		t.Fatal("expected intended_execution_at to not be required")
	}

	empty := models.MappingProfile{}
	if empty.IsFieldRequired("anything") {
		t.Fatal("expected profile with no strict_required_fields_json to require nothing")
	}
}

// TestParseToCanonicalJSON_PreservesUnmappedFields is a Phase 3 regression
// test for ledger item #20: source columns not referenced by the profile's
// column_map must never be silently dropped.
func TestParseToCanonicalJSON_PreservesUnmappedFields(t *testing.T) {
	profile := &models.MappingProfile{
		ColumnMap: map[string]string{
			"amount.value": "Amt",
		},
		DefaultCurrency:   "INR",
		DefaultIntentType: "PAYOUT",
	}

	raw := []byte(`{"Amt": "500", "Narration": "unmapped free-text field"}`)

	_, unmapped, err := NewGenericSourceParser().ParseToCanonicalJSON(raw, profile)
	if err != nil {
		t.Fatalf("ParseToCanonicalJSON() error = %v", err)
	}
	if _, ok := unmapped["Narration"]; !ok {
		t.Fatalf("expected unmapped field 'Narration' to be preserved, got %v", unmapped)
	}
	if _, ok := unmapped["Amt"]; ok {
		t.Fatalf("expected mapped field 'Amt' to NOT appear as unmapped, got %v", unmapped)
	}
}
