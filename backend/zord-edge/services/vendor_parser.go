package services

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"zord-edge/model"
)

type VendorParser struct {
	baseParser
}

var (
	gstinRegex = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`)
	msmeRegex  = regexp.MustCompile(`^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$`)
	cinRegex   = regexp.MustCompile(`^[UL][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$`)

	validTDSSections = map[string]bool{
		"192": true, "194C": true, "194J": true,
		"194H": true, "194I": true, "194A": true,
	}

	validGSTRates = map[float64]bool{
		0: true, 5: true, 12: true, 18: true, 28: true,
	}
)

const amountToleranceINR = 1.0 // ±₹1 tolerance for GST/TDS cross-validation

func (p *VendorParser) Parse(rows [][]string, headers []string) ([]model.UniversalIntentShape, []ParseRowError) {
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

func (p *VendorParser) parseRow(rowNum int, row []string, colIndex map[string]int) (model.UniversalIntentShape, []ParseRowError) {
	var errs []ParseRowError
	var shape model.UniversalIntentShape

	get := func(candidates ...string) string {
		return p.getFromCandidates(row, colIndex, candidates...)
	}

	// ── Base fields ──────────────────────────────────────────────────────────
	shape.SchemaVersion = get("schema_version", "1.0.0")
	shape.IntentType = get("intent_type", "PAYOUT")

	shape.AccountNumber = get("account_number", "beneficiary_account_no", "account number", "account no", "")
	shape.Beneficiary.Name = get("beneficiary.name", "beneficiary_name", "vendor name", "name")
	shape.Beneficiary.Instrument.Kind = get("beneficiary.instrument.kind", "instrument_kind", "BANK_ACCOUNT")
	shape.Beneficiary.Instrument.IFSC = get("beneficiary.instrument.ifsc", "beneficiary_ifsc", "ifsc code", "ifsc")
	shape.Beneficiary.Country = get("beneficiary.country", "country", "IN")
	
	shape.Remitter.Phone = get("remitter.phone", "phone")
	shape.Remitter.Email = get("remitter.email", "email")
	shape.Remitter.CustomerID = get("remitter.customer_id", "customer_id")

	shape.ClientPayoutRef = get("client_payout_ref", "reference no")
	
	shape.Source = get("source")
	shape.SourceSystem = get("source_system")
	shape.IdempotencyKey = get("idempotency_key", "idempotency key", "idempotencykey", "")

	shape.Constraints = make(map[string]any)
	if window := get("constraints.execution_window"); window != "" {
		shape.Constraints["execution_window"] = window
	}

	amtStr := get("amount.value", "amount_paid", "amount", "net payable")
	amt, err := p.parseAmount(amtStr)
	if err != nil {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "amount", Message: err.Error()})
	} else {
		shape.Amount.Value = amt.String()
		shape.Amount.Currency = get("amount.currency", "currency", "INR")
	}

	// ── Gateway routing ───────────────────────────────────────────────────
	shape.GatewayName = get("gateway_name", "gateway")
	shape.FundAccountID = get("fund_account_id", "fund account id")
	shape.ContactID = get("contact_id", "contact id")
	shape.ProviderHint = get("provider_hint")
	shape.IntendedExecutionAt = get("intended_execution_at", "execution_date", "scheduled_execution_at", "schedule_at", "")

	// ── Invoice / PO context ──────────────────────────────────────────────
	shape.InvoiceNumber = get("invoice_number", "invoice no")
	shape.PONumber = get("po_number", "po number")
	shape.ProductID = get("product_id", "item code")
	shape.ProductDesc = get("product_description", "description")
	shape.PayoutPurpose = get("payout_purpose", "purpose", "purpose_code")
	shape.HSNSACCode = get("hsn_sac_code", "hsn/sac")

	rawInvDate := get("invoice_date", "invoice date")
	if rawInvDate != "" {
		// Attempt parsing with a common layout, though baseParser doesn't strictly define it.
		// Fallback to simpler date parsing if necessary.
		layouts := []string{"2006-01-02", "02/01/2006", "02-01-2006"}
		var parsedTime time.Time
		var parseErr error
		for _, layout := range layouts {
			parsedTime, parseErr = time.Parse(layout, rawInvDate)
			if parseErr == nil {
				break
			}
		}
		if parseErr != nil {
			errs = append(errs, ParseRowError{
				RowIndex: rowNum, Field: "invoice_date",
				Message: fmt.Sprintf("cannot parse %q", rawInvDate),
			})
		} else {
			shape.InvoiceDate = parsedTime
		}
	}

	// ── GSTIN validation ──────────────────────────────────────────────────
	shape.VendorGSTIN = strings.ToUpper(strings.TrimSpace(get("vendor_gstin", "vendor gstin")))
	if shape.VendorGSTIN != "" && !gstinRegex.MatchString(shape.VendorGSTIN) {
		errs = append(errs, ParseRowError{
			RowIndex: rowNum, Field: "vendor_gstin",
			Message: fmt.Sprintf("invalid GSTIN format %q", shape.VendorGSTIN),
		})
	}

	// ── GST breakdown ─────────────────────────────────────────────────────
	reverseChargeRaw := strings.ToLower(get("reverse_charge", "reverse charge"))
	shape.ReverseCharge = reverseChargeRaw == "yes" || reverseChargeRaw == "true" || reverseChargeRaw == "y"

	rawTaxable := get("taxable_value", "taxable value")
	if rawTaxable != "" {
		tv, err := p.parseAmount(rawTaxable)
		if err != nil {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "taxable_value", Message: err.Error()})
		} else {
			shape.TaxableValue = tv.InexactFloat64()
		}
	}

	rawGSTRate := get("gst_rate", "gst rate")
	if rawGSTRate != "" {
		rate, err := p.parseAmount(rawGSTRate)
		if err != nil {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "gst_rate", Message: err.Error()})
		} else if !validGSTRates[rate.InexactFloat64()] {
			errs = append(errs, ParseRowError{
				RowIndex: rowNum, Field: "gst_rate",
				Message: fmt.Sprintf("invalid GST rate %.0f — must be 0, 5, 12, 18, or 28", rate.InexactFloat64()),
			})
		} else {
			shape.GSTRate = rate.InexactFloat64()
		}
	}

	shape.GSTType = strings.ToUpper(get("gst_type", "gst type")) // "IGST" or "CGST_SGST"

	if !shape.ReverseCharge && shape.TaxableValue > 0 && shape.GSTRate > 0 {
		expectedGST := math.Round(shape.TaxableValue*shape.GSTRate/100*100) / 100
		expectedGSTDec := decimal.NewFromFloat(expectedGST)

		switch shape.GSTType {
		case "IGST":
			igst, err := p.parseAmount(get("igst_amount", "igst"))
			if err != nil {
				errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "igst_amount", Message: err.Error()})
			} else {
				shape.IGSTAmount = igst.InexactFloat64()
				if igst.Sub(expectedGSTDec).Abs().GreaterThan(decimal.NewFromFloat(amountToleranceINR)) {
					errs = append(errs, ParseRowError{
						RowIndex: rowNum, Field: "igst_amount",
						Message: fmt.Sprintf("igst_amount %s does not match taxable_value × gst_rate = %.2f", igst.String(), expectedGST),
					})
				}
			}

		case "CGST_SGST":
			cgst, err1 := p.parseAmount(get("cgst_amount", "cgst"))
			sgst, err2 := p.parseAmount(get("sgst_amount", "sgst"))
			if err1 != nil {
				errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "cgst_amount", Message: err1.Error()})
			}
			if err2 != nil {
				errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "sgst_amount", Message: err2.Error()})
			}
			if err1 == nil && err2 == nil {
				shape.CGSTAmount = cgst.InexactFloat64()
				shape.SGSTAmount = sgst.InexactFloat64()
				totalGSTDec := cgst.Add(sgst)
				if totalGSTDec.Sub(expectedGSTDec).Abs().GreaterThan(decimal.NewFromFloat(amountToleranceINR)) {
					errs = append(errs, ParseRowError{
						RowIndex: rowNum, Field: "cgst_amount",
						Message: fmt.Sprintf("cgst+sgst %s does not match expected GST %.2f", totalGSTDec.String(), expectedGST),
					})
				}
			}
		}
	}

	// ── TDS ───────────────────────────────────────────────────────────────
	shape.TDSSection = strings.ToUpper(get("tds_section", "tds section"))
	shape.PANNumber = strings.ToUpper(strings.TrimSpace(get("pan_number", "pan")))
	shape.TANOfDeductor = strings.ToUpper(get("tan_of_deductor", "tan"))

	if shape.TDSSection != "" && !validTDSSections[shape.TDSSection] {
		errs = append(errs, ParseRowError{
			RowIndex: rowNum, Field: "tds_section",
			Message: fmt.Sprintf("unknown TDS section %q", shape.TDSSection),
		})
	}

	if shape.PANNumber != "" && !panRegex.MatchString(shape.PANNumber) {
		errs = append(errs, ParseRowError{
			RowIndex: rowNum, Field: "pan_number",
			Message: fmt.Sprintf("invalid PAN format %q", shape.PANNumber),
		})
	}

	rawTDSRate := get("tds_rate", "tds rate %", "tds rate")
	if rawTDSRate != "" {
		rate, err := p.parseAmount(rawTDSRate)
		if err != nil {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "tds_rate", Message: err.Error()})
		} else {
			shape.TDSRate = rate.InexactFloat64()
		}
	}

	rawTDS := get("tds_amount", "tds amount")
	if rawTDS != "" {
		tds, err := p.parseAmount(rawTDS)
		if err != nil {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "tds_amount", Message: err.Error()})
		} else {
			shape.TDSAmount = tds.InexactFloat64()
			if shape.TaxableValue > 0 && shape.TDSRate > 0 {
				expectedTDS := math.Round(shape.TaxableValue*shape.TDSRate/100*100) / 100
				if tds.Sub(decimal.NewFromFloat(expectedTDS)).Abs().GreaterThan(decimal.NewFromFloat(amountToleranceINR)) {
					errs = append(errs, ParseRowError{
						RowIndex: rowNum, Field: "tds_amount",
						Message: fmt.Sprintf("tds_amount %s does not match taxable_value × tds_rate = %.2f", tds.String(), expectedTDS),
					})
				}
			}
		}
	}

	totalGST := shape.IGSTAmount + shape.CGSTAmount + shape.SGSTAmount
	shape.NetPayable = shape.TaxableValue + totalGST - shape.TDSAmount
	if !amt.IsZero() && shape.NetPayable > 0 {
		if decimal.NewFromFloat(amt.InexactFloat64() - shape.NetPayable).Abs().GreaterThan(decimal.NewFromFloat(amountToleranceINR)) {
			errs = append(errs, ParseRowError{
				RowIndex: rowNum, Field: "amount",
				Message: fmt.Sprintf("amount %s does not match net_payable (taxable+gst-tds) = %.2f", amt.String(), shape.NetPayable),
			})
		}
	}

	// ── KYC / KYB ─────────────────────────────────────────────────────────
	shape.VendorType = strings.ToUpper(get("vendor_type", "vendor type"))
	shape.KYCStatus = strings.ToLower(get("kyc_status", "kyc status"))
	shape.KYCPolicyClass = strings.ToLower(get("kyc_policy_class", "kyc policy"))
	shape.CINNumber = strings.ToUpper(get("cin_number", "cin"))
	shape.MSMENumber = strings.ToUpper(get("msme_number", "msme no"))

	rawBankVerified := strings.ToLower(get("bank_verified", "bank verified"))
	shape.BankVerified = rawBankVerified == "yes" || rawBankVerified == "true" || rawBankVerified == "y"

	if shape.KYCStatus == "suspended" {
		errs = append(errs, ParseRowError{
			RowIndex: rowNum, Field: "kyc_status",
			Message: "vendor kyc_status is suspended — row rejected, payment blocked",
		})
		return shape, errs
	}

	switch shape.KYCPolicyClass {
	case "enhanced":
		if shape.PANNumber == "" {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "pan_number", Message: "pan_number required for enhanced KYC policy"})
		}
		if shape.VendorGSTIN == "" {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "vendor_gstin", Message: "vendor_gstin required for enhanced KYC policy"})
		}
		if shape.CINNumber == "" {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "cin_number", Message: "cin_number required for enhanced KYC policy"})
		}
		if shape.CINNumber != "" && !cinRegex.MatchString(shape.CINNumber) {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "cin_number", Message: fmt.Sprintf("invalid CIN format %q", shape.CINNumber)})
		}

	case "standard":
		if shape.PANNumber == "" {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "pan_number", Message: "pan_number required for standard KYC policy"})
		}
		if shape.VendorGSTIN == "" {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "vendor_gstin", Message: "vendor_gstin required for standard KYC policy"})
		}

	case "simplified":
		if shape.PANNumber == "" {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "pan_number", Message: "pan_number required even for simplified KYC policy"})
		}
		if shape.VendorGSTIN == "" {
			shape.Warnings = append(shape.Warnings, "vendor_gstin not provided — acceptable under simplified KYC if turnover < ₹20L")
		}
	}

	if shape.MSMENumber != "" && !msmeRegex.MatchString(shape.MSMENumber) {
		errs = append(errs, ParseRowError{
			RowIndex: rowNum, Field: "msme_number",
			Message: fmt.Sprintf("invalid MSME/Udyam format %q — expected: UDYAM-XX-00-0000000", shape.MSMENumber),
		})
	}

	if !shape.BankVerified && shape.FundAccountID == "" {
		shape.Warnings = append(shape.Warnings, "bank_verified is false and no fund_account_id — penny drop verification recommended before disbursement")
	}

	if shape.AccountNumber == "" && shape.FundAccountID == "" {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "account_number", Message: "missing account number or fund account id"})
	}

	shape.SourceRowRef = fmt.Sprintf("row:%d", rowNum)
	shape.ParseConfidence = 1.0

	return shape, errs
}
