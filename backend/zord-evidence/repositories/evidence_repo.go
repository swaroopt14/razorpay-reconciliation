package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
	"zord-evidence/models"

	"github.com/shopspring/decimal"
)

type EvidenceRepository struct {
	db *sql.DB
}

func NewEvidenceRepository(db *sql.DB) *EvidenceRepository {
	return &EvidenceRepository{db: db}
}

func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}

// SavePack persists the full evidence pack in a single transaction:
//   - evidence_packs row (§14.1)
//   - evidence_items rows (§14.2)
//   - evidence_signatures rows
//   - evidence_outbox_events row (for relay polling)
func (r *EvidenceRepository) SavePack(ctx context.Context, pack *models.EvidencePack, objectRef string, outboxEvent *models.OutboxEvent) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	schemaVersionsJSON, _ := json.Marshal(pack.SchemaVersions)

	_, err = tx.ExecContext(ctx, `
INSERT INTO evidence_packs(
	evidence_pack_id, tenant_id, intent_id, contract_id, batch_id, client_payout_ref, amount, currency, mode, pack_status, merkle_root,
	ruleset_version, schema_versions_json, signature_alg, signature_value, object_ref,
	supersedes_pack_id, pack_completeness_score, leaf_count, required_leaf_count,
	settlement_leaf_present_flag, attachment_decision_leaf_present_flag, 
	payment_instruction_received, canonical_intent_created, mapping_profile_used,
	required_fields_status, tokenization_status, governance_decision,
	settlement_record_received, canonical_settlement_created, bank_reference,
	client_reference, attachment_decision, match_confidence,
	value_date_check, amount_match, zord_signature,
	created_at, updated_at
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)`,
		pack.EvidencePackID,
		pack.TenantID,
		nullStr(pack.IntentID),
		nullStr(pack.ContractID),
		nullStr(pack.ClientBatchID),
		pack.ClientPayoutRef,
		pack.Amount,
		pack.Currency,
		pack.Mode,
		"ACTIVE",
		pack.MerkleRoot,
		pack.RulesetVersion,
		schemaVersionsJSON,
		"ed25519",
		pack.Signatures[0].Sig,
		objectRef,
		nullStr(pack.SupersedesPackID),
		pack.PackCompletenessScore,
		pack.LeafCount,
		pack.RequiredLeafCount,
		pack.SettlementLeafPresentFlag,
		pack.AttachmentDecisionLeafPresentFlag,
		pack.PaymentInstructionReceived,
		pack.CanonicalIntentCreated,
		pack.MappingProfileUsed,
		pack.RequiredFieldsStatus,
		pack.TokenizationStatus,
		pack.GovernanceDecision,
		pack.SettlementRecordReceived,
		pack.CanonicalSettlementCreated,
		pack.BankReference,
		pack.ClientReference,
		pack.AttachmentDecision,
		pack.MatchConfidence,
		pack.ValueDateCheck,
		pack.AmountMatch,
		nullStr(pack.ZordSignature),
		pack.CreatedAt,
		pack.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert pack: %w", err)
	}

	for i, item := range pack.Items {
		_, err = tx.ExecContext(ctx, `
INSERT INTO evidence_items(
	evidence_pack_id, position_index, item_type, item_ref, item_hash, leaf_hash, schema_version
) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			pack.EvidencePackID,
			i,
			item.Type,
			item.Ref,
			item.Hash,
			item.LeafHash,
			item.SchemaVersion,
		)
		if err != nil {
			return fmt.Errorf("insert evidence item: %w", err)
		}
	}

	for _, sig := range pack.Signatures {
		_, err = tx.ExecContext(ctx, `
INSERT INTO evidence_signatures(evidence_pack_id, signer, alg, signature, signed_at)
VALUES($1,$2,$3,$4,$5)`,
			pack.EvidencePackID, sig.Signer, sig.Alg, sig.Sig, sig.SignedAt)
		if err != nil {
			return fmt.Errorf("insert signature: %w", err)
		}
	}

	if outboxEvent != nil {
		if err := r.SaveToOutbox(ctx, tx, outboxEvent); err != nil {
			return fmt.Errorf("save to outbox: %w", err)
		}
	}

	return tx.Commit()
}

func (r *EvidenceRepository) SaveToOutbox(ctx context.Context, tx *sql.Tx, event *models.OutboxEvent) error {
	query := `
INSERT INTO evidence_outbox_events (
	trace_id, envelope_id, tenant_id, contract_id, aggregate_type, aggregate_id, 
	event_type, payload, status, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
`
	var err error
	if tx != nil {
		_, err = tx.ExecContext(ctx, query,
			nullStr(event.TraceID), nullStr(event.EnvelopeID), event.TenantID, nullStr(event.ContractID),
			event.AggregateType, event.AggregateID, event.EventType,
			event.Payload, event.Status, event.CreatedAt,
		)
	} else {
		_, err = r.db.ExecContext(ctx, query,
			nullStr(event.TraceID), nullStr(event.EnvelopeID), event.TenantID, nullStr(event.ContractID),
			event.AggregateType, event.AggregateID, event.EventType,
			event.Payload, event.Status, event.CreatedAt,
		)
	}
	return err
}

// GetPackByID fetches a pack with its items from evidence_packs + evidence_items.
func (r *EvidenceRepository) GetPackByID(ctx context.Context, packID string) (*models.EvidencePack, string, error) {
	pack := &models.EvidencePack{SchemaVersions: map[string]string{}}
	var objectRef string
	var createdAt time.Time
	var signature string
	var sigAlg string
	var intentID, contractID, batchID, supersedesPackID sql.NullString
	var schemaVersionsJSON []byte

	var srr, csc sql.NullTime
	var br, cr, ad sql.NullString
	var mc sql.NullFloat64
	var vdc, am sql.NullBool

	var clientPayoutRef sql.NullString
	var currency sql.NullString
	var amount decimal.NullDecimal

	q := `SELECT tenant_id, intent_id, contract_id, batch_id, client_payout_ref, amount, currency, mode, pack_status, merkle_root,
	             ruleset_version, schema_versions_json, signature_alg, signature_value,
	             object_ref, supersedes_pack_id, pack_completeness_score, leaf_count,
	             required_leaf_count, settlement_leaf_present_flag, attachment_decision_leaf_present_flag,
	             payment_instruction_received, canonical_intent_created, mapping_profile_used,
	             required_fields_status, tokenization_status, governance_decision,
	             settlement_record_received, canonical_settlement_created, bank_reference,
	             client_reference, attachment_decision, match_confidence,
	             value_date_check, amount_match, zord_signature,
	             created_at
	      FROM evidence_packs WHERE evidence_pack_id=$1`
	err := r.db.QueryRowContext(ctx, q, packID).Scan(
		&pack.TenantID, &intentID, &contractID, &batchID, &clientPayoutRef, &amount, &currency, &pack.Mode, &pack.PackStatus,
		&pack.MerkleRoot, &pack.RulesetVersion, &schemaVersionsJSON,
		&sigAlg, &signature, &objectRef, &supersedesPackID,
		&pack.PackCompletenessScore, &pack.LeafCount, &pack.RequiredLeafCount,
		&pack.SettlementLeafPresentFlag, &pack.AttachmentDecisionLeafPresentFlag,
		&pack.PaymentInstructionReceived, &pack.CanonicalIntentCreated, &pack.MappingProfileUsed,
		&pack.RequiredFieldsStatus, &pack.TokenizationStatus, &pack.GovernanceDecision,
		&srr, &csc, &br, &cr, &ad, &mc, &vdc, &am, &pack.ZordSignature,
		&createdAt,
	)
	if err != nil {
		return nil, "", err
	}
	if intentID.Valid {
		pack.IntentID = intentID.String
	}
	if contractID.Valid {
		pack.ContractID = contractID.String
	}
	if batchID.Valid {
		pack.ClientBatchID = batchID.String
	}
	if supersedesPackID.Valid {
		pack.SupersedesPackID = supersedesPackID.String
	}
	if srr.Valid {
		pack.SettlementRecordReceived = &srr.Time
	}
	if csc.Valid {
		pack.CanonicalSettlementCreated = &csc.Time
	}
	if br.Valid {
		pack.BankReference = &br.String
	}
	if cr.Valid {
		pack.ClientReference = &cr.String
	}
	if ad.Valid {
		pack.AttachmentDecision = &ad.String
	}
	if mc.Valid {
		pack.MatchConfidence = &mc.Float64
	}
	if vdc.Valid {
		pack.ValueDateCheck = &vdc.Bool
	}
	if am.Valid {
		pack.AmountMatch = &am.Bool
	}
	if clientPayoutRef.Valid {
		pack.ClientPayoutRef = &clientPayoutRef.String
	}
	if amount.Valid {
		pack.Amount = amount.Decimal
	}
	if currency.Valid {
		pack.Currency = currency.String
	}
	if len(schemaVersionsJSON) > 0 {
		_ = json.Unmarshal(schemaVersionsJSON, &pack.SchemaVersions)
	}
	pack.EvidencePackID = packID
	pack.CreatedAt = createdAt
	pack.Signatures = []models.Signature{{Signer: "zord_evidence", Alg: sigAlg, Sig: signature, SignedAt: createdAt}}

	rows, err := r.db.QueryContext(ctx, `
		SELECT item_type, item_ref, item_hash, leaf_hash, schema_version
		FROM evidence_items WHERE evidence_pack_id=$1 ORDER BY position_index`, packID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	for rows.Next() {
		var item models.EvidenceItem
		if err := rows.Scan(&item.Type, &item.Ref, &item.Hash, &item.LeafHash, &item.SchemaVersion); err != nil {
			return nil, "", err
		}
		pack.Items = append(pack.Items, item)
	}

	if pack.LeafCount == 0 && len(pack.Items) > 0 {
		pack.ComputeCompletenessMetadata()
	}

	return pack, objectRef, nil
}

// ListByIntentID returns pack summaries for a given tenant + intent_id (spec §17).
func (r *EvidenceRepository) ListByIntentID(ctx context.Context, tenantID, intentID string) ([]models.EvidencePackSummary, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT evidence_pack_id, tenant_id, intent_id, contract_id, batch_id, client_payout_ref, amount, currency, mode, pack_status,
		       merkle_root, ruleset_version, supersedes_pack_id, pack_completeness_score, leaf_count,
		       required_leaf_count, settlement_leaf_present_flag, attachment_decision_leaf_present_flag,
		       payment_instruction_received, canonical_intent_created, mapping_profile_used,
		       required_fields_status, tokenization_status, governance_decision,
		       settlement_record_received, canonical_settlement_created, bank_reference,
		       client_reference, attachment_decision, match_confidence,
		       value_date_check, amount_match,
		       created_at
		FROM evidence_packs
		WHERE tenant_id=$1 AND intent_id=$2
		ORDER BY created_at DESC`, tenantID, intentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]models.EvidencePackSummary, 0)
	for rows.Next() {
		var s models.EvidencePackSummary
		var iid, cid, bid, spid sql.NullString
		var srr, csc sql.NullTime
		var br, cr, ad sql.NullString
		var mc sql.NullFloat64
		var vdc, am sql.NullBool
		var clientPayoutRef sql.NullString
		var currency sql.NullString
		var amount decimal.NullDecimal
		if err := rows.Scan(
			&s.EvidencePackID, &s.TenantID, &iid, &cid, &bid, &clientPayoutRef, &amount, &currency,
			&s.Mode, &s.PackStatus, &s.MerkleRoot, &s.RulesetVersion, &spid,
			&s.PackCompletenessScore, &s.LeafCount, &s.RequiredLeafCount,
			&s.SettlementLeafPresentFlag, &s.AttachmentDecisionLeafPresentFlag,
			&s.PaymentInstructionReceived, &s.CanonicalIntentCreated, &s.MappingProfileUsed,
			&s.RequiredFieldsStatus, &s.TokenizationStatus, &s.GovernanceDecision,
			&srr, &csc, &br, &cr, &ad, &mc, &vdc, &am,
			&s.CreatedAt,
		); err != nil {
			return nil, err
		}
		if iid.Valid {
			s.IntentID = iid.String
		}
		if cid.Valid {
			s.ContractID = cid.String
		}
		if bid.Valid {
			s.ClientBatchID = bid.String
		}
		if spid.Valid {
			s.SupersedesPackID = spid.String
		}
		if srr.Valid {
			s.SettlementRecordReceived = &srr.Time
		}
		if csc.Valid {
			s.CanonicalSettlementCreated = &csc.Time
		}
		if br.Valid {
			s.BankReference = &br.String
		}
		if cr.Valid {
			s.ClientReference = &cr.String
		}
		if ad.Valid {
			s.AttachmentDecision = &ad.String
		}
		if mc.Valid {
			s.MatchConfidence = &mc.Float64
		}
		if vdc.Valid {
			s.ValueDateCheck = &vdc.Bool
		}
		if am.Valid {
			s.AmountMatch = &am.Bool
		}
		if clientPayoutRef.Valid {
			s.ClientPayoutRef = &clientPayoutRef.String
		}
		if amount.Valid {
			s.Amount = amount.Decimal
		}
		if currency.Valid {
			s.Currency = currency.String
		}
		result = append(result, s)
	}
	return result, nil
}

