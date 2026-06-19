package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"zord-evidence/models"
)

type PendingLeafRepository interface {
	UpsertLeaf(ctx context.Context, leaf *models.PendingLeafCandidate) error
	LinkEnvelopeToIntent(ctx context.Context, tenantID, envelopeID, intentID, contractID string) error
	GetLeavesForIntent(ctx context.Context, tenantID, intentID string) ([]models.PendingLeafCandidate, error)
	GetLeavesForBatch(ctx context.Context, tenantID, batchID string) ([]models.PendingLeafCandidate, error)
	DeleteForIntent(ctx context.Context, tenantID, intentID string) error
	DeleteForBatch(ctx context.Context, tenantID, batchID string) error
	ResolveIntentID(ctx context.Context, tenantID, envelopeID string) (string, error)
}

type PostgresPendingLeafRepo struct {
	db *sql.DB
}

func NewPendingLeafRepository(db *sql.DB) *PostgresPendingLeafRepo {
	return &PostgresPendingLeafRepo{db: db}
}

func (r *PostgresPendingLeafRepo) UpsertLeaf(ctx context.Context, leaf *models.PendingLeafCandidate) error {
	query := `
INSERT INTO pending_leaf_candidates (
	tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic,
	payment_instruction_received, canonical_intent_created, mapping_profile_used,
	required_fields_status, tokenization_status, governance_decision,
	settlement_record_received, canonical_settlement_created, bank_reference,
	client_reference, attachment_decision, match_confidence,
	value_date_check, amount_match, client_payout_ref, amount, currency,
	created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW(), NOW())
ON CONFLICT (tenant_id, intent_id, leaf_type) WHERE intent_id IS NOT NULL 
DO UPDATE SET 
	item_ref = EXCLUDED.item_ref,
	hash = EXCLUDED.hash,
	contract_id = COALESCE(EXCLUDED.contract_id, pending_leaf_candidates.contract_id),
	batch_id = COALESCE(EXCLUDED.batch_id, pending_leaf_candidates.batch_id),
	source_topic = EXCLUDED.source_topic,
	payment_instruction_received = COALESCE(EXCLUDED.payment_instruction_received, pending_leaf_candidates.payment_instruction_received),
	canonical_intent_created = COALESCE(EXCLUDED.canonical_intent_created, pending_leaf_candidates.canonical_intent_created),
	mapping_profile_used = COALESCE(EXCLUDED.mapping_profile_used, pending_leaf_candidates.mapping_profile_used),
	required_fields_status = COALESCE(EXCLUDED.required_fields_status, pending_leaf_candidates.required_fields_status),
	tokenization_status = COALESCE(EXCLUDED.tokenization_status, pending_leaf_candidates.tokenization_status),
	governance_decision = COALESCE(EXCLUDED.governance_decision, pending_leaf_candidates.governance_decision),
	settlement_record_received = COALESCE(EXCLUDED.settlement_record_received, pending_leaf_candidates.settlement_record_received),
	canonical_settlement_created = COALESCE(EXCLUDED.canonical_settlement_created, pending_leaf_candidates.canonical_settlement_created),
	bank_reference = COALESCE(EXCLUDED.bank_reference, pending_leaf_candidates.bank_reference),
	client_reference = COALESCE(EXCLUDED.client_reference, pending_leaf_candidates.client_reference),
	attachment_decision = COALESCE(EXCLUDED.attachment_decision, pending_leaf_candidates.attachment_decision),
	match_confidence = COALESCE(EXCLUDED.match_confidence, pending_leaf_candidates.match_confidence),
	value_date_check = COALESCE(EXCLUDED.value_date_check, pending_leaf_candidates.value_date_check),
	amount_match = COALESCE(EXCLUDED.amount_match, pending_leaf_candidates.amount_match),
	client_payout_ref = COALESCE(EXCLUDED.client_payout_ref, pending_leaf_candidates.client_payout_ref),
	amount = COALESCE(EXCLUDED.amount, pending_leaf_candidates.amount),
	currency = COALESCE(EXCLUDED.currency, pending_leaf_candidates.currency),
	updated_at = NOW()
`
	// Handle the envelope-only conflict separately because PostgreSQL doesn't support multiple partial unique indexes in a single ON CONFLICT easily if they differ in the WHERE clause significantly.
	// Actually, I can use two separate statements or a more complex one.
	// For simplicity and correctness with the specific indexes I created:
	
	if leaf.IntentID == nil && leaf.ClientBatchID != nil {
		query = `
INSERT INTO pending_leaf_candidates (
	tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic,
	payment_instruction_received, canonical_intent_created, mapping_profile_used,
	required_fields_status, tokenization_status, governance_decision,
	settlement_record_received, canonical_settlement_created, bank_reference,
	client_reference, attachment_decision, match_confidence,
	value_date_check, amount_match, client_payout_ref, amount, currency,
	created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW(), NOW())
ON CONFLICT (tenant_id, batch_id, leaf_type) WHERE batch_id IS NOT NULL AND intent_id IS NULL
DO UPDATE SET 
	item_ref = EXCLUDED.item_ref,
	hash = EXCLUDED.hash,
	contract_id = COALESCE(EXCLUDED.contract_id, pending_leaf_candidates.contract_id),
	batch_id = COALESCE(EXCLUDED.batch_id, pending_leaf_candidates.batch_id),
	source_topic = EXCLUDED.source_topic,
	payment_instruction_received = COALESCE(EXCLUDED.payment_instruction_received, pending_leaf_candidates.payment_instruction_received),
	canonical_intent_created = COALESCE(EXCLUDED.canonical_intent_created, pending_leaf_candidates.canonical_intent_created),
	mapping_profile_used = COALESCE(EXCLUDED.mapping_profile_used, pending_leaf_candidates.mapping_profile_used),
	required_fields_status = COALESCE(EXCLUDED.required_fields_status, pending_leaf_candidates.required_fields_status),
	tokenization_status = COALESCE(EXCLUDED.tokenization_status, pending_leaf_candidates.tokenization_status),
	governance_decision = COALESCE(EXCLUDED.governance_decision, pending_leaf_candidates.governance_decision),
	settlement_record_received = COALESCE(EXCLUDED.settlement_record_received, pending_leaf_candidates.settlement_record_received),
	canonical_settlement_created = COALESCE(EXCLUDED.canonical_settlement_created, pending_leaf_candidates.canonical_settlement_created),
	bank_reference = COALESCE(EXCLUDED.bank_reference, pending_leaf_candidates.bank_reference),
	client_reference = COALESCE(EXCLUDED.client_reference, pending_leaf_candidates.client_reference),
	attachment_decision = COALESCE(EXCLUDED.attachment_decision, pending_leaf_candidates.attachment_decision),
	match_confidence = COALESCE(EXCLUDED.match_confidence, pending_leaf_candidates.match_confidence),
	value_date_check = COALESCE(EXCLUDED.value_date_check, pending_leaf_candidates.value_date_check),
	amount_match = COALESCE(EXCLUDED.amount_match, pending_leaf_candidates.amount_match),
	client_payout_ref = COALESCE(EXCLUDED.client_payout_ref, pending_leaf_candidates.client_payout_ref),
	amount = COALESCE(EXCLUDED.amount, pending_leaf_candidates.amount),
	currency = COALESCE(EXCLUDED.currency, pending_leaf_candidates.currency),
	updated_at = NOW()
`
	} else if leaf.IntentID == nil && leaf.EnvelopeID != nil {
		query = `
INSERT INTO pending_leaf_candidates (
	tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic,
	payment_instruction_received, canonical_intent_created, mapping_profile_used,
	required_fields_status, tokenization_status, governance_decision,
	settlement_record_received, canonical_settlement_created, bank_reference,
	client_reference, attachment_decision, match_confidence,
	value_date_check, amount_match, client_payout_ref, amount, currency,
	created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW(), NOW())
ON CONFLICT (tenant_id, envelope_id, leaf_type) WHERE intent_id IS NULL AND batch_id IS NULL
DO UPDATE SET 
	item_ref = EXCLUDED.item_ref,
	hash = EXCLUDED.hash,
	contract_id = COALESCE(EXCLUDED.contract_id, pending_leaf_candidates.contract_id),
	batch_id = COALESCE(EXCLUDED.batch_id, pending_leaf_candidates.batch_id),
	source_topic = EXCLUDED.source_topic,
	payment_instruction_received = COALESCE(EXCLUDED.payment_instruction_received, pending_leaf_candidates.payment_instruction_received),
	canonical_intent_created = COALESCE(EXCLUDED.canonical_intent_created, pending_leaf_candidates.canonical_intent_created),
	mapping_profile_used = COALESCE(EXCLUDED.mapping_profile_used, pending_leaf_candidates.mapping_profile_used),
	required_fields_status = COALESCE(EXCLUDED.required_fields_status, pending_leaf_candidates.required_fields_status),
	tokenization_status = COALESCE(EXCLUDED.tokenization_status, pending_leaf_candidates.tokenization_status),
	governance_decision = COALESCE(EXCLUDED.governance_decision, pending_leaf_candidates.governance_decision),
	settlement_record_received = COALESCE(EXCLUDED.settlement_record_received, pending_leaf_candidates.settlement_record_received),
	canonical_settlement_created = COALESCE(EXCLUDED.canonical_settlement_created, pending_leaf_candidates.canonical_settlement_created),
	bank_reference = COALESCE(EXCLUDED.bank_reference, pending_leaf_candidates.bank_reference),
	client_reference = COALESCE(EXCLUDED.client_reference, pending_leaf_candidates.client_reference),
	attachment_decision = COALESCE(EXCLUDED.attachment_decision, pending_leaf_candidates.attachment_decision),
	match_confidence = COALESCE(EXCLUDED.match_confidence, pending_leaf_candidates.match_confidence),
	value_date_check = COALESCE(EXCLUDED.value_date_check, pending_leaf_candidates.value_date_check),
	amount_match = COALESCE(EXCLUDED.amount_match, pending_leaf_candidates.amount_match),
	client_payout_ref = COALESCE(EXCLUDED.client_payout_ref, pending_leaf_candidates.client_payout_ref),
	amount = COALESCE(EXCLUDED.amount, pending_leaf_candidates.amount),
	currency = COALESCE(EXCLUDED.currency, pending_leaf_candidates.currency),
	updated_at = NOW()
`
	}

	_, err := r.db.ExecContext(ctx, query,
		leaf.TenantID,
		leaf.IntentID,
		leaf.EnvelopeID,
		leaf.ContractID,
		leaf.ClientBatchID,
		leaf.LeafType,
		leaf.ItemRef,
		leaf.Hash,
		leaf.SchemaVersion,
		leaf.SourceTopic,
		leaf.PaymentInstructionReceived,
		leaf.CanonicalIntentCreated,
		leaf.MappingProfileUsed,
		leaf.RequiredFieldsStatus,
		leaf.TokenizationStatus,
		leaf.GovernanceDecision,
		leaf.SettlementRecordReceived,
		leaf.CanonicalSettlementCreated,
		leaf.BankReference,
		leaf.ClientReference,
		leaf.AttachmentDecision,
		leaf.MatchConfidence,
		leaf.ValueDateCheck,
		leaf.AmountMatch,
		leaf.ClientPayoutRef,
		leaf.Amount,
		leaf.Currency,
	)
	if err != nil {
		return fmt.Errorf("upsert leaf candidate: %w", err)
	}
	return nil
}

