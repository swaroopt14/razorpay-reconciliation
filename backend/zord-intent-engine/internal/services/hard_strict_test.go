package services

import (
	"testing"

	"zord-intent-engine/internal/models"
)

// R-09: HARD_STRICT is an explicit per-tenant opt-in (mapping_profiles.
// validation_mode) that hard-rejects a missing required field instead of the
// REVIEW_STRICT/default hold-for-review path. These tests exercise
// applyHardStrictReject directly (factored out of processIncomingIntentInternal
// specifically so this branch doesn't require standing up a full
// IntentService with live S3/Kafka/DB — same rationale as R-03's
// callWithRetry extraction).

func TestApplyHardStrictReject_HardStrictProfileWithGap_Rejects(t *testing.T) {
	profile := &models.MappingProfile{ValidationMode: models.ValidationModeHardStrict}
	gov := &models.Governance{SemanticValid: true, PolicyFlags: []string{}, MissingFields: []string{}}

	rejected := applyHardStrictReject(profile, 2, []string{"client_batch_ref", "provider_hint"}, gov)

	if !rejected {
		t.Fatal("expected applyHardStrictReject to report a reject for a HARD_STRICT profile with a required-field gap")
	}
	if gov.SemanticValid {
		t.Fatal("expected SemanticValid=false after a HARD_STRICT reject")
	}
	wantFields := map[string]bool{"client_batch_ref": true, "provider_hint": true}
	if len(gov.MissingFields) != len(wantFields) {
		t.Fatalf("expected MissingFields=%v, got %v", wantFields, gov.MissingFields)
	}
	for _, f := range gov.MissingFields {
		if !wantFields[f] {
			t.Fatalf("unexpected field in MissingFields: %q (got %v)", f, gov.MissingFields)
		}
	}
	found := false
	for _, flag := range gov.PolicyFlags {
		if flag == "HARD_STRICT_REQUIRED_FIELD_MISSING" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected PolicyFlags to contain HARD_STRICT_REQUIRED_FIELD_MISSING, got %v", gov.PolicyFlags)
	}
}

// TestApplyHardStrictReject_ReviewStrictProfileWithGap_NoChange proves
// REVIEW_STRICT (the migrated-from-STRICT default) sees zero behavior
// change: the existing hold-for-review path (driven separately by
// nir.RequiredFieldGapCount feeding GovernanceState=FLAGGED) is untouched.
func TestApplyHardStrictReject_ReviewStrictProfileWithGap_NoChange(t *testing.T) {
	profile := &models.MappingProfile{ValidationMode: models.ValidationModeReviewStrict}
	gov := &models.Governance{SemanticValid: true, PolicyFlags: []string{}, MissingFields: []string{}}

	rejected := applyHardStrictReject(profile, 2, []string{"client_batch_ref"}, gov)

	if rejected {
		t.Fatal("expected no reject for a REVIEW_STRICT profile — must fall through to the existing hold-for-review path")
	}
	if !gov.SemanticValid {
		t.Fatal("expected SemanticValid to remain true for REVIEW_STRICT")
	}
	if len(gov.MissingFields) != 0 || len(gov.PolicyFlags) != 0 {
		t.Fatalf("expected no governance mutation for REVIEW_STRICT, got MissingFields=%v PolicyFlags=%v", gov.MissingFields, gov.PolicyFlags)
	}
}

func TestApplyHardStrictReject_HardStrictProfileNoGap_NoChange(t *testing.T) {
	profile := &models.MappingProfile{ValidationMode: models.ValidationModeHardStrict}
	gov := &models.Governance{SemanticValid: true, PolicyFlags: []string{}, MissingFields: []string{}}

	rejected := applyHardStrictReject(profile, 0, nil, gov)

	if rejected {
		t.Fatal("expected no reject when there is no required-field gap, even under HARD_STRICT")
	}
	if !gov.SemanticValid {
		t.Fatal("expected SemanticValid to remain true when there's nothing to reject")
	}
}

func TestApplyHardStrictReject_NilProfile_NoChange(t *testing.T) {
	gov := &models.Governance{SemanticValid: true, PolicyFlags: []string{}, MissingFields: []string{}}

	// nil resolvedProfile happens whenever no mapping profile matched
	// (generic/unregistered source) — must never panic or reject.
	rejected := applyHardStrictReject(nil, 3, []string{"client_batch_ref"}, gov)

	if rejected {
		t.Fatal("expected no reject when there is no resolved profile at all")
	}
	if !gov.SemanticValid {
		t.Fatal("expected SemanticValid to remain true with no resolved profile")
	}
}
