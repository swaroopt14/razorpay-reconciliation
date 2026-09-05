package services

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"

	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// Razorpay Recon Header Configuration (Reference for 27-column XLSX)
var razorpayHeaders = []string{
	"transaction_entity", "entity_id", "amount", "currency",
	"fee (exclusive tax)", "tax", "debit", "credit",
	"payment_method", "card_type", "issuer_name", "entity_created_at",
	"payment_captured_at", "payment_notes", "refund_notes", "arn",
	"entity_description", "order_id", "order_receipt", "order_notes",
	"dispute_id", "dispute_created_at", "dispute_reason", "settlement_id",
	"settled_at", "settlement_utr", "settled_by",
}

// RazorpayParser implements the parser for Razorpay settlement recon sheets.
type RazorpayParser struct{}

// Parse processes the raw XLSX bytes and converts each row into a UniversalSettlementShape.
func (p *RazorpayParser) Parse(fileBytes []byte, sourceFileRef string, envelopeID uuid.UUID, profile models.MappingProfile) ([]ParsedRowResult, error) {
	// 1. Initialize excelize reader from raw bytes.
	f, err := excelize.OpenReader(bytes.NewReader(fileBytes))
	if err != nil {
		return nil, &RunLevelError{Kind: RunLevelFileCorrupted, Message: "corrupt or invalid xlsx: " + err.Error()}
	}
	defer f.Close()

	// 2. Locate the data sheet (default to first sheet).
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, &RunLevelError{Kind: RunLevelFileCorrupted, Message: "file has no sheets"}
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, &RunLevelError{Kind: RunLevelFileCorrupted, Message: "failed to extract rows: " + err.Error()}
	}

	if len(rows) == 0 {
		return nil, &RunLevelError{Kind: RunLevelFileCorrupted, Message: "empty file"}
	}

	// 3. Header Validation: Ensure the columns match the expected Razorpay format.
	if err := validateRazorpayHeaders(rows[0]); err != nil {
		return nil, err
	}

	// 4. Row Transformation: Iterate through data rows (skipping header at row 0).
	var results []ParsedRowResult
	for i, row := range rows[1:] {
		rowIndex := i + 1

		// ── Duplicate header detection ────────────────────────────────────
		if len(row) > 0 && strings.ToLower(strings.TrimSpace(row[0])) == razorpayHeaders[0] {
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

		result := parseRazorpayRow(row, rowIndex, sourceFileRef, envelopeID, rows[0], profile)
		results = append(results, result)
	}
	return results, nil
}

// validateRazorpayHeaders checks for column sequence and count integrity.
func validateRazorpayHeaders(headerRow []string) error {
	if len(headerRow) < len(razorpayHeaders) {
		return &RunLevelError{Kind: RunLevelUnsupportedFormat, Message: fmt.Sprintf("header mismatch: expected %d columns, got %d", len(razorpayHeaders), len(headerRow))}
	}
	for i, expected := range razorpayHeaders {
		got := strings.TrimSpace(strings.ToLower(headerRow[i]))
		if got != expected {
			return &RunLevelError{Kind: RunLevelUnsupportedFormat, Message: fmt.Sprintf("header mismatch: col %d expected %q, got %q", i, expected, got)}
		}
	}
	return nil
}