// ListByBatchID returns pack summaries for a given tenant + batch_id.
func (r *EvidenceRepository) ListByBatchID(ctx context.Context, tenantID, batchID string) ([]models.EvidencePackSummary, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT evidence_pack_id, tenant_id, intent_id, contract_id, batch_id, client_payout_ref, amount, currency, mode, pack_status,
		       merkle_root, ruleset_version, supersedes_pack_id, pack_completeness_score, leaf_count,
		       required_leaf_count, settlement_leaf_present_flag, attachment_decision_leaf_present_flag,
		       payment_instruction_received, canonical_intent_created, mapping_profile_used,
		       required_fields_status, tokenization_status, governance_decision,
		       settlement_record_received, canonical_settlement_created, bank_reference,
		       client_reference, attachment_decision, match_confidence,
		       value_date_check, amount_match,
		       created_at
		FROM evidence_packs
		WHERE tenant_id=$1 AND batch_id=$2
		ORDER BY created_at DESC`, tenantID, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]models.EvidencePackSummary, 0)
	for rows.Next() {
		var s models.EvidencePackSummary
		var iid, cid, bid, spid sql.NullString
		var srr, csc sql.NullTime
		var br, cr, ad sql.NullString
		var mc sql.NullFloat64
		var vdc, am sql.NullBool
		var clientPayoutRef sql.NullString
		var currency sql.NullString
		var amount decimal.NullDecimal
		if err := rows.Scan(
			&s.EvidencePackID, &s.TenantID, &iid, &cid, &bid, &clientPayoutRef, &amount, &currency,
			&s.Mode, &s.PackStatus, &s.MerkleRoot, &s.RulesetVersion, &spid,
			&s.PackCompletenessScore, &s.LeafCount, &s.RequiredLeafCount,
			&s.SettlementLeafPresentFlag, &s.AttachmentDecisionLeafPresentFlag,
			&s.PaymentInstructionReceived, &s.CanonicalIntentCreated, &s.MappingProfileUsed,
			&s.RequiredFieldsStatus, &s.TokenizationStatus, &s.GovernanceDecision,
			&srr, &csc, &br, &cr, &ad, &mc, &vdc, &am,
			&s.CreatedAt,
		); err != nil {
			return nil, err
		}
		if iid.Valid {
			s.IntentID = iid.String
		}
		if cid.Valid {
			s.ContractID = cid.String
		}
		if bid.Valid {
			s.ClientBatchID = bid.String
		}
		if spid.Valid {
			s.SupersedesPackID = spid.String
		}
		if srr.Valid {
			s.SettlementRecordReceived = &srr.Time
		}
		if csc.Valid {
			s.CanonicalSettlementCreated = &csc.Time
		}
		if br.Valid {
			s.BankReference = &br.String
		}
		if cr.Valid {
			s.ClientReference = &cr.String
		}
		if ad.Valid {
			s.AttachmentDecision = &ad.String
		}
		if mc.Valid {
			s.MatchConfidence = &mc.Float64
		}
		if vdc.Valid {
			s.ValueDateCheck = &vdc.Bool
		}
		if am.Valid {
			s.AmountMatch = &am.Bool
		}
		if clientPayoutRef.Valid {
			s.ClientPayoutRef = &clientPayoutRef.String
		}
		if amount.Valid {
			s.Amount = amount.Decimal
		}
		if currency.Valid {
			s.Currency = currency.String
		}
		result = append(result, s)
	}
	return result, nil
}

// ListIntentPacksByBatchID returns all intent-level packs for a given batch.
func (r *EvidenceRepository) ListIntentPacksByBatchID(ctx context.Context, tenantID, batchID string) ([]models.EvidencePackSummary, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT evidence_pack_id, tenant_id, intent_id, contract_id, batch_id, client_payout_ref, amount, currency, mode, pack_status,
		       merkle_root, ruleset_version, supersedes_pack_id, pack_completeness_score, leaf_count,
		       required_leaf_count, settlement_leaf_present_flag, attachment_decision_leaf_present_flag,
		       payment_instruction_received, canonical_intent_created, mapping_profile_used,
		       required_fields_status, tokenization_status, governance_decision,
		       settlement_record_received, canonical_settlement_created, bank_reference,
		       client_reference, attachment_decision, match_confidence,
		       value_date_check, amount_match,
		       created_at
		FROM evidence_packs
		WHERE tenant_id=$1 AND batch_id=$2 AND intent_id IS NOT NULL
		ORDER BY created_at DESC`, tenantID, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]models.EvidencePackSummary, 0)
	for rows.Next() {
		var s models.EvidencePackSummary
		var iid, cid, bid, spid sql.NullString
		var srr, csc sql.NullTime
		var br, cr, ad sql.NullString
		var mc sql.NullFloat64
		var vdc, am sql.NullBool
		var clientPayoutRef sql.NullString
		var currency sql.NullString
		var amount decimal.NullDecimal
		if err := rows.Scan(
			&s.EvidencePackID, &s.TenantID, &iid, &cid, &bid, &clientPayoutRef, &amount, &currency,
			&s.Mode, &s.PackStatus, &s.MerkleRoot, &s.RulesetVersion, &spid,
			&s.PackCompletenessScore, &s.LeafCount, &s.RequiredLeafCount,
			&s.SettlementLeafPresentFlag, &s.AttachmentDecisionLeafPresentFlag,
			&s.PaymentInstructionReceived, &s.CanonicalIntentCreated, &s.MappingProfileUsed,
			&s.RequiredFieldsStatus, &s.TokenizationStatus, &s.GovernanceDecision,
			&srr, &csc, &br, &cr, &ad, &mc, &vdc, &am,
			&s.CreatedAt,
		); err != nil {
			return nil, err
		}
		if iid.Valid {
			s.IntentID = iid.String
		}
		if cid.Valid {
			s.ContractID = cid.String
		}
		if bid.Valid {
			s.ClientBatchID = bid.String
		}
		if spid.Valid {
			s.SupersedesPackID = spid.String
		}
		if srr.Valid {
			s.SettlementRecordReceived = &srr.Time
		}
		if csc.Valid {
			s.CanonicalSettlementCreated = &csc.Time
		}
		if br.Valid {
			s.BankReference = &br.String
		}
		if cr.Valid {
			s.ClientReference = &cr.String
		}
		if ad.Valid {
			s.AttachmentDecision = &ad.String
		}
		if mc.Valid {
			s.MatchConfidence = &mc.Float64
		}
		if vdc.Valid {
			s.ValueDateCheck = &vdc.Bool
		}
		if am.Valid {
			s.AmountMatch = &am.Bool
		}
		if clientPayoutRef.Valid {
			s.ClientPayoutRef = &clientPayoutRef.String
		}
		if amount.Valid {
			s.Amount = amount.Decimal
		}
		if currency.Valid {
			s.Currency = currency.String
		}
		result = append(result, s)
	}
	return result, nil
}

