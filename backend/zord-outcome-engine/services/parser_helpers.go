package services

import (
	"encoding/json"
	"strings"
	"time"

	"zord-outcome-engine/models"

	"github.com/shopspring/decimal"
)

// cellStr safely extracts a trimmed string from a row slice.
func cellStr(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

// parseDecimal converts a string to decimal.Decimal, defaulting to Zero.
func parseDecimal(s string) decimal.Decimal {
	if s == "" {
		return decimal.Zero
	}
	v, _ := decimal.NewFromString(s)
	return v
}

// parseSettlementDate attempts to parse common Razorpay/Cashfree date formats.
func parseSettlementDate(s string) (time.Time, string) {
	if s == "" {
		return time.Now().UTC(), "empty"
	}
	// Common recon date formats.
	layouts := []string{
		"02/01/2006 15:04:05",
		"2006-01-02 15:04:05",
		"02/01/2006",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), ""
		}
	}
	return time.Now().UTC(), "format error"
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ComputeParseConfidence calculates a technical reliability score on a 0.0 to 1.0 scale.
// It penalizes technical failures like malformed dates, missing columns, or encoding issues.
// Returns the score and a list of reason codes indicating which penalties were applied.
func ComputeParseConfidence(inputs ParseConfidenceInputs) (float64, []string) {
	score := 1.0
	var reasons []string

	if !inputs.EncodingValid {
		score -= 0.30
		reasons = append(reasons, "ENCODING_INVALID")
	}
	if !inputs.ColumnCountConsistent {
		score -= 0.15
		reasons = append(reasons, "COLUMN_COUNT_INCONSISTENT")
	}
	if inputs.TimestampFallbackUsed {
		score -= 0.10
		reasons = append(reasons, "TIMESTAMP_PARSE_FALLBACK_USED")
	}
	if inputs.AmountFallbackUsed {
		score -= 0.15
		reasons = append(reasons, "AMOUNT_PARSE_FALLBACK_USED")
	}
	if inputs.StatusAmbiguous {
		score -= 0.10
		reasons = append(reasons, "STATUS_AMBIGUOUS")
	}
	if inputs.DuplicateHeaderOrFooterDetected {
		score -= 0.10
		reasons = append(reasons, "DUPLICATE_HEADER_FOOTER_DETECTED")
	}
	if inputs.PartialRowParse {
		score -= 0.20
		reasons = append(reasons, "PARTIAL_ROW_PARSE")
	}
	if !inputs.RawLineHashCreated {
		score -= 0.10
		reasons = append(reasons, "RAW_LINE_HASH_FAILED")
	}

	if score < 0.0 {
		score = 0.0
	}
	return score, reasons
}

// ComputeParseQualityLabel classifies a parse_confidence score into a human-readable label.
// Labels are used downstream by Service 7 (RCA) and Service 5C (Attachment) for observability.
//   - PARSE_STRONG:    >= 0.90 — No meaningful technical failures.
//   - ACCEPTABLE:      >= 0.75 — Minor issues, acceptable for processing.
//   - WEAK:            >= 0.50 — Significant issues, proceed with caution.
//   - REVIEW_REQUIRED: < 0.50 — Critical failures; row needs human review.
func ComputeParseQualityLabel(parseConf float64) string {
	switch {
	case parseConf >= 0.90:
		return "PARSE_STRONG"
	case parseConf >= 0.75:
		return "ACCEPTABLE"
	case parseConf >= 0.50:
		return "WEAK"
	default:
		return "REVIEW_REQUIRED"
	}
}

// ComputeMappingConfidence calculates semantic mapping reliability on a 0.0-1.0 scale.
// Formula: Weighted average of field confidence for fields that existed in source, minus penalties.
// This distinguishes between Case A (mapping failure) and Case B (data not in source).
func ComputeMappingConfidence(inputs models.MappingConfidenceInputs) float64 {
	weights := map[string]float64{
		"amount":      20.0,
		"currency":    10.0,
		"status":      15.0,
		"timestamp":   15.0,
		"providerRef": 10.0,
		"bankRef":     10.0,
		"clientRef":   20.0,
	}

	var totalWeight float64
	var totalConfidence float64

	// Field Confidence (1.0 if mapped, 0.0 if failed but existed)
	checkField := func(existed, mapped bool, weightKey string) {
		if existed {
			weight := weights[weightKey]
			totalWeight += weight
			if mapped {
				totalConfidence += weight * 1.0
			}
		}
	}

	checkField(inputs.AmountExisted, inputs.AmountMapped, "amount")
	checkField(inputs.CurrencyExisted, inputs.CurrencyMapped, "currency")
	checkField(inputs.StatusExisted, inputs.StatusMapped, "status")
	checkField(inputs.TimestampExisted, inputs.TimestampMapped, "timestamp")
	checkField(inputs.ProviderRefExisted, inputs.ProviderRefMapped, "providerRef")
	checkField(inputs.BankRefExisted, inputs.BankRefMapped, "bankRef")
	checkField(inputs.ClientRefExisted, inputs.ClientRefMapped, "clientRef")

	score := 1.0
	if totalWeight > 0 {
		score = totalConfidence / totalWeight
	}

	// ── Penalties (on 0.0-1.0 scale) ──────────────────────────────────────────
	if inputs.AmountExisted && !inputs.AmountMapped {
		score -= 0.25
	}
	if inputs.CurrencyExisted && !inputs.CurrencyMapped {
		score -= 0.15
	}
	if inputs.StatusExisted && !inputs.StatusMapped {
		score -= 0.15
	}
	if inputs.TimestampExisted && !inputs.TimestampMapped {
		score -= 0.10
	}
	if inputs.CriticalFieldUnmapped {
		score -= 0.15
	}
	if inputs.MappingProfileFallbackUsed {
		score -= 0.10
	}

	if score < 0.0 {
		score = 0.0
	}
	if score > 1.0 {
		score = 1.0
	}

	return score
}

