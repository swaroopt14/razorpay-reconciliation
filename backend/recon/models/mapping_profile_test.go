package models

import (
	"testing"
)

func TestGetProfileRazorpay(t *testing.T) {
	p, ok := GetProfile("razorpay")
	if !ok {
		t.Fatal("expected to find razorpay profile")
	}
	if p.ProfileID != "razorpay-recon-v1" {
		t.Errorf("expected profile_id=razorpay-recon-v1, got %s", p.ProfileID)
	}
	if p.SourceSystem != "razorpay" {
		t.Errorf("expected source_system=razorpay, got %s", p.SourceSystem)
	}
	if p.ArtifactFamily != "PSP_SETTLEMENT_RECON" {
		t.Errorf("expected artifact_family=PSP_SETTLEMENT_RECON, got %s", p.ArtifactFamily)
	}
	if p.ParserKey != "razorpay" {
		t.Errorf("expected parser_key=razorpay, got %s", p.ParserKey)
	}
	if p.FileExtension != ".xlsx" {
		t.Errorf("expected file_extension=.xlsx, got %s", p.FileExtension)
	}
}

func TestGetProfileCashfree(t *testing.T) {
	p, ok := GetProfile("cashfree")
	if !ok {
		t.Fatal("expected to find cashfree profile")
	}
	if p.ProfileID != "cashfree-settlement-v1" {
		t.Errorf("expected profile_id=cashfree-settlement-v1, got %s", p.ProfileID)
	}
	if p.FileExtension != ".csv" {
		t.Errorf("expected file_extension=.csv, got %s", p.FileExtension)
	}
}

func TestGetProfileUnknown(t *testing.T) {
	_, ok := GetProfile("stripe")
	if ok {
		t.Error("expected not to find unknown profile")
	}
}

func TestGetProfileEmpty(t *testing.T) {
	_, ok := GetProfile("")
	if ok {
		t.Error("expected not to find profile for empty key")
	}
}

func TestKnownProfilesContainsRazorpay(t *testing.T) {
	if _, ok := KnownProfiles["razorpay"]; !ok {
		t.Error("KnownProfiles should contain razorpay")
	}
}

func TestKnownProfilesContainsCashfree(t *testing.T) {
	if _, ok := KnownProfiles["cashfree"]; !ok {
		t.Error("KnownProfiles should contain cashfree")
	}
}

func TestRazorpayProfilePIIFields(t *testing.T) {
	p := KnownProfiles["razorpay"]
	if len(p.PIIFields) == 0 {
		t.Error("razorpay profile should have PII fields defined")
	}
	expectedFields := []string{"account_number", "ifsc", "vpa", "name", "phone", "email"}
	for _, field := range expectedFields {
		found := false
		for _, f := range p.PIIFields {
			if f == field {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("razorpay profile missing PII field: %s", field)
		}
	}
}
