package services

import "zord-edge/model"

// IntentParser is the interface every parser must satisfy.
// Each implementation (Bank, NBFC, etc.) encapsulates its own 
// static column mapping logic.
type IntentParser interface {
	Parse(
		rows    [][]string,
		headers []string,
	) (shapes []model.UniversalIntentShape, errors []ParseRowError)
}

// ParseRowError describes a failure on a specific row + field.
type ParseRowError struct {
	RowIndex int    // 1-based row number in the original file
	Field    string // universal field name that failed, e.g. "amount"
	Message  string // human-readable reason
}