// ComputeCarrierRichnessScore evaluates the data richness of an observation for matching.
// It uses a weighted formula based on the presence of various reference carriers.
func ComputeCarrierRichnessScore(shape models.UniversalSettlementShape) float64 {
	var score float64

	if shape.ClientReferenceCandidate != nil && *shape.ClientReferenceCandidate != "" {
		score += 0.35
	}
	if shape.ProviderReference != nil && *shape.ProviderReference != "" {
		score += 0.20
	}
	if shape.BankReference != nil && *shape.BankReference != "" {
		score += 0.20
	}
	if shape.ExternalReference != nil && *shape.ExternalReference != "" {
		score += 0.10
	}
	if shape.BatchReference != nil && *shape.BatchReference != "" {
		score += 0.10
	}
	// Basic transaction identity
	if !shape.Amount.IsZero() && shape.CurrencyCode != "" {
		score += 0.05
	}

	if score > 1.0 {
		score = 1.0
	}
	return score
}

// ComputeAttachmentReadinessScore evaluates the probability that an observation will attach cleanly in Service 5C.
// It combines reference strength, data physical strength, timing, context, and technical trust.
// Returns the overall score (0.0-1.0) and a serialized JSON breakdown of the components.
func ComputeAttachmentReadinessScore(shape models.UniversalSettlementShape, parseConf, mapConf float64) (float64, []byte) {
	// 1. Direct Reference Strength (25%)
	var refScore float64
	if shape.ClientReferenceCandidate != nil && *shape.ClientReferenceCandidate != "" {
		refScore += 40
	}
	if shape.ProviderReference != nil && *shape.ProviderReference != "" {
		refScore += 30
	}
	if shape.BankReference != nil && *shape.BankReference != "" {
		refScore += 20
	}
	if shape.ExternalReference != nil && *shape.ExternalReference != "" {
		refScore += 10
	}
	refStrength := refScore / 100.0

	// 2. Party Amount Strength (20%)
	// NOTE: ClientReferenceCandidate is intentionally NOT here — it is already
	// accounted for in refStrength above. Including it here would double-count it.
	var physicalScore float64
	if shape.SettledAmount != nil && !shape.SettledAmount.IsZero() {
		physicalScore += 55
	}
	if shape.CurrencyCode != "" {
		physicalScore += 30
	}
	if !shape.Amount.IsZero() {
		physicalScore += 15
	}
	physicalStrength := physicalScore / 100.0

	// 3. Timing Strength (15%)
	timingStrength := 0.0
	if !shape.ObservationTimestamp.IsZero() {
		timingStrength = 1.0
	}

	// 4. Batch Context Strength (15%)
	batchStrength := 0.0
	if shape.BatchReference != nil && *shape.BatchReference != "" {
		batchStrength = 1.0
	}

	// 5. Parser Mapping Trust (15%)
	trustStrength := (parseConf + mapConf) / 2.0

	// 6. Source Strength (10%)
	sourceStrength := 0.30 // DEFAULT: UNKNOWN
	switch shape.SourceStrengthClass {
	case "BANK_LEDGER":
		sourceStrength = 1.0
	case "PSP_REPORT":
		sourceStrength = 0.85
	case "INTERNAL_EXPORT":
		sourceStrength = 0.65
	case "MANUAL_UPLOAD":
		sourceStrength = 0.45
	}

	totalScore := (0.25 * refStrength) +
		(0.20 * physicalStrength) +
		(0.15 * timingStrength) +
		(0.15 * batchStrength) +
		(0.15 * trustStrength) +
		(0.10 * sourceStrength)

	if totalScore < 0 {
		totalScore = 0
	}
	if totalScore > 1.0 {
		totalScore = 1.0
	}

	breakdown := AttachmentScoreBreakdown{
		DirectReferenceStrength: refStrength,
		PartyAmountStrength:     physicalStrength,
		TimingStrength:          timingStrength,
		BatchContextStrength:    batchStrength,
		ParserMappingTrust:      trustStrength,
		SourceStrength:          sourceStrength,
	}
	b, _ := json.Marshal(breakdown)

	return totalScore, b
}

// AttachmentScoreBreakdown captures each sub-component of the attachment readiness score
// for audit, RCA, and Service 5C observability. All sub-scores are on the 0.0–1.0 scale.
type AttachmentScoreBreakdown struct {
	DirectReferenceStrength float64 `json:"direct_reference_strength"`
	PartyAmountStrength     float64 `json:"party_amount_strength"`
	TimingStrength          float64 `json:"timing_strength"`
	BatchContextStrength    float64 `json:"batch_context_strength"`
	ParserMappingTrust      float64 `json:"parser_mapping_trust"`
	SourceStrength          float64 `json:"source_strength"`
}
