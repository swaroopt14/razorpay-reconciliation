package services

import (
	"fmt"
	"regexp"
	"strings"
	"zord-edge/model"
)

type MerchantParser struct {
	baseParser
}

var panRegex = regexp.MustCompile(`^[A-Z]{5}[0-9]{4}[A-Z]{1}$`)

var allowedPayoutPurposes = map[string]bool{
	"refund": true, "cashback": true, "payout": true, "salary": true,
}

func (p *MerchantParser) Parse(rows [][]string, headers []string) ([]model.UniversalIntentShape, []ParseRowError) {
	colIndex := p.buildColIndex(headers)
	var shapes []model.UniversalIntentShape
	var errs []ParseRowError

	for i, row := range rows {
		rowNum := i + 1
		shape, rowErrs := p.parseRow(rowNum, row, colIndex)
		if len(rowErrs) > 0 {
			errs = append(errs, rowErrs...)
		} else {
			shapes = append(shapes, shape)
		}
	}
	return shapes, errs
}

func (p *MerchantParser) parseRow(rowNum int, row []string, colIndex map[string]int) (model.UniversalIntentShape, []ParseRowError) {
	var errs []ParseRowError
	var shape model.UniversalIntentShape

	get := func(candidates ...string) string {
		return p.getFromCandidates(row, colIndex, candidates...)
	}

	// ── Base fields ──────────────────────────────────────────────────────────
	shape.SchemaVersion = get("schema_version", "1.0.0")
	shape.IntentType = get("intent_type", "payout_type", "PAYOUT")

	shape.AccountNumber = get("account_number", "beneficiary_account_no", "account no", "account number", "")
	shape.Beneficiary.Name = get("beneficiary.name", "beneficiary_name", "merchant name", "name")
	shape.Beneficiary.Instrument.Kind = get("beneficiary.instrument.kind", "instrument_kind", "BANK_ACCOUNT")
	shape.Beneficiary.Instrument.IFSC = get("beneficiary.instrument.ifsc", "beneficiary_ifsc", "ifsc", "ifsc code")
	shape.Beneficiary.Country = get("beneficiary.country", "country", "IN")

	shape.ClientPayoutRef = get("client_payout_ref", "order id", "transaction id")
	
	shape.Source = get("source")
	shape.SourceSystem = get("source_system")
	shape.IdempotencyKey = get("idempotency_key", "idempotency key", "idempotencykey", "")

	shape.Constraints = make(map[string]any)
	if window := get("constraints.execution_window"); window != "" {
		shape.Constraints["execution_window"] = window
	}

	amtStr := get("amount.value", "amount_paid", "amount", "settlement amount", "value")
	amt, err := p.parseAmount(amtStr)
	if err != nil {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "amount", Message: err.Error()})
	} else {
		shape.Amount.Value = amt.String()
		shape.Amount.Currency = get("amount.currency", "currency", "INR")
	}

	// ── Gateway fields ────────────────────────────────────────────────────
	shape.GatewayName = get("gateway_name", "gateway")
	shape.FundAccountID = get("fund_account_id", "fund account id")
	shape.ContactID = get("contact_id", "contact id")
	shape.ProviderHint = get("provider_hint")
	shape.IntendedExecutionAt = get("intended_execution_at", "execution_date", "scheduled_execution_at", "schedule_at", "")

	// ── Product / Payout context ──────────────────────────────────────────
	shape.ProductID = get("product_id", "product id")
	shape.ProductDesc = get("product_description", "description")
	shape.PONumber = get("po_number", "po number")
	shape.MCCCode = get("mcc_code", "mcc")
	shape.PayoutPurpose = strings.ToLower(get("payout_purpose", "purpose", "purpose_code"))

	if shape.PayoutPurpose != "" && !allowedPayoutPurposes[shape.PayoutPurpose] {
		errs = append(errs, ParseRowError{
			RowIndex: rowNum,
			Field:    "payout_purpose",
			Message:  fmt.Sprintf("invalid value %q — must be one of: refund, cashback, payout, salary", shape.PayoutPurpose),
		})
	}

	if shape.MCCCode != "" && len(shape.MCCCode) != 4 {
		errs = append(errs, ParseRowError{
			RowIndex: rowNum,
			Field:    "mcc_code",
			Message:  fmt.Sprintf("mcc_code must be exactly 4 digits, got %q", shape.MCCCode),
		})
	}

	// ── Tax — TDS ─────────────────────────────────────────────────────────
	shape.TDSSection = get("tds_section", "tds section")
	shape.PANNumber = strings.ToUpper(strings.TrimSpace(get("pan_number", "pan")))
	shape.TANOfDeductor = get("tan_of_deductor", "tan")

	if shape.PANNumber != "" && !panRegex.MatchString(shape.PANNumber) {
		errs = append(errs, ParseRowError{
			RowIndex: rowNum,
			Field:    "pan_number",
			Message:  fmt.Sprintf("invalid PAN format %q — expected: 5 letters, 4 digits, 1 letter", shape.PANNumber),
		})
	}

	// ── Tax — Gateway fee GST (informational, not validated strictly) ─────
	rawFee := get("gateway_fee", "gateway fee")
	if rawFee != "" {
		fee, feeErr := p.parseAmount(rawFee)
		if feeErr == nil {
			// Decimal subtraction; convert to float64 for downstream model field
			shape.NetPayable = amt.Sub(fee).InexactFloat64()
		}
	}

	// ── KYC policy ────────────────────────────────────────────────────────
	shape.KYCStatus = get("kyc_status", "kyc status")
	shape.KYCPolicyClass = get("kyc_policy_class", "kyc policy")

	if shape.KYCStatus == "suspended" {
		shape.Warnings = append(shape.Warnings, "merchant kyc_status is suspended — payment will queue but may be held")
	}

	if shape.FundAccountID != "" {
		shape.Warnings = append(shape.Warnings, "fund_account_id provided — beneficiary bank fields will be ignored by gateway")
	}

	if shape.AccountNumber == "" && shape.FundAccountID == "" {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "account_number", Message: "missing account number or fund account id"})
	}

	shape.SourceRowRef = fmt.Sprintf("row:%d", rowNum)
	shape.ParseConfidence = 1.0

	return shape, errs
}
