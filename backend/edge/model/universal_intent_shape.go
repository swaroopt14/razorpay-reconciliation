package model

import "time"

// UniversalIntentShape is the canonical nested structure expected by the zord-intent-engine.
// This model is a 1:1 mirror of models.ParsedIncomingIntent in Service 2.
type UniversalIntentShape struct {
	SchemaVersion       string         `json:"schema_version"`
	IntentType          string         `json:"intent_type"`
	AccountNumber       string         `json:"account_number"`
	Amount              Amount         `json:"amount"`
	Beneficiary         Beneficiary    `json:"beneficiary"`
	Remitter            Remitter       `json:"remitter,omitempty"`
	Constraints         map[string]any `json:"constraints,omitempty"`
	PurposeCode         string         `json:"purpose_code"`
	IdempotencyKey      string         `json:"idempotency_key"`
	ClientBatchRef      string         `json:"client_batch_ref,omitempty"`
	ClientPayoutRef     string         `json:"client_payout_ref,omitempty"`
	ProviderHint        string         `json:"provider_hint,omitempty"`
	HSNSACCode          string         `json:"hsn_sac_code,omitempty"`
	IntendedExecutionAt string         `json:"intended_execution_at,omitempty"`
	Source              string         `json:"source,omitempty"`
	SourceSystem        string         `json:"source_system,omitempty"`
	GovernanceHash      string         `json:"governance_hash,omitempty"`
	IntentID            string         `json:"intent_id,omitempty"`
	PayloadHash         string         `json:"payload_hash,omitempty"`
	SourceRowRef        string         `json:"source_row_ref,omitempty"`

	ParseConfidence     float64        `json:"parse_confidence,omitempty"`
	GatewayName         string         `json:"gateway_name,omitempty"`
	FundAccountID       string         `json:"fund_account_id,omitempty"`
	ContactID           string         `json:"contact_id,omitempty"`
	ProductID           string         `json:"product_id,omitempty"`
	ProductDesc         string         `json:"product_description,omitempty"`
	PONumber            string         `json:"po_number,omitempty"`
	MCCCode             string         `json:"mcc_code,omitempty"`
	PayoutPurpose       string         `json:"payout_purpose,omitempty"`
	TDSSection          string         `json:"tds_section,omitempty"`
	PANNumber           string         `json:"pan_number,omitempty"`
	TANOfDeductor       string         `json:"tan_of_deductor,omitempty"`
	NetPayable          float64        `json:"net_payable,omitempty"`
	KYCStatus           string         `json:"kyc_status,omitempty"`
	KYCPolicyClass      string         `json:"kyc_policy_class,omitempty"`
	Warnings            []string       `json:"warnings,omitempty"`
	InvoiceNumber       string         `json:"invoice_number,omitempty"`
	InvoiceDate         time.Time      `json:"invoice_date,omitempty"`
	VendorGSTIN         string         `json:"vendor_gstin,omitempty"`
	ReverseCharge       bool           `json:"reverse_charge,omitempty"`
	TaxableValue        float64        `json:"taxable_value,omitempty"`
	GSTRate             float64        `json:"gst_rate,omitempty"`
	GSTType             string         `json:"gst_type,omitempty"`
	IGSTAmount          float64        `json:"igst_amount,omitempty"`
	CGSTAmount          float64        `json:"cgst_amount,omitempty"`
	SGSTAmount          float64        `json:"sgst_amount,omitempty"`
	TDSRate             float64        `json:"tds_rate,omitempty"`
	TDSAmount           float64        `json:"tds_amount,omitempty"`
	VendorType          string         `json:"vendor_type,omitempty"`
	CINNumber           string         `json:"cin_number,omitempty"`
	MSMENumber          string         `json:"msme_number,omitempty"`
	BankVerified        bool           `json:"bank_verified,omitempty"`
}

type Amount struct {
	Value    string `json:"value"`
	Currency string `json:"currency"`
}

type Beneficiary struct {
	Instrument Instrument `json:"instrument"`
	Name       string     `json:"name,omitempty"`
	Country    string     `json:"country,omitempty"`
}

type Remitter struct {
	Phone      string `json:"phone,omitempty"`
	Email      string `json:"email,omitempty"`
	CustomerID string `json:"customer_id,omitempty"`
}

type Instrument struct {
	Kind string `json:"kind"`
	IFSC string `json:"ifsc,omitempty"`
	VPA  string `json:"vpa,omitempty"`
}
