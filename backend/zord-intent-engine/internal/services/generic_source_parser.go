package services

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/shopspring/decimal"
	"zord-intent-engine/internal/models"
)

type GenericSourceParser struct{}

func NewGenericSourceParser() *GenericSourceParser {
	return &GenericSourceParser{}
}

// ParseToCanonicalJSON returns the canonical JSON bytes ready for json.Unmarshal into ParsedIncomingIntent.
// This is called from intent_service.go Step 4 — after decrypt, before normalizer.
func (p *GenericSourceParser) ParseToCanonicalJSON(
	rawJSON []byte,
	profile *models.MappingProfile,
) ([]byte, error) {
	// Unmarshal the raw JSON (keys = tenant's column headers)
	var raw map[string]any
	if err := json.Unmarshal(rawJSON, &raw); err != nil {
		return nil, fmt.Errorf("raw JSON unmarshal: %w", err)
	}

	// Build colIndex: lowercase tenant column name → value in raw
	lowerRaw := make(map[string]any, len(raw))
	for k, v := range raw {
		lowerRaw[strings.ToLower(strings.TrimSpace(k))] = v
	}

	canonical := make(map[string]any)
	if sourceRowRef, ok := raw["source_row_ref"]; ok {
		canonical["source_row_ref"] = sourceRowRef
	}

	// For each entry in profile.ColumnMap: universalField → tenantColumnName
	// Read the value from lowerRaw using tenantColumnName (lowercased)
	for universalField, tenantCol := range profile.ColumnMap {
		val, ok := lowerRaw[strings.ToLower(strings.TrimSpace(tenantCol))]
		if !ok || val == nil || val == "" {
			continue
		}
		// Apply type normalization per field
		normalized := applyFieldNormalization(universalField, fmt.Sprintf("%v", val), profile)
		setNestedValue(canonical, universalField, normalized)
	}

	// Apply defaults from profile
	ensureProfileDefaults(canonical, profile)

	return json.Marshal(canonical)
}

func applyFieldNormalization(field string, rawVal string, profile *models.MappingProfile) any {
	rawVal = strings.TrimSpace(rawVal)
	if rawVal == "" {
		return ""
	}

	switch field {
	case "amount.value":
		// Use exact decimal arithmetic — never pass through float64.
		d, err := parseRawAmount(rawVal, profile.AmountFormat)
		if err != nil {
			return rawVal // Fallback to raw value on parse error
		}
		// Return the decimal's string representation formatted to two decimal places.
		return d.StringFixed(2)

	case "intended_execution_at":
		t, err := parseFlexibleDate(rawVal, profile.DateFormat)
		if err != nil {
			return "" // Fallback to raw date string
		}
		return t.Format(time.RFC3339)

	default:
		return rawVal
	}
}

// parseRawAmount strips formatting characters and returns an exact decimal.Decimal.
// Using shopspring/decimal avoids IEEE-754 float64 rounding on large monetary values
// (e.g. 1234567.89 stored as 1234567.8900000001 in float64).
func parseRawAmount(raw string, format models.AmountFormat) (decimal.Decimal, error) {
	if strings.TrimSpace(raw) == "" {
		return decimal.Zero, fmt.Errorf("amount is empty")
	}

	// Strip currency symbols, thousand-separators and whitespace; keep digits, '.', '-'.
	cleaned := strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) || r == '.' || r == '-' {
			return r
		}
		return -1
	}, raw)

	d, err := decimal.NewFromString(cleaned)
	if err != nil {
		return decimal.Zero, fmt.Errorf("cannot parse amount %q: %w", raw, err)
	}

	// Paise → rupees: exact integer division, no float rounding.
	if format == models.AmountFormatPaise {
		d = d.Div(decimal.NewFromInt(100))
	}
	return d, nil
}

func parseFlexibleDate(raw string, preferredLayout string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, fmt.Errorf("date is empty")
	}

	// 1. Try Excel serial date number
	if val, err := strconv.ParseFloat(raw, 64); err == nil {
		excelEpoch := time.Date(1899, time.December, 30, 0, 0, 0, 0, time.UTC)
		t := excelEpoch.AddDate(0, 0, int(val))
		fraction := val - float64(int(val))
		if fraction > 0 {
			t = t.Add(time.Duration(fraction * float64(24*time.Hour)))
		}
		return t, nil
	}

	// 2. Build candidate layouts list
	layouts := []string{}

	if preferredLayout != "" {
		layouts = append(layouts, preferredLayout)

		if strings.Contains(preferredLayout, "2006") {
			twoDigitLayout := strings.Replace(preferredLayout, "2006", "06", 1)
			layouts = append(layouts, twoDigitLayout)
		}
		if strings.Contains(preferredLayout, "06") && !strings.Contains(preferredLayout, "2006") {
			fourDigitLayout := strings.Replace(preferredLayout, "06", "2006", 1)
			layouts = append(layouts, fourDigitLayout)
		}
	}

	// General fallback formats
	fallbackLayouts := []string{
		"02-01-2006",
		"01-02-2006",
		"2006-01-02",
		"02/01/2006",
		"01/02/2006",
		"2006/01/02",
		"02-01-06",
		"01-02-06",
		"02/01/06",
		"01/02/06",
		"06-01-02",
		"06/01/02",
		"Jan 2, 2006",
		"2 Jan 2006",
		"02 Jan 2006",
		"January 2, 2006",
		"2 January 2006",
		"02 January 2006",
		time.RFC3339,
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	}

	for _, layout := range fallbackLayouts {
		isDup := false
		for _, existing := range layouts {
			if existing == layout {
				isDup = true
				break
			}
		}
		if !isDup {
			layouts = append(layouts, layout)
		}
	}

	var firstErr error
	for _, layout := range layouts {
		t, err := time.Parse(layout, raw)
		if err == nil {
			return t, nil
		}
		if firstErr == nil {
			firstErr = err
		}
	}

	return time.Time{}, firstErr
}

// setNestedValue sets a value at a dot-path in a nested map.
// "amount.value" → m["amount"]["value"] = val
func setNestedValue(m map[string]any, path string, val any) {
	parts := strings.SplitN(path, ".", 2)
	if len(parts) == 1 {
		m[parts[0]] = val
		return
	}
	if _, ok := m[parts[0]]; !ok {
		m[parts[0]] = make(map[string]any)
	}
	if sub, ok := m[parts[0]].(map[string]any); ok {
		setNestedValue(sub, parts[1], val)
	}
}

func ensureProfileDefaults(canonical map[string]any, profile *models.MappingProfile) {
	// Ensure amount map exists
	amtVal, exists := canonical["amount"]
	var amtMap map[string]any
	if exists {
		if m, ok := amtVal.(map[string]any); ok {
			amtMap = m
		} else {
			amtMap = make(map[string]any)
			canonical["amount"] = amtMap
		}
	} else {
		amtMap = make(map[string]any)
		canonical["amount"] = amtMap
	}

	// Default currency
	if amtMap["currency"] == nil || amtMap["currency"] == "" {
		amtMap["currency"] = profile.DefaultCurrency
		if amtMap["currency"] == "" {
			amtMap["currency"] = "INR"
		}
	}

	// Default intent_type — every Tally/ERP row is a PAYOUT unless the profile
	// or the row itself provides a different value.
	if v, _ := canonical["intent_type"].(string); v == "" {
		if profile.DefaultIntentType != "" {
			canonical["intent_type"] = profile.DefaultIntentType
		} else {
			canonical["intent_type"] = "PAYOUT"
		}
	}
}
