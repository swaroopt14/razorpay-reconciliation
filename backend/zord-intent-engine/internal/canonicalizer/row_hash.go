package canonicalizer

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

// jcsCanonicalize serializes v into a deterministic JSON byte sequence:
// object keys sorted (Go's encoding/json sorts map[string]any keys
// lexicographically), no insignificant whitespace, and no HTML-escaping.
// This matches RFC 8785 (JCS) output for the flat, ASCII-keyed objects
// hashed in this package.
func jcsCanonicalize(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// CanonicalRowHashInput holds the interpreted business fields of a single
// row. Formatting-only differences upstream (whitespace, header casing,
// column order) never reach this struct because every field is normalized
// before hashing — only true business-content changes flip the resulting
// hash.
type CanonicalRowHashInput struct {
	SourceRowRef           string
	ClientPayoutRef        string
	BeneficiaryFingerprint string
	AmountMinor            int64
	Currency               string
	IntendedExecutionAt    *time.Time
	PaymentRail            string
	InvoiceRef             string
}

// ComputeCanonicalRowHash returns
// SHA-256(JCS_Canonicalize(interpreted business fields)) for a single row.
func ComputeCanonicalRowHash(in CanonicalRowHashInput) (string, error) {
	execAt := ""
	if in.IntendedExecutionAt != nil {
		execAt = in.IntendedExecutionAt.UTC().Format(time.RFC3339)
	}

	fields := map[string]any{
		"source_row_ref":          strings.TrimSpace(in.SourceRowRef),
		"client_payout_ref":       strings.TrimSpace(in.ClientPayoutRef),
		"beneficiary_fingerprint": in.BeneficiaryFingerprint,
		"amount":                  in.AmountMinor,
		"currency":                strings.ToUpper(strings.TrimSpace(in.Currency)),
		"intended_execution_at":   execAt,
		"payment_rail":            strings.ToUpper(strings.TrimSpace(in.PaymentRail)),
		"invoice_ref":             strings.TrimSpace(in.InvoiceRef),
	}

	canonicalBytes, err := jcsCanonicalize(fields)
	if err != nil {
		return "", err
	}
	return sha256Hex(canonicalBytes), nil
}

// ManifestRow is a single row entry inside a FileManifest.
type ManifestRow struct {
	SourceRowRef     string
	CanonicalRowHash string
	AmountMinor      int64
	ClientPayoutRef  string
}

// FileManifest describes the batch-level artifact whose hash is stored as
// canonical_batches.file_manifest_hash. ManifestSchemaVersion, ArtifactID,
// ArtifactVersionID and PayloadType are populated by upstream services; they
// are hashed as-is (including when empty) and are not derived here.
type FileManifest struct {
	ManifestSchemaVersion string
	ArtifactID            string
	ArtifactVersionID     string
	PayloadType           string
	Currency              string
	RowCount              int
	Rows                  []ManifestRow
}

// ComputeFileManifestHash returns
// SHA-256(JCS_Canonicalize(canonical ordered manifest)) for a batch. Row
// order within m.Rows is preserved as given (the "ordered manifest") —
// callers are responsible for passing rows in a stable, deterministic order.
func ComputeFileManifestHash(m FileManifest) (string, error) {
	rows := make([]any, len(m.Rows))
	for i, r := range m.Rows {
		rows[i] = map[string]any{
			"source_row_ref":     r.SourceRowRef,
			"canonical_row_hash": r.CanonicalRowHash,
			"amount":             r.AmountMinor,
			"client_payout_ref":  r.ClientPayoutRef,
		}
	}

	manifest := map[string]any{
		"manifest_schema_version": m.ManifestSchemaVersion,
		"artifact_id":             m.ArtifactID,
		"artifact_version_id":     m.ArtifactVersionID,
		"payload_type":            m.PayloadType,
		"currency":                m.Currency,
		"row_count":               m.RowCount,
		"rows":                    rows,
	}

	canonicalBytes, err := jcsCanonicalize(manifest)
	if err != nil {
		return "", err
	}
	return sha256Hex(canonicalBytes), nil
}
