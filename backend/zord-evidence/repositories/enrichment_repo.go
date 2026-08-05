package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
	"zord-evidence/models"
)

// EnrichmentRepository handles the spec §4/§6/§7 enrichment columns on evidence_packs.
// It embeds *EvidenceRepository so all existing repository methods remain available.
type EnrichmentRepository struct {
	*EvidenceRepository
}

func NewEnrichmentRepository(db *sql.DB) *EnrichmentRepository {
	return &EnrichmentRepository{EvidenceRepository: NewEvidenceRepository(db)}
}

// UpdateProofEnrichment persists proof_status, proof_score, proof_components_json,
// cryptographic_signatures_json, and proof_score_breakdown_json onto the pack row.
// Called immediately after SavePack in GeneratePack and GenerateBatchPack so the
// enrichment columns are always in sync with the sealed pack.
func (r *EnrichmentRepository) UpdateProofEnrichment(
	ctx context.Context,
	packID string,
	status models.ProofStatus,
	score int,
	comp models.ProofComponents,
	sigs models.CryptographicSignatures,
	scoreBreakdown models.ProofScoreResult,
	_ interface{}, // reserved — was svc2, no longer stored as JSONB
	_ interface{}, // reserved — was svc5, no longer stored as JSONB
) error {
	compJSON, _ := json.Marshal(comp)
	sigsJSON, _ := json.Marshal(sigs)
	breakdownJSON, _ := json.Marshal(scoreBreakdown)

	_, err := r.db.ExecContext(ctx, `
UPDATE evidence_packs
SET proof_status                   = $2,
    proof_score                    = $3,
    proof_components_json          = $4,
    cryptographic_signatures_json  = $5,
    proof_score_breakdown_json     = $6,
    updated_at                     = NOW()
WHERE evidence_pack_id = $1`,
		packID,
		string(status),
		score,
		compJSON,
		sigsJSON,
		breakdownJSON,
	)
	if err != nil {
		return fmt.Errorf("update proof enrichment: %w", err)
	}
	return nil
}

// MarkVerified updates verification_status and last_verified_at after a
// cryptographic verify check (spec §7). Sets proof_status to VERIFIED on success.
func (r *EnrichmentRepository) MarkVerified(ctx context.Context, packID string, verified bool, verifiedAt time.Time) error {
	_, err := r.db.ExecContext(ctx, `
UPDATE evidence_packs
SET verification_status = $2,
    last_verified_at    = $3,
    proof_status        = CASE WHEN $2 = TRUE THEN 'VERIFIED' ELSE proof_status END,
    updated_at          = NOW()
WHERE evidence_pack_id  = $1`,
		packID, verified, verifiedAt,
	)
	if err != nil {
		return err
	}
	if verified {
		return r.MarkPackSignaturesVerified(ctx, packID, true)
	}
	return nil
}

// GetEnrichedFields fetches all persisted enrichment columns for a pack.
// Returns safe zero-value defaults if the migration has not been applied yet.
// The two trailing nil returns are reserved placeholders (formerly svc2/svc5 JSONB).
func (r *EnrichmentRepository) GetEnrichedFields(ctx context.Context, packID string) (
	proofStatus string,
	proofScore int,
	generatedBy string,
	lastVerifiedAt *time.Time,
	verificationStatus bool,
	exportCount int,
	proofComponents models.ProofComponents,
	cryptoSigs models.CryptographicSignatures,
	scoreBreakdown models.ProofScoreResult,
	_ interface{}, // reserved
	_ interface{}, // reserved
	err error,
) {
	var (
		psSQL     sql.NullString
		scoreSQL  sql.NullInt32
		genBySQL  sql.NullString
		lvAtSQL   sql.NullTime
		verSQL    sql.NullBool
		expCntSQL sql.NullInt32
		compJSON  []byte
		sigsJSON  []byte
		breakJSON []byte
	)

	row := r.db.QueryRowContext(ctx, `
SELECT
    COALESCE(proof_status, 'DRAFT'),
    COALESCE(proof_score, 0),
    COALESCE(generated_by, 'system'),
    last_verified_at,
    COALESCE(verification_status, FALSE),
    COALESCE(export_count, 0),
    proof_components_json,
    cryptographic_signatures_json,
    proof_score_breakdown_json
FROM evidence_packs
WHERE evidence_pack_id = $1`, packID)

	err = row.Scan(
		&psSQL, &scoreSQL, &genBySQL, &lvAtSQL, &verSQL, &expCntSQL,
		&compJSON, &sigsJSON, &breakJSON,
	)
	if err != nil {
		err = nil // safe fallback if columns don't exist yet
		return
	}

	if psSQL.Valid {
		proofStatus = psSQL.String
	}
	if scoreSQL.Valid {
		proofScore = int(scoreSQL.Int32)
	}
	if genBySQL.Valid {
		generatedBy = genBySQL.String
	}
	if lvAtSQL.Valid {
		t := lvAtSQL.Time
		lastVerifiedAt = &t
	}
	if verSQL.Valid {
		verificationStatus = verSQL.Bool
	}
	if expCntSQL.Valid {
		exportCount = int(expCntSQL.Int32)
	}

	_ = json.Unmarshal(compJSON, &proofComponents)
	_ = json.Unmarshal(sigsJSON, &cryptoSigs)
	_ = json.Unmarshal(breakJSON, &scoreBreakdown)
	return
}
