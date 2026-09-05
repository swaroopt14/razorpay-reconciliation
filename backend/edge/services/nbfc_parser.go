package services

import (
	"fmt"
	"zord-edge/model"
)

type NBFCParser struct {
	baseParser
}

func (p *NBFCParser) Parse(rows [][]string, headers []string) ([]model.UniversalIntentShape, []ParseRowError) {
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

func (p *NBFCParser) parseRow(rowNum int, row []string, colIndex map[string]int) (model.UniversalIntentShape, []ParseRowError) {
	var errs []ParseRowError
	var shape model.UniversalIntentShape

	// Helper to try common variations of headers
	get := func(candidates ...string) string {
		return p.getFromCandidates(row, colIndex, candidates...)
	}

	// Populate Nested Structure (Service 2 Spec)
	shape.SchemaVersion = get("schema_version", "1.0.0")
	shape.IntentType = get("intent_type", "PAYOUT")

	// Service 2 expects account_number at TOP LEVEL
	shape.AccountNumber = get("loan_account_number", "account_number", "account number", "beneficiary.instrument.account_number", "")

	shape.Beneficiary.Name = get("customer_name", "beneficiary.name", "beneficiary name")
	shape.Beneficiary.Instrument.Kind = get("beneficiary.instrument.kind", "instrument_kind", "BANK_ACCOUNT")
	shape.Beneficiary.Instrument.IFSC = get("ifsc_code", "beneficiary.instrument.ifsc", "ifsc")
	shape.Beneficiary.Instrument.VPA = get("vpa_id", "beneficiary.instrument.vpa")
	shape.Beneficiary.Country = get("beneficiary.country", "country", "IN")

	shape.Remitter.Phone = get("remitter.phone", "phone")
	shape.Remitter.Email = get("remitter.email", "email")
	shape.Remitter.CustomerID = get("remitter.customer_id", "customer_id", "client_customer_id")

	shape.ClientPayoutRef = get("loan_id", "client_payout_ref", "transaction_id")
	shape.ClientBatchRef = get("client_batch_ref", "batch_id")
	shape.PurposeCode = get("purpose_code", "purpose", "narration")
	shape.ProviderHint = get("provider_hint")
	shape.IntendedExecutionAt = get("intended_execution_at", "execution_date", "scheduled_execution_at", "schedule_at", "")

	shape.Source = get("source")
	shape.SourceSystem = get("source_system")
	shape.IdempotencyKey = get("idempotency_key", "idempotency key", "idempotencykey", "")

	shape.Constraints = make(map[string]any)
	if window := get("constraints.execution_window"); window != "" {
		shape.Constraints["execution_window"] = window
	}

	shape.Amount.Currency = get("amount.currency", "currency", "INR")
	amtStr := get("amount_paid", "disbursal_amount", "amount.value", "amount")
	amt, err := p.parseAmount(amtStr)
	if err != nil {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "amount", Message: err.Error()})
	} else {
		// Service 2 expects amount.value as a STRING — preserve exact decimal scale
		shape.Amount.Value = amt.String()
	}

	shape.SourceRowRef = fmt.Sprintf("row:%d", rowNum)
	shape.ParseConfidence = 1.0

	return shape, errs
}
