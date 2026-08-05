package services

import (
	"encoding/json"
	"testing"

	"zord-intent-engine/internal/models"
)

func TestDetectSourceTypeTallyHeaders(t *testing.T) {
	headers := []string{
		"Date",
		"Vch No",
		"Voucher Type",
		"Ledger Name",
		"Amt",
		"IFSC",
		"Account No",
		"Narration",
	}

	if got := DetectSourceType(headers); got != "TALLY" {
		t.Fatalf("DetectSourceType() = %q, want TALLY", got)
	}
}

func TestBuiltInTallyProfileMapsAmountHeader(t *testing.T) {
	profile := loadBuiltInMappingProfile("TALLY", models.ArtifactFamilyPayoutFile)
	if profile == nil {
		t.Fatal("expected built-in Tally profile")
	}
	if profile.ProfileID != "system-tally-v1" {
		t.Fatalf("ProfileID = %q, want system-tally-v1", profile.ProfileID)
	}

	raw := []byte(`{
		"Date": "2026-06-15T10:00:00",
		"Vch No": "VCH001",
		"Voucher Type": "Payment",
		"Ledger Name": "John Doe",
		"Amt": "1500",
		"IFSC": "HDFC0001",
		"Account No": "1234567890",
		"Narration": "Salary Payout",
		"source_row_ref": "row:1"
	}`)

	mapped, _, err := NewGenericSourceParser().ParseToCanonicalJSON(raw, profile)
	if err != nil {
		t.Fatalf("ParseToCanonicalJSON() error = %v", err)
	}

	var canonical struct {
		Amount struct {
			Value    string `json:"value"`
			Currency string `json:"currency"`
		} `json:"amount"`
		AccountNumber string `json:"account_number"`
		Beneficiary   struct {
			Name       string `json:"name"`
			Instrument struct {
				IFSC string `json:"ifsc"`
			} `json:"instrument"`
		} `json:"beneficiary"`
		ClientPayoutRef string `json:"client_payout_ref"`
		IdempotencyKey  string `json:"idempotency_key"`
		IntentType      string `json:"intent_type"`
		SourceRowRef    string `json:"source_row_ref"`
	}
	if err := json.Unmarshal(mapped, &canonical); err != nil {
		t.Fatalf("mapped JSON unmarshal error = %v", err)
	}

	if canonical.Amount.Value != "1500.00" {
		t.Fatalf("amount.value = %q, want 1500.00", canonical.Amount.Value)
	}
	if canonical.Amount.Currency != "INR" {
		t.Fatalf("amount.currency = %q, want INR", canonical.Amount.Currency)
	}
	if canonical.AccountNumber != "1234567890" {
		t.Fatalf("account_number = %q, want 1234567890", canonical.AccountNumber)
	}
	if canonical.Beneficiary.Name != "John Doe" {
		t.Fatalf("beneficiary.name = %q, want John Doe", canonical.Beneficiary.Name)
	}
	if canonical.Beneficiary.Instrument.IFSC != "HDFC0001" {
		t.Fatalf("beneficiary.instrument.ifsc = %q, want HDFC0001", canonical.Beneficiary.Instrument.IFSC)
	}
	if canonical.ClientPayoutRef != "VCH001" || canonical.IdempotencyKey != "VCH001" {
		t.Fatalf("Vch No mappings got client_payout_ref=%q idempotency_key=%q, want VCH001 for both", canonical.ClientPayoutRef, canonical.IdempotencyKey)
	}
	if canonical.IntentType != "PAYOUT" {
		t.Fatalf("intent_type = %q, want PAYOUT", canonical.IntentType)
	}
	if canonical.SourceRowRef != "row:1" {
		t.Fatalf("source_row_ref = %q, want row:1", canonical.SourceRowRef)
	}
}

func TestDetectSourceTypeDoesNotClassifyGeneralPayoutAsERP(t *testing.T) {
	headers := []string{
		"Tenant_id",
		"source_system",
		"client_batch_ref",
		"client_payout_ref",
		"invoice_id",
		"voucher_id",
		"ledger_name",
		"vendor_id",
		"vendor_name",
		"beneficiary_name",
		"beneficiary_account_number",
		"beneficiary_ifsc",
		"beneficiary_vpa",
		"amount",
		"currency",
		"payment_method",
		"rail_hint",
		"payout_purpose",
		"scheduled_execution_at",
		"expected_value_date",
		"bank_account_ref",
		"approval_ref",
		"idempotency_key",
		"remarks",
		"pan_number",
		"mcc_code",
	}

	if got := DetectSourceType(headers); got != "" {
		t.Fatalf("DetectSourceType() = %q, want empty for unconfigured general payout file", got)
	}
}

func TestAutoGenericProfileIDUsesHeaderShape(t *testing.T) {
	raw := []byte(`{
		"source_row_ref": "row:1",
		"amount": "100.00",
		"beneficiary_name": "Acme",
		"beneficiary_ifsc": "HDFC0001",
		"scheduled_execution_at": "2026-06-15"
	}`)

	got := autoGenericProfileID(raw)
	if got == "system-erp-v1" {
		t.Fatal("autoGenericProfileID returned system-erp-v1")
	}
	if len(got) != len("auto-generic-123456789abc-v1") || got[:13] != "auto-generic-" {
		t.Fatalf("autoGenericProfileID() = %q, want auto-generic-<hash>-v1", got)
	}
}
