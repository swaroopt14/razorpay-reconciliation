package normalizer

// synonymDict maps every known tenant variant → Zord canonical JSON path.
// Keys are lowercased and trimmed before lookup.
// Add new synonyms here when onboarding new tenants — no code change needed elsewhere.
var synonymDict = map[string]string{
	// ── Amount ────────────────────────────────────────────────────
	"amount":          "amount.value",
	"amount.value":    "amount.value",
	"net amount":      "amount.value",
	"settled_amount":  "amount.value",
	"amount_paid":     "amount.value",
	"credited_amount": "amount.value",
	"payout amount":   "amount.value",
	"transfer amount": "amount.value",
	"txn amount":      "amount.value",
	"txnamount":       "amount.value",
	"net_amount":      "amount.value",
	// Tally export variants
	"amt":           "amount.value",
	"debit amount":  "amount.value",
	"credit amount": "amount.value",

	// ── Currency ──────────────────────────────────────────────────
	"currency":        "amount.currency",
	"amount.currency": "amount.currency",
	"currency_code":   "amount.currency",
	"ccy":             "amount.currency",

	// ── Beneficiary name ──────────────────────────────────────────
	"beneficiary_name": "beneficiary.name",
	"vendor name":      "beneficiary.name",
	"vendor_name":      "beneficiary.name",
	"payee name":       "beneficiary.name",
	"payee_name":       "beneficiary.name",
	"recipient name":   "beneficiary.name",
	"account name":     "beneficiary.name",
	"name":             "beneficiary.name",
	// Tally export variants
	"ledger name": "beneficiary.name",
	"ledger_name": "beneficiary.name",

	// ── Instrument kind ───────────────────────────────────────────
	"instrument_kind": "beneficiary.instrument.kind",
	"payment_mode":    "beneficiary.instrument.kind",
	"payment_method":  "beneficiary.instrument.kind",
	"rail_hint":       "beneficiary.instrument.kind",
	"transfer_mode":   "beneficiary.instrument.kind",
	"mode":            "beneficiary.instrument.kind",

	// ── IFSC ──────────────────────────────────────────────────────
	"ifsc":             "beneficiary.instrument.ifsc",
	"ifsc_code":        "beneficiary.instrument.ifsc",
	"ifsc code":        "beneficiary.instrument.ifsc",
	"bank_code":        "beneficiary.instrument.ifsc",
	"beneficiary_ifsc": "beneficiary.instrument.ifsc",

	// ── VPA / UPI ─────────────────────────────────────────────────
	"vpa":                     "beneficiary.instrument.vpa",
	"upi_id":                  "beneficiary.instrument.vpa",
	"upi id":                  "beneficiary.instrument.vpa",
	"upi_vpa":                 "beneficiary.instrument.vpa",
	"virtual_payment_address": "beneficiary.instrument.vpa",
	"beneficiary_vpa":         "beneficiary.instrument.vpa",

	// ── References ────────────────────────────────────────────────
	"client_payout_ref": "client_payout_ref",
	"order_id":          "client_payout_ref",
	"order id":          "client_payout_ref",
	"reference_no":      "client_payout_ref",
	"reference no":      "client_payout_ref",
	"payout_ref":        "client_payout_ref",

	"client_batch_ref": "client_batch_ref",
	"batch_id":         "client_batch_ref",
	"batch id":         "client_batch_ref",
	"batch_ref":        "client_batch_ref",

	"idempotency_key": "idempotency_key",
	"idempotency key": "idempotency_key",
	"dedup_key":       "idempotency_key",

	// ── Intent type ───────────────────────────────────────────────
	"intent_type":   "intent_type",
	"payment_type":  "intent_type",
	"transfer_type": "intent_type",
	"payout_type":   "intent_type",

	// ── Provider hint ─────────────────────────────────────────────
	"provider_hint":   "provider_hint",
	"gateway":         "provider_hint",
	"psp":             "provider_hint",
	"payment_gateway": "provider_hint",

	// ── Execution date ────────────────────────────────────────────
	"intended_execution_at":  "intended_execution_at",
	"execution_date":         "intended_execution_at",
	"payout_date":            "intended_execution_at",
	"value_date":             "intended_execution_at",
	"transfer_date":          "intended_execution_at",
	"scheduled_execution_at": "intended_execution_at",
	// Tally export variants
	"date": "intended_execution_at",

	// ── Account number ────────────────────────────────────────────
	"account_number":             "account_number",
	"account no":                 "account_number",
	"account_no":                 "account_number",
	"acc_no":                     "account_number",
	"bank_account":               "account_number",
	"beneficiary_account_number": "account_number",

	// ── Purpose ───────────────────────────────────────────────────
	"purpose_code": "purpose_code",
	"purpose":      "purpose_code",
	"narration":    "purpose_code",
	"remarks":      "purpose_code",

	"source":        "source",
	"source_system": "source_system",

	// ── Root Canonical Objects (Self-Mapping) ─────────────────────
	// These allow already-parsed nested JSON to pass through resolveField.
	"beneficiary": "beneficiary",

	"remitter":    "remitter",
	"constraints": "constraints",

	// ── Gateway Routing ───────────────────────────────────────────
	"gateway_name":    "gateway_name",
	"fund_account_id": "fund_account_id",
	"contact_id":      "contact_id",

	// ── GST & Tax Details ─────────────────────────────────────────
	"taxable_value":  "taxable_value",
	"gst_type":       "gst_type",
	"igst_amount":    "igst_amount",
	"cgst_amount":    "cgst_amount",
	"sgst_amount":    "sgst_amount",
	"gst_rate":       "gst_rate",
	"vendor_gstin":   "vendor_gstin",
	"hsn_sac_code":   "hsn_sac_code",
	"reverse_charge": "reverse_charge",

	// ── TDS ───────────────────────────────────────────────────────
	"tds_section":     "tds_section",
	"tds_rate":        "tds_rate",
	"tds_amount":      "tds_amount",
	"net_payable":     "net_payable",
	"pan_number":      "pan_number",
	"tan_of_deductor": "tan_of_deductor",

	// ── Product / Invoice Context ─────────────────────────────────
	"invoice_number": "invoice_number",
	"invoice_date":   "invoice_date",
	"po_number":      "po_number",
	"product_id":     "product_id",
	"product_desc":   "product_desc",
	"mcc_code":       "mcc_code",
	"payout_purpose": "payout_purpose",
	"invoice_id":     "invoice_id",
	"voucher_id":     "voucher_id",
	// Tally export variants
	"vch no":       "voucher_id",
	"vch no.":      "voucher_id",
	"voucher no":   "voucher_id",
	"voucher type": "purpose_code",

	// ── KYC / Compliance ──────────────────────────────────────────
	"vendor_type":      "vendor_type",
	"kyc_status":       "kyc_status",
	"kyc_policy_class": "kyc_policy_class",
	"kyc_verified_at":  "kyc_verified_at",
	"bank_verified":    "bank_verified",
	"cin_number":       "cin_number",
	"msme_number":      "msme_number",

	// ── Canonical Identity Mappings (Self-Mapping) ────────────────
	"schema_version":               "schema_version",
	"beneficiary.name":             "beneficiary.name",
	"beneficiary.country":          "beneficiary.country",
	"beneficiary.instrument.kind":  "beneficiary.instrument.kind",
	"beneficiary.instrument.ifsc":  "beneficiary.instrument.ifsc",
	"beneficiary.instrument.vpa":   "beneficiary.instrument.vpa",
	"remitter.phone":               "remitter.phone",
	"remitter.email":               "remitter.email",
	"remitter.customer_id":         "remitter.customer_id",
	"constraints.execution_window": "constraints.execution_window",
	"approval_ref":                 "approval_ref",
	"bank_account_ref":             "bank_account_ref",
	"source_row_ref":               "source_row_ref",
}