// GetPackByBatchID fetches a pack by its batch_id.
func (r *EvidenceRepository) GetPackByBatchID(ctx context.Context, tenantID, batchID string) (*models.EvidencePack, error) {
	var packID string
	err := r.db.QueryRowContext(ctx, "SELECT evidence_pack_id FROM evidence_packs WHERE tenant_id=$1 AND batch_id=$2 AND intent_id IS NULL ORDER BY created_at DESC LIMIT 1", tenantID, batchID).Scan(&packID)
	if err != nil {
		return nil, err
	}
	pack, _, err := r.GetPackByID(ctx, packID)
	return pack, err
}

// MarkPackSuperseded updates old pack's status to SUPERSEDED (spec §23 Phase 5).
func (r *EvidenceRepository) MarkPackSuperseded(ctx context.Context, oldPackID, newPackID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE evidence_packs SET pack_status='SUPERSEDED', updated_at=NOW()
		WHERE evidence_pack_id=$1`, oldPackID)
	if err != nil {
		return fmt.Errorf("mark superseded: %w", err)
	}
	return nil
}

// SaveArchive persists §14.3 evidence_archives metadata.
func (r *EvidenceRepository) SaveArchive(ctx context.Context, a *models.EvidenceArchive) error {
	_, err := r.db.ExecContext(ctx, `
INSERT INTO evidence_archives(archive_id, evidence_pack_id, tenant_id, object_ref,
	encryption_key_id, archive_hash, archive_version, created_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		a.ArchiveID, a.EvidencePackID, a.TenantID, a.ObjectRef,
		nullStr(a.EncryptionKeyID), a.ArchiveHash, a.ArchiveVersion, a.CreatedAt,
	)
	return err
}

