package services

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

// CashfreeParser implements SettlementParser for Cashfree settlement CSV exports.
// The file is a standard CSV delivered from Cashfree's merchant dashboard.
// If Cashfree export has different columns, update cashfreeHeaders and the column index constants below.
type CashfreeParser struct{}

// Column index constants for the Cashfree settlement CSV.
// Update these if Cashfree changes their export format.
// Original CSV columns: settlement_id, cf_payment_id, order_id, order_amount, merchant_settlement_utr,
// settled_amount, service_charge, service_tax, settlement_date, transaction_type.
const (
	cfColSettlementID   = 0
	cfColPaymentID      = 1
	cfColOrderID        = 2
	cfColOrderAmount    = 3
	cfColUTR            = 4
	cfColSettledAmount  = 5
	cfColServiceCharge  = 6
	cfColServiceTax     = 7
	cfColSettlementDate = 8
	cfColTxType         = 9
)

var cashfreeHeaders = []string{
	"settlement_id", "cf_payment_id", "order_id", "order_amount", "merchant_settlement_utr",
	"settled_amount", "service_charge", "service_tax", "settlement_date", "transaction_type",
}

// Parse reads raw file bytes and returns one ParsedRowResult per data row.
func (p *CashfreeParser) Parse(fileBytes []byte, sourceFileRef string, envelopeID uuid.UUID, profile models.MappingProfile) ([]ParsedRowResult, error) {
	reader := csv.NewReader(bytes.NewReader(fileBytes))
	reader.FieldsPerRecord = -1 // Allow variable-length rows for footer/empty detection

	// Read header and validate
	header, err := reader.Read()
	if err != nil {
		if err == io.EOF {
			return nil, &RunLevelError{Kind: RunLevelFileCorrupted, Message: "cashfree: file is empty or has no header row"}
		}
		return nil, &RunLevelError{Kind: RunLevelFileCorrupted, Message: "cashfree: failed to read csv: " + err.Error()}
	}

	if len(header) < len(cashfreeHeaders) {
		return nil, &RunLevelError{Kind: RunLevelUnsupportedFormat, Message: fmt.Sprintf("cashfree: header mismatch: expected %d columns, got %d", len(cashfreeHeaders), len(header))}
	}

	for i, expected := range cashfreeHeaders {
		got := strings.TrimSpace(strings.ToLower(header[i]))
		if got != expected {
			return nil, &RunLevelError{Kind: RunLevelUnsupportedFormat, Message: fmt.Sprintf("cashfree: header mismatch: col %d expected %q, got %q", i, expected, got)}
		}
	}

	var results []ParsedRowResult
	// rowIndex tracks the 1-based data row number (header = 0, first data row = 1).
	// Incrementing before parseCashfreeRow ensures the first data row is always 1,
	// consistent with the Razorpay parser's numbering.
	rowIndex := 0
	for {
		row, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			rowIndex++

			failureReason := "CSV_PARSE_ERROR"
			if errors.Is(err, csv.ErrFieldCount) {
				failureReason = "ROW_COLUMN_MISMATCH"
			}

			results = append(results, ParsedRowResult{
				RowIndex:      rowIndex,
				Failed:        true,
				FailureReason: failureReason,
			})
			continue
		}
		rowIndex++

		// ── Duplicate header detection ────────────────────────────────────
		if len(row) > 0 && strings.ToLower(strings.TrimSpace(row[0])) == cashfreeHeaders[0] {
			results = append(results, ParsedRowResult{
				RowIndex:      rowIndex,
				Failed:        true,
				FailureReason: "SYS_DUPLICATE_HEADER_ROW",
			})
			continue
		}

		// ── Footer/summary row detection ─────────────────────────────────
		firstCell := strings.ToLower(strings.TrimSpace(cellStr(row, 0)))
		if firstCell == "total" || firstCell == "grand total" ||
			firstCell == "subtotal" || firstCell == "summary" {
			results = append(results, ParsedRowResult{
				RowIndex:      rowIndex,
				Failed:        true,
				FailureReason: "SYS_FOOTER_ROW_DETECTED",
			})
			continue
		}

		isEmpty := true
		for _, col := range row {
			if strings.TrimSpace(col) != "" {
				isEmpty = false
				break
			}
		}
		if isEmpty {
			results = append(results, ParsedRowResult{
				RowIndex:      rowIndex,
				Failed:        true,
				FailureReason: "EMPTY_RAW_ROW",
			})
			continue
		}

		result := parseCashfreeRow(row, rowIndex, sourceFileRef, envelopeID, header, profile)
		results = append(results, result)
	}

	return results, nil
}

