package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"time"
	"zord-evidence/models"

	"github.com/lib/pq"
	"github.com/shopspring/decimal"
)

// ErrPackAlreadyExists is returned when a concurrent goroutine already committed
// an ACTIVE evidence pack for the same (tenant_id, intent_id) or (tenant_id, batch_id).
// The caller should treat this as a successful no-op — the pack exists, mission accomplished.
var ErrPackAlreadyExists = errors.New("evidence pack already exists for this intent/batch")

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

// AcquireIntentAdvisoryLock attempts to acquire a Postgres session-level advisory
// lock scoped to the given (tenantID, intentID) pair within an existing transaction.
// The lock is automatically released when the transaction commits or rolls back,
// so no explicit unlock is needed.
//
// Returns true if the lock was acquired (this goroutine "won"), false if another
// session already holds it (another goroutine is generating the same pack).
func (r *EvidenceRepository) AcquireIntentAdvisoryLock(ctx context.Context, tx *sql.Tx, tenantID, intentID string) (bool, error) {
	lockKey := advisoryLockKey(tenantID + ":intent:" + intentID)
	var acquired bool
	err := tx.QueryRowContext(ctx, `SELECT pg_try_advisory_xact_lock($1)`, lockKey).Scan(&acquired)
	if err != nil {
		return false, fmt.Errorf("acquire intent advisory lock: %w", err)
	}
	return acquired, nil
}

// AcquireBatchAdvisoryLock is the batch-scoped equivalent of AcquireIntentAdvisoryLock.
func (r *EvidenceRepository) AcquireBatchAdvisoryLock(ctx context.Context, tx *sql.Tx, tenantID, batchID string) (bool, error) {
	lockKey := advisoryLockKey(tenantID + ":batch:" + batchID)
	var acquired bool
	err := tx.QueryRowContext(ctx, `SELECT pg_try_advisory_xact_lock($1)`, lockKey).Scan(&acquired)
	if err != nil {
		return false, fmt.Errorf("acquire batch advisory lock: %w", err)
	}
	return acquired, nil
}

// BeginTx exposes a transaction begin so the service layer can open a tx,
// acquire the advisory lock, and pass the same tx to SavePack.
func (r *EvidenceRepository) BeginTx(ctx context.Context) (*sql.Tx, error) {
	return r.db.BeginTx(ctx, nil)
}

// advisoryLockKey converts an arbitrary string key into a stable int64
// suitable for pg_try_advisory_xact_lock. Uses FNV-1a 64-bit for speed and
// low collision probability across typical intent/batch ID namespaces.
func advisoryLockKey(key string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(key))
	// Cast to int64 — wraps on overflow, which is fine for advisory locks.
	return int64(h.Sum64())
}

// SavePack persists the full evidence pack in a single transaction:
//   - evidence_packs row (§14.1)
//   - evidence_items rows (§14.2)
//   - evidence_signatures rows
//   - evidence_outbox_events row (for relay polling)
//
// If an ACTIVE pack for the same (tenant_id, intent_id) already exists (inserted
// by a concurrent goroutine that won the race), SavePack returns ErrPackAlreadyExists
// so the caller can treat it as a clean no-op.
func (r *EvidenceRepository) SavePack(ctx context.Context, pack *models.EvidencePack, objectRef string, outboxEvent *models.OutboxEvent) error {
	return r.SavePackInTx(ctx, nil, pack, objectRef, outboxEvent)
}

// SavePackInTx is like SavePack but reuses an existing transaction (used when the
// caller has already acquired an advisory lock inside that transaction).
func (r *EvidenceRepository) SavePackInTx(ctx context.Context, existingTx *sql.Tx, pack *models.EvidencePack, objectRef string, outboxEvent *models.OutboxEvent) error {
	var tx *sql.Tx
	var err error
	ownTx := existingTx == nil
	if ownTx {
		tx, err = r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback() //nolint:errcheck
	} else {
		tx = existingTx
	}

	if err := r.savePackCoreInTx(ctx, tx, pack, objectRef, outboxEvent); err != nil {
		if ownTx && errors.Is(err, ErrPackAlreadyExists) {
			_ = tx.Rollback()
		}
		return err
	}

	if ownTx {
		return tx.Commit()
	}
	return nil
}

// SavePackDraftInTx persists a pack in DRAFT status plus archive metadata and inclusion
// proofs in a single transaction. Outbox events are deferred until ActivatePackInTx.
func (r *EvidenceRepository) SavePackDraftInTx(
	ctx context.Context,
	existingTx *sql.Tx,
	pack *models.EvidencePack,
	objectRef string,
	archive *models.EvidenceArchive,
	proofs []models.InclusionProof,
) error {
	var tx *sql.Tx
	ownTx := existingTx == nil
	if ownTx {
		var err error
		tx, err = r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback() //nolint:errcheck
	} else {
		tx = existingTx
	}

	if err := r.savePackCoreInTx(ctx, tx, pack, objectRef, nil); err != nil {
		if ownTx && errors.Is(err, ErrPackAlreadyExists) {
			_ = tx.Rollback()
		}
		return err
	}
	if archive != nil {
		if err := r.saveArchiveInTx(ctx, tx, archive); err != nil {
			return fmt.Errorf("save archive draft: %w", err)
		}
	}
	if err := r.saveInclusionProofsInTx(ctx, tx, pack.EvidencePackID, proofs); err != nil {
		return fmt.Errorf("save inclusion proofs draft: %w", err)
	}

	if ownTx {
		return tx.Commit()
	}
	return nil
}