// SaveInclusionProofs persists §14.4 merkle_inclusion_proofs rows (one per leaf).
func (r *EvidenceRepository) SaveInclusionProofs(ctx context.Context, packID string, proofs []models.InclusionProof) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, p := range proofs {
		pathJSON, _ := json.Marshal(p.ProofPath)
		_, err = tx.ExecContext(ctx, `
INSERT INTO merkle_inclusion_proofs(evidence_pack_id, leaf_hash, proof_path_json, created_at)
VALUES($1,$2,$3,$4)
ON CONFLICT (evidence_pack_id, leaf_hash) DO NOTHING`,
			packID, p.LeafHash, pathJSON, p.CreatedAt)
		if err != nil {
			return fmt.Errorf("insert inclusion proof: %w", err)
		}
	}
	return tx.Commit()
}

// GetInclusionProofs fetches all inclusion proofs for a pack (§14.4).
func (r *EvidenceRepository) GetInclusionProofs(ctx context.Context, packID string) ([]models.InclusionProof, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT leaf_hash, proof_path_json, created_at
		FROM merkle_inclusion_proofs WHERE evidence_pack_id=$1`, packID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.InclusionProof
	for rows.Next() {
		var p models.InclusionProof
		var pathJSON []byte
		if err := rows.Scan(&p.LeafHash, &pathJSON, &p.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(pathJSON, &p.ProofPath)
		p.EvidencePackID = packID
		result = append(result, p)
	}
	return result, nil
}

// CreateReplayJob inserts a §14.5 evidence_replay_jobs row in PENDING state.
func (r *EvidenceRepository) CreateReplayJob(ctx context.Context, job *models.ReplayJob) error {
	mvJSON, _ := json.Marshal(job.MappingVersions)
	_, err := r.db.ExecContext(ctx, `
INSERT INTO evidence_replay_jobs(
	replay_job_id, tenant_id, source_evidence_pack_id, intent_id, contract_id,
	ruleset_version, mapping_versions_json, requested_by, status, created_at
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		job.ReplayJobID, job.TenantID, job.SourceEvidencePackID,
		nullStr(job.IntentID), nullStr(job.ContractID),
		job.RulesetVersion, mvJSON,
		nullStr(job.RequestedBy), job.Status, job.CreatedAt,
	)
	return err
}

// CompleteReplayJob updates a replay job to COMPLETED or FAILED with results.
func (r *EvidenceRepository) CompleteReplayJob(ctx context.Context, jobID, newPackID, equivalenceResult string, diffSummary map[string]any) error {
	diffJSON, _ := json.Marshal(diffSummary)
	now := time.Now().UTC()
	_, err := r.db.ExecContext(ctx, `
UPDATE evidence_replay_jobs
SET status='COMPLETED', new_evidence_pack_id=$2, equivalence_result=$3,
    difference_summary_json=$4, completed_at=$5
WHERE replay_job_id=$1`,
		jobID, nullStr(newPackID), equivalenceResult, diffJSON, now,
	)
	return err
}
