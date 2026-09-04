package services

import (
	"fmt"

	"github.com/google/uuid"
	"zord-outcome-engine/models"
)

// RunLevelErrorKind is the failure_reason_code written to settlement_ingest_runs
// when a parser returns a fatal, file-level error.
type RunLevelErrorKind string

const (
	// RunLevelFileCorrupted means the file cannot be read at all (corrupt bytes,
	// missing sheets, empty file, CSV read failure, etc.).
	RunLevelFileCorrupted RunLevelErrorKind = "FILE_CORRUPTED"

	// RunLevelUnsupportedFormat means the file is readable but its structure
	// (headers, column names, column count) does not match the expected format.
	RunLevelUnsupportedFormat RunLevelErrorKind = "UNSUPPORTED_FORMAT"
)

// RunLevelError is returned by SettlementParser.Parse for fatal file-level failures.
// The handler extracts Kind to set settlement_ingest_runs.failure_reason_code.
type RunLevelError struct {
	Kind    RunLevelErrorKind
	Message string
}

func (e *RunLevelError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Kind, e.Message)
}

// SettlementParser is the interface every PSP-specific parser must implement.
// Adding a new PSP means writing a new struct that implements this interface.
// The rest of the pipeline (canonicalization, outbox, scoring) never changes.
type SettlementParser interface {
	// Parse reads raw file bytes and returns one ParsedRowResult per data row.
	// sourceFileRef is the S3 object path. envelopeID is the raw envelope UUID.
	// Fatal file-level failures are returned as *RunLevelError (never nil error for row issues).
	// Row-level failures are represented as ParsedRowResult{Failed: true}, never as errors.
	Parse(fileBytes []byte, sourceFileRef string, envelopeID uuid.UUID, profile models.MappingProfile) ([]ParsedRowResult, error)
}

// ParsedRowResult captures the standard output of parsing a single spreadsheet row.
// Used to decouple parsing logic from the database storage layer.
type ParsedRowResult struct {
	RowIndex      int
	Shape         models.UniversalSettlementShape
	RawColumns    map[string]string // Key-value map of original column headers to cell values
	Warnings      []string          // Non-fatal parse issues
	Confidence    float64           // 0.0 to 1.0 scoring based on data richness
	Failed        bool              // Flag for fatal row-level failure
	FailureReason string            // Description if Failed is true
}

// ParseConfidenceInputs captures the raw technical signals used to calculate parse reliability.
// This allows the engine to distinguish between technical parser problems and missing business identifiers.
type ParseConfidenceInputs struct {
	FileFormatValid                bool
	RowDecodedSuccessfully         bool
	ColumnCountConsistent          bool
	HeaderDetected                 bool
	AmountParseSuccess             bool
	TimestampParseSuccess          bool
	StatusParseSuccess             bool
	EncodingValid                  bool
	RawLineHashCreated             bool
	DuplicateHeaderOrFooterDetected bool
	PartialRowParse                bool
	TimestampFallbackUsed          bool
	AmountFallbackUsed             bool
	StatusAmbiguous                bool
}