func parseCashfreeRow(row []string, rowIndex int, sourceFileRef string, envelopeID uuid.UUID, headerRow []string, profile models.MappingProfile) ParsedRowResult {
	var warnings []string

	rawCols := make(map[string]string, len(cashfreeHeaders))
	for i, h := range cashfreeHeaders {
		rawCols[h] = cellStr(row, i)
	}

	orderAmount := parseDecimal(cellStr(row, cfColOrderAmount))
	settledAmount := parseDecimal(cellStr(row, cfColSettledAmount))
	serviceCharge := parseDecimal(cellStr(row, cfColServiceCharge))
	serviceTax := parseDecimal(cellStr(row, cfColServiceTax))

	dateStr := cellStr(row, cfColSettlementDate)
	var observationTS time.Time
	var tsWarning string

	if t, err := time.Parse("2006-01-02", dateStr); err == nil {
		observationTS = t.UTC()
	} else {
		observationTS, tsWarning = parseSettlementDate(dateStr)
	}

	if tsWarning != "" {
		warnings = append(warnings, "observation_timestamp: "+tsWarning)
	}
	valueDate := observationTS

	providerRef := cellStr(row, cfColPaymentID)
	bankRef := cellStr(row, cfColUTR)
	extRef := cellStr(row, cfColOrderID)
	batchRef := cellStr(row, cfColSettlementID)

	txType := strings.ToUpper(strings.TrimSpace(cellStr(row, cfColTxType)))
	observationKind := "OUTCOME_EXPORT"
	statusCandidate := ""
	statusAmbiguous := false

	switch txType {
	case "SETTLEMENT":
		observationKind = "SETTLEMENT"
		statusCandidate = "SETTLED"
	case "REFUND":
		observationKind = "REVERSAL"
		statusCandidate = "REVERSED"
	default:
		// Unknown transaction types are stored as OUTCOME_EXPORT with UNKNOWN status.
		// This prevents empty settlement_status which breaks downstream intelligence.
		// Add new cases above as Cashfree introduces new transaction_type values.
		observationKind = "OUTCOME_EXPORT"
		statusCandidate = "UNKNOWN"
		statusAmbiguous = true
		if txType != "" {
			warnings = append(warnings, "status_ambiguous: unrecognised transaction_type="+txType)
		} else {
			warnings = append(warnings, "status_ambiguous: transaction_type is empty")
		}
	}

	partialRowParse := len(row) < len(cashfreeHeaders)
	if partialRowParse {
		warnings = append(warnings, fmt.Sprintf(
			"partial_row: got %d columns, expected %d — trailing fields may be missing",
			len(row), len(cashfreeHeaders),
		))
	}

	// ── Technical Confidence Scoring ──────────────────────────────────────────
	// Measure physical parser reliability instead of business identifier richness.
	confidenceInputs := ParseConfidenceInputs{
		FileFormatValid:        true, // If we're here, CSV was readable
		RowDecodedSuccessfully: true,
		ColumnCountConsistent:  !partialRowParse,
		HeaderDetected:         true,
		EncodingValid:          true,
		RawLineHashCreated:     true,
		TimestampFallbackUsed:  tsWarning != "",
		AmountFallbackUsed:     orderAmount.IsZero() && cellStr(row, cfColOrderAmount) != "0" && cellStr(row, cfColOrderAmount) != "0.00",
		StatusAmbiguous:        statusAmbiguous,
		PartialRowParse:        partialRowParse,
		DuplicateHeaderOrFooterDetected: false, // Handled at loop level
	}
	confidence, parseReasons := ComputeParseConfidence(confidenceInputs)

	if bankRef == "" {
		warnings = append(warnings, "missing bank_reference (merchant_settlement_utr)")
	}
	if providerRef == "" {
		warnings = append(warnings, "missing provider_reference (cf_payment_id)")
	}

	shape := models.UniversalSettlementShape{
		ArtifactFamily:           "PSP_SETTLEMENT_RECON",
		SourceSystem:             "cashfree",
		SourceStrengthClass:      "PSP_REPORT",
		SourceFileRef:            sourceFileRef,
		SourceRowRef:             strconv.Itoa(rowIndex),
		ProviderReference:        strPtr(providerRef),
		BankReference:            strPtr(bankRef),
		ExternalReference:        strPtr(extRef),
		ClientReferenceCandidate: strPtr(batchRef),
		BatchReference:           strPtr(batchRef),
		Amount:                   orderAmount,
		SettledAmount:            &settledAmount,
		FeeAmount:                &serviceCharge,
		DeductionAmount:          &serviceTax,
		CurrencyCode:             "INR",
		StatusCandidate:          statusCandidate,
		ObservationKind:          observationKind,
		ReversalFlag:             txType == "REFUND",
		ObservationTimestamp:     observationTS,
		ValueDate:                &valueDate,
		ParseConfidence:          confidence,
		ScoreReasonCodes:              parseReasons,
		RawEnvelopeRef:           envelopeID,
		CarrierCandidates:        make(map[string]interface{}),
		PartyReferenceCandidates: make(map[string]interface{}),
		BeneficiaryIdentityCandidates: make(map[string]interface{}),
		MappingInputs: models.MappingConfidenceInputs{
			AmountExisted:     true,
			AmountMapped:      !orderAmount.IsZero() || cellStr(row, cfColOrderAmount) == "0" || cellStr(row, cfColOrderAmount) == "0.00",
			CurrencyExisted:   true,
			CurrencyMapped:    true, // Hardcoded to INR
			StatusExisted:     true,
			StatusMapped:      statusCandidate != "UNKNOWN",
			TimestampExisted:  true,
			TimestampMapped:   tsWarning == "",
			ProviderRefExisted: true,
			ProviderRefMapped: providerRef != "",
			BankRefExisted:    true,
			BankRefMapped:     bankRef != "",
			ClientRefExisted:  false, // Cashfree format examined doesn't have a clear client ref column
		},
	}

	return ParsedRowResult{
		RowIndex:   rowIndex,
		Shape:      shape,
		RawColumns: rawCols,
		Warnings:   warnings,
		Confidence: confidence,
	}
}