func (r *PostgresPendingLeafRepo) LinkEnvelopeToIntent(ctx context.Context, tenantID, envelopeID, intentID, contractID string) error {
	// Link any existing envelope-keyed leaves to this intent_id and contract_id
	query := `
UPDATE pending_leaf_candidates
SET intent_id = $3, contract_id = COALESCE($4, contract_id), updated_at = NOW()
WHERE tenant_id = $1 AND envelope_id = $2 AND intent_id IS NULL
`
	_, err := r.db.ExecContext(ctx, query, tenantID, envelopeID, intentID, contractID)
	if err != nil {
		return fmt.Errorf("link envelope to intent: %w", err)
	}
	return nil
}

func (r *PostgresPendingLeafRepo) GetLeavesForIntent(ctx context.Context, tenantID, intentID string) ([]models.PendingLeafCandidate, error) {
	query := `
SELECT id, tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic, 
       payment_instruction_received, canonical_intent_created, mapping_profile_used,
       required_fields_status, tokenization_status, governance_decision,
       settlement_record_received, canonical_settlement_created, bank_reference,
       client_reference, attachment_decision, match_confidence,
       value_date_check, amount_match, client_payout_ref, amount, currency,
       created_at, updated_at
FROM pending_leaf_candidates
WHERE tenant_id = $1 AND intent_id = $2
`
	rows, err := r.db.QueryContext(ctx, query, tenantID, intentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var leaves []models.PendingLeafCandidate
	for rows.Next() {
		var l models.PendingLeafCandidate
		if err := rows.Scan(
			&l.ID, &l.TenantID, &l.IntentID, &l.EnvelopeID, &l.ContractID, &l.ClientBatchID, &l.LeafType, &l.ItemRef, &l.Hash, &l.SchemaVersion, &l.SourceTopic,
			&l.PaymentInstructionReceived, &l.CanonicalIntentCreated, &l.MappingProfileUsed,
			&l.RequiredFieldsStatus, &l.TokenizationStatus, &l.GovernanceDecision,
			&l.SettlementRecordReceived, &l.CanonicalSettlementCreated, &l.BankReference,
			&l.ClientReference, &l.AttachmentDecision, &l.MatchConfidence,
			&l.ValueDateCheck, &l.AmountMatch,
			&l.ClientPayoutRef, &l.Amount, &l.Currency,
			&l.CreatedAt, &l.UpdatedAt,
		); err != nil {
			return nil, err
		}
		leaves = append(leaves, l)
	}
	return leaves, nil
}

func (r *PostgresPendingLeafRepo) GetLeavesForBatch(ctx context.Context, tenantID, batchID string) ([]models.PendingLeafCandidate, error) {
	query := `
SELECT id, tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic,
       payment_instruction_received, canonical_intent_created, mapping_profile_used,
       required_fields_status, tokenization_status, governance_decision,
       settlement_record_received, canonical_settlement_created, bank_reference,
       client_reference, attachment_decision, match_confidence,
       value_date_check, amount_match, client_payout_ref, amount, currency,
       created_at, updated_at
FROM pending_leaf_candidates
WHERE tenant_id = $1 AND batch_id = $2 AND intent_id IS NULL
`
	rows, err := r.db.QueryContext(ctx, query, tenantID, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var leaves []models.PendingLeafCandidate
	for rows.Next() {
		var l models.PendingLeafCandidate
		if err := rows.Scan(
			&l.ID, &l.TenantID, &l.IntentID, &l.EnvelopeID, &l.ContractID, &l.ClientBatchID, &l.LeafType, &l.ItemRef, &l.Hash, &l.SchemaVersion, &l.SourceTopic,
			&l.PaymentInstructionReceived, &l.CanonicalIntentCreated, &l.MappingProfileUsed,
			&l.RequiredFieldsStatus, &l.TokenizationStatus, &l.GovernanceDecision,
			&l.SettlementRecordReceived, &l.CanonicalSettlementCreated, &l.BankReference,
			&l.ClientReference, &l.AttachmentDecision, &l.MatchConfidence,
			&l.ValueDateCheck, &l.AmountMatch,
			&l.ClientPayoutRef, &l.Amount, &l.Currency,
			&l.CreatedAt, &l.UpdatedAt,
		); err != nil {
			return nil, err
		}
		leaves = append(leaves, l)
	}
	return leaves, nil
}

func (r *PostgresPendingLeafRepo) DeleteForIntent(ctx context.Context, tenantID, intentID string) error {
	query := `DELETE FROM pending_leaf_candidates WHERE tenant_id = $1 AND intent_id = $2`
	_, err := r.db.ExecContext(ctx, query, tenantID, intentID)
	return err
}

func (r *PostgresPendingLeafRepo) DeleteForBatch(ctx context.Context, tenantID, batchID string) error {
	query := `DELETE FROM pending_leaf_candidates WHERE tenant_id = $1 AND batch_id = $2 AND intent_id IS NULL`
	_, err := r.db.ExecContext(ctx, query, tenantID, batchID)
	return err
}

func (r *PostgresPendingLeafRepo) ResolveIntentID(ctx context.Context, tenantID, envelopeID string) (string, error) {
	query := `
SELECT intent_id 
FROM pending_leaf_candidates 
WHERE tenant_id = $1 AND envelope_id = $2 AND intent_id IS NOT NULL 
LIMIT 1
`
	var intentID string
	err := r.db.QueryRowContext(ctx, query, tenantID, envelopeID).Scan(&intentID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return intentID, err
}
