package canonicalizer

import (
	"strings"
	"time"

	"zord-intent-engine/internal/jcs"
)

// CanonicalizationVersion identifies the version of the canonicalization
// rules (amount -> minor units, currency -> uppercase, strings -> trim) used
// to interpret a source row. Bump this whenever those rules change.
const CanonicalizationVersion = "1"

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
// canonical_row_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...interpreted business fields}))
// for a single row.
func ComputeCanonicalRowHash(in CanonicalRowHashInput) (string, error) {
	execAt := ""
	if in.IntendedExecutionAt != nil {
		execAt = in.IntendedExecutionAt.UTC().Format(time.RFC3339)
	}

	fields := map[string]any{
		"hash_type":               "CANONICAL_ROW",
		"hash_version":            "1",
		"source_row_ref":          strings.TrimSpace(in.SourceRowRef),
		"client_payout_ref":       strings.TrimSpace(in.ClientPayoutRef),
		"beneficiary_fingerprint": in.BeneficiaryFingerprint,
		"amount_minor":            in.AmountMinor,
		"currency":                strings.ToUpper(strings.TrimSpace(in.Currency)),
		"intended_execution_at":   execAt,
		"payment_rail":            strings.ToUpper(strings.TrimSpace(in.PaymentRail)),
		"invoice_ref":             strings.TrimSpace(in.InvoiceRef),
	}

	return jcs.CanonicalizeAndSHA256(fields)
}

// ManifestRow is a single row entry inside a FileManifest.
type ManifestRow struct {
	SourceRowRef      string
	CanonicalRowHash  string
	AmountMinor       int64
	Currency          string
	BusinessReference string
}

// FileManifest describes the batch-level artifact whose hash is stored as
// canonical_batches.file_manifest_hash (canonical_payload_manifest_hash in
// the hash spec). ManifestSchemaVersion/ArtifactID/ArtifactVersionID/
// PayloadType are populated by upstream services and are not derived here —
// they are hashed as-is, including when empty.
type FileManifest struct {
	ManifestSchemaVersion   string
	ArtifactID              string
	ArtifactVersionID       string
	PayloadType             string
	CanonicalizationVersion string
	MappingProfileHash      string
	RowCount                int
	Rows                    []ManifestRow
}

// ComputeFileManifestHash returns
// canonical_payload_manifest_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...manifest identity, rows}))
// for a batch. Row order within m.Rows is preserved as given — callers are
// responsible for sorting rows deterministically (source_row_ref, then
// business_reference, then canonical_row_hash) before calling this.
func ComputeFileManifestHash(m FileManifest) (string, error) {
	rows := make([]any, len(m.Rows))
	for i, r := range m.Rows {
		rows[i] = map[string]any{
			"source_row_ref":     r.SourceRowRef,
			"canonical_row_hash": r.CanonicalRowHash,
			"amount_minor":       r.AmountMinor,
			"currency":           strings.ToUpper(strings.TrimSpace(r.Currency)),
			"business_reference": r.BusinessReference,
		}
	}

	manifest := map[string]any{
		"hash_type":                "CANONICAL_PAYLOAD_MANIFEST",
		"hash_version":             "1",
		"manifest_schema_version":  m.ManifestSchemaVersion,
		"artifact_id":              m.ArtifactID,
		"artifact_version_id":      m.ArtifactVersionID,
		"payload_type":             m.PayloadType,
		"canonicalization_version": m.CanonicalizationVersion,
		"mapping_profile_hash":     m.MappingProfileHash,
		"row_count":                m.RowCount,
		"rows":                     rows,
	}

	return jcs.CanonicalizeAndSHA256(manifest)
}