// parseRazorpayRow performs the actual field mapping and normalization for a single row.
func parseRazorpayRow(row []string, rowIndex int, sourceFileRef string, envelopeID uuid.UUID, headerRow []string, profile models.MappingProfile) ParsedRowResult {
	var warnings []string

	// Capture Raw Columns for audit transparency.
	rawCols := make(map[string]string, len(razorpayHeaders))
	for i, h := range razorpayHeaders {
		rawCols[h] = cellStr(row, i)
	}

	// Handle Amount Conversion: Convert decimal string to Decimal.
	amount := parseDecimal(cellStr(row, 2))
	fee := parseDecimal(cellStr(row, 4))
	tax := parseDecimal(cellStr(row, 5))
	credit := parseDecimal(cellStr(row, 7))

	// Handle Date Normalization: Try multiple formats, fallback to Now() if missing/corrupt.
	observationTS, tsWarning := parseSettlementDate(cellStr(row, 12)) // payment_captured_at
	if tsWarning != "" {
		warnings = append(warnings, "observation_timestamp: "+tsWarning)
	}

	valueDate, vdWarning := parseSettlementDate(cellStr(row, 24)) // settled_at
	if vdWarning != "" {
		warnings = append(warnings, "value_date: "+vdWarning)
	}

	// Extract References.
	providerRef := cellStr(row, 1)    // entity_id
	bankRef := cellStr(row, 25)       // settlement_utr
	extRef := cellStr(row, 17)        // order_id
	clientRefCand := cellStr(row, 18) // order_receipt
	batchRef := cellStr(row, 23)      // settlement_id

	// Determine Observation Kind based on Razorpay's entity type.
	txEntity := strings.ToLower(strings.TrimSpace(cellStr(row, 0)))
	observationKind := "OUTCOME_EXPORT"
	statusAmbiguous := false

	switch txEntity {
	case "payout":
		observationKind = "SETTLEMENT"
	case "refund":
		observationKind = "REVERSAL"
	default:
		// transaction_entity has an unrecognised value — status cannot be
		// determined with confidence. Mark ambiguous so parse_confidence is penalised.
		statusAmbiguous = true
		if txEntity != "" {
			warnings = append(warnings, "status_ambiguous: unrecognised transaction_entity="+txEntity)
		} else {
			warnings = append(warnings, "status_ambiguous: transaction_entity is empty")
		}
	}

	// Determine Status based on entity type.
	statusCandidate := "SETTLED"
	if txEntity == "refund" {
		statusCandidate = "REVERSED"
	}

	// A partial row means the xlsx library returned fewer cells than the header
	// has columns — trailing empty cells were stripped. Fields beyond len(row)
	// will silently return "" from cellStr(), making them indistinguishable from
	// genuinely empty values. Penalise parse confidence for this.
	partialRowParse := len(row) < len(razorpayHeaders)
	if partialRowParse {
		warnings = append(warnings, fmt.Sprintf(
			"partial_row: got %d columns, expected %d — trailing fields may be missing",
			len(row), len(razorpayHeaders),
		))
	}

	// ── Technical Confidence Scoring ──────────────────────────────────────────
	// Measure physical parser reliability instead of business identifier richness.
	confidenceInputs := ParseConfidenceInputs{
		FileFormatValid:                 true, // If we're here, XLSX structure was readable
		RowDecodedSuccessfully:          true,
		ColumnCountConsistent:           !partialRowParse,
		HeaderDetected:                  true,
		EncodingValid:                   true,
		RawLineHashCreated:              true,
		TimestampFallbackUsed:           tsWarning != "",
		AmountFallbackUsed:              amount.IsZero() && cellStr(row, 2) != "0" && cellStr(row, 2) != "0.00",
		StatusAmbiguous:                 statusAmbiguous,
		PartialRowParse:                 partialRowParse,
		DuplicateHeaderOrFooterDetected: false, // Handled at loop level
	}
	confidence, parseReasons := ComputeParseConfidence(confidenceInputs)

	if bankRef == "" {
		warnings = append(warnings, "missing bank_reference (settlement_utr)")
	}
	if providerRef == "" {
		warnings = append(warnings, "missing provider_reference (entity_id)")
	}

	// Construct the Universal Shape.
	shape := models.UniversalSettlementShape{
		ArtifactFamily:           "PSP_SETTLEMENT_RECON",
		SourceSystem:             "razorpay",
		SourceStrengthClass:      "PSP_REPORT",
		SourceFileRef:            sourceFileRef,
		SourceRowRef:             strconv.Itoa(rowIndex),
		ProviderReference:        strPtr(providerRef),
		BankReference:            strPtr(bankRef),
		ExternalReference:        strPtr(extRef),
		ClientReferenceCandidate: strPtr(clientRefCand),
		BatchReference:           strPtr(batchRef),
		Amount:                   amount,
		SettledAmount:            &credit,
		FeeAmount:                &fee,
		DeductionAmount:          &tax,
		CurrencyCode:             cellStr(row, 3),
		StatusCandidate:          statusCandidate,
		ObservationKind:          observationKind,
		ReversalFlag:             txEntity == "refund",
		ObservationTimestamp:     observationTS,
		ValueDate:                &valueDate,
		ParseConfidence:          confidence,
		ScoreReasonCodes:         parseReasons,
		PaymentMethod:            cellStr(row, 8),
		RawEnvelopeRef:           envelopeID,
		CarrierCandidates:        map[string]interface{}{},
		MappingInputs: models.MappingConfidenceInputs{
			AmountExisted:      true,
			AmountMapped:       !amount.IsZero() || cellStr(row, 2) == "0" || cellStr(row, 2) == "0.00",
			CurrencyExisted:    true,
			CurrencyMapped:     cellStr(row, 3) != "",
			StatusExisted:      true,
			StatusMapped:       statusCandidate != "",
			TimestampExisted:   true,
			TimestampMapped:    tsWarning == "",
			ProviderRefExisted: true,
			ProviderRefMapped:  providerRef != "",
			BankRefExisted:     true,
			BankRefMapped:      bankRef != "",
			ClientRefExisted:   true,
			ClientRefMapped:    clientRefCand != "",
		},
	}

	if shape.CarrierCandidates == nil {
		shape.CarrierCandidates = make(map[string]interface{})
	}
	shape.PartyReferenceCandidates = make(map[string]interface{})
	shape.BeneficiaryIdentityCandidates = make(map[string]interface{})

	return ParsedRowResult{
		RowIndex:   rowIndex,
		Shape:      shape,
		RawColumns: rawCols,
		Warnings:   warnings,
		Confidence: confidence,
	}
}