// ActivatePackInTx marks a DRAFT pack ACTIVE, finalizes archive hash, and writes the outbox event.
func (r *EvidenceRepository) ActivatePackInTx(
	ctx context.Context,
	existingTx *sql.Tx,
	packID, objectRef, archiveHash string,
	outboxEvent *models.OutboxEvent,
) error {
	var tx *sql.Tx
	ownTx := existingTx == nil
	if ownTx {
		var err error
		tx, err = r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback() //nolint:errcheck
	} else {
		tx = existingTx
	}

	res, err := tx.ExecContext(ctx, `
UPDATE evidence_packs
SET pack_status=$2, object_ref=$3, updated_at=NOW()
WHERE evidence_pack_id=$1 AND pack_status=$4`,
		packID, models.PackStatusActive, objectRef, models.PackStatusDraft,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrPackAlreadyExists
		}
		return fmt.Errorf("activate pack: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("activate pack: draft row not found for %s", packID)
	}

	if archiveHash != "" {
		_, err = tx.ExecContext(ctx, `
UPDATE evidence_archives
SET archive_hash=$2
WHERE evidence_pack_id=$1`, packID, archiveHash)
		if err != nil {
			return fmt.Errorf("finalize archive hash: %w", err)
		}
	}

	if outboxEvent != nil {
		if err := r.SaveToOutbox(ctx, tx, outboxEvent); err != nil {
			return fmt.Errorf("save to outbox: %w", err)
		}
	}

	if ownTx {
		return tx.Commit()
	}
	return nil
}

func (r *EvidenceRepository) savePackCoreInTx(
	ctx context.Context,
	tx *sql.Tx,
	pack *models.EvidencePack,
	objectRef string,
	outboxEvent *models.OutboxEvent,
) error {
	schemaVersionsJSON, _ := json.Marshal(pack.SchemaVersions)

	// INSERT ... ON CONFLICT DO NOTHING is the last line of defence against
	// duplicate packs. The partial unique index on ACTIVE rows is enforced at
	// activation time via ActivatePackInTx.
	res, err := tx.ExecContext(ctx, `
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
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)
ON CONFLICT DO NOTHING`,
		pack.EvidencePackID,
		pack.TenantID,
		nullStr(pack.IntentID),
		nullStr(pack.ContractID),
		nullStr(pack.ClientBatchID),
		pack.ClientPayoutRef,
		pack.Amount,
		pack.Currency,
		pack.Mode,
		pack.PackStatus,
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
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrPackAlreadyExists
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

	return nil
}

func (r *EvidenceRepository) saveArchiveInTx(ctx context.Context, tx *sql.Tx, a *models.EvidenceArchive) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO evidence_archives(archive_id, evidence_pack_id, tenant_id, object_ref,
	encryption_key_id, archive_hash, archive_version, created_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		a.ArchiveID, a.EvidencePackID, a.TenantID, a.ObjectRef,
		nullStr(a.EncryptionKeyID), a.ArchiveHash, a.ArchiveVersion, a.CreatedAt,
	)
	return err
}

func (r *EvidenceRepository) saveInclusionProofsInTx(ctx context.Context, tx *sql.Tx, packID string, proofs []models.InclusionProof) error {
	for _, p := range proofs {
		pathJSON, _ := json.Marshal(p.ProofPath)
		_, err := tx.ExecContext(ctx, `
INSERT INTO merkle_inclusion_proofs(evidence_pack_id,leaf_index, leaf_hash, proof_path_json, created_at)
VALUES($1,$2,$3,$4,$5)
ON CONFLICT (evidence_pack_id, leaf_index) DO NOTHING`,
			packID, p.LeafIndex, p.LeafHash, pathJSON, p.CreatedAt)
		if err != nil {
			return fmt.Errorf("insert inclusion proof: %w", err)
		}
	}
	return nil
}

func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
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

// MarkPackSupersededInTx is the transaction-scoped variant of MarkPackSuperseded.
func (r *EvidenceRepository) MarkPackSupersededInTx(ctx context.Context, tx *sql.Tx, oldPackID, newPackID string) error {
	_, err := tx.ExecContext(ctx, `
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
INSERT INTO merkle_inclusion_proofs(evidence_pack_id,leaf_index, leaf_hash, proof_path_json, created_at)
VALUES($1,$2,$3,$4,$5)
ON CONFLICT (evidence_pack_id, leaf_index) DO NOTHING`,
			packID, p.LeafIndex, p.LeafHash, pathJSON, p.CreatedAt)
		if err != nil {
			return fmt.Errorf("insert inclusion proof: %w", err)
		}
	}
	return tx.Commit()
}

// GetInclusionProofs fetches all inclusion proofs for a pack (§14.4).
func (r *EvidenceRepository) GetInclusionProofs(ctx context.Context, packID string) ([]models.InclusionProof, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT leaf_index, leaf_hash, proof_path_json, created_at
		FROM merkle_inclusion_proofs WHERE evidence_pack_id=$1`, packID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.InclusionProof
	for rows.Next() {
		var p models.InclusionProof
		var pathJSON []byte
		if err := rows.Scan(&p.LeafIndex, &p.LeafHash, &pathJSON, &p.CreatedAt); err != nil {
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
