package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"

	"github.com/shopspring/decimal"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
)

type PaymentIntentRepo struct {
	db *sql.DB
}

func NewPaymentIntentRepo(db *sql.DB) *PaymentIntentRepo {
	return &PaymentIntentRepo{db: db}
}

func (r *PaymentIntentRepo) Save(
	ctx context.Context,
	nir *models.NormalizedIngestRecord,
	intent models.CanonicalIntent, outbox models.OutboxEvent,
	registry *models.BusinessIdempotencyEntry,
) (models.CanonicalIntent, error) {

	if intent.ContractID == "" {
		intent.ContractID = uuid.NewString()
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return intent, err
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if nir != nil {
		nirQuery := `
		INSERT INTO normalized_ingest_records (
			nir_id, envelope_id, tenant_id,
			detected_format, profile_id, profile_version,
			fields_json, field_confidence_summary, unmapped_json, mapping_uncertain_flag,
			required_field_gap_count, low_confidence_field_count,
			created_at
		) VALUES (
			$1, $2, $3,
			$4, $5, $6,
			$7, $8, $9, $10,
			$11, $12,
			$13
		)`
		_, err = tx.ExecContext(ctx, nirQuery,
			nir.NIRID, nir.EnvelopeID, nir.TenantID,
			nir.DetectedFormat, nir.ProfileID, nir.ProfileVersion,
			nir.FieldsJSON, nir.FieldConfidenceSummary, nir.UnmappedJSON, nir.MappingUncertainFlag,
			nir.RequiredFieldGapCount, nir.LowConfidenceFieldCount,
			nir.CreatedAt,
		)
		if err != nil {
			log.Printf("Repo.Save: INSERT normalized_ingest_records failed: %v", err)
			return intent, err
		}
	}

	query := `
	INSERT INTO payment_intents (
    intent_id, envelope_id, tenant_id, contract_id,
    trace_id, idempotency_key, salient_hash, payload_hash,
    intent_type, canonical_version, schema_version,
    amount, currency, intended_execution_at,
    constraints, beneficiary_type, pii_tokens, beneficiary,
    status, confidence_score,
    canonical_snapshot_ref, nir_snapshot_ref, governance_snapshot_ref, governance_hash,
    canonical_hash,
    created_at,
    client_payout_ref, provider_hint, request_fingerprint, routing_hints_json,
    governance_state, business_state, duplicate_risk_flag,
    mapping_profile_id, mapping_profile_version, source_system, updated_at,
    business_idempotency_key, beneficiary_fingerprint,
    proof_readiness_score, matchability_score, intent_quality_score,
    mapping_confidence_score,
    schema_completeness_score,
	governance_reason_codes_json,
    duplicate_reason_code, client_batch_ref,
	batchid,
	source_row_num,
    aggregate_confidence_score, -- NEW
    reference_quality_score,
    duplicate_risk_score,
    score_version,
    score_validity_status,
    score_breakdown_json,
    score_reason_codes_json,
    scored_at,
    required_fields_status,
    tokenization_status,
    governance_decision,
    payment_instruction_received,
    canonical_intent_created
)
VALUES (
    $1,$2,$3,$4,
    $5,$6,$7,$8,
    $9,$10,$11,
    $12,$13,$14,
    $15,$16,$17,$18,
    $19,$20,
    $21,$22,$23,
    $24,$25,
    $26, $27,
    $28,$29,$30,
    $31,$32,$33,
    $34,$35,$36,$37,
    $38,$39,
    $40,$41,$42,
    $43,
    $44, $45,
    $46, $47, $48, $49, $50, -- UPDATED
    $51, $52, $53, $54, $55, $56, $57,
    $58, $59, $60, $61, $62
) `

	_, err = tx.ExecContext(
		ctx,
		query,
		intent.IntentID,                   // $1
		intent.EnvelopeID,                 // $2
		intent.TenantID,                   // $3
		intent.ContractID,                 // $4
		intent.TraceID,                    // $5
		intent.IdempotencyKey,             // $6
		intent.SalientHash,                // $7
		intent.PayloadHash,                // $8
		intent.IntentType,                 // $9
		intent.CanonicalVersion,           // $10
		intent.SchemaVersion,              // $11
		intent.Amount,                     // $12
		intent.Currency,                   // $13
		intent.IntendedExecutionAt,        // $14
		intent.Constraints,                // $15
		intent.BeneficiaryType,            // $16
		intent.PIITokens,                  // $17
		intent.Beneficiary,                // $18
		intent.Status,                     // $19
		intent.ConfidenceScore,            // $20
		intent.CanonicalSnapshotRef,       // $21
		intent.NIRSnapshotRef,             // $22
		intent.GovernanceSnapshotRef,      // $23
		intent.GovernanceHash,             // $24  ← matches column: governance_hash
		intent.CanonicalHash,              // $25  ← matches column: canonical_hash
		intent.CreatedAt,                  // $26  ← matches column: created_at
		intent.ClientPayoutRef,            // $27  ← matches column: client_payout_ref
		intent.ProviderHint,               // $28
		intent.RequestFingerprint,         // $29
		intent.RoutingHintsJSON,           // $30
		intent.GovernanceState,            // $31
		intent.BusinessState,              // $32
		intent.DuplicateRiskFlag,          // $33
		intent.MappingProfileID,           // $34
		intent.MappingProfileVersion,      // $35
		intent.SourceSystem,               // $36
		intent.UpdatedAt,                  // $37
		intent.BusinessIdempotencyKey,     // $38
		intent.BeneficiaryFingerprint,     // $39
		intent.ProofReadinessScore,        // $40
		intent.MatchabilityScore,          // $41
		intent.IntentQualityScore,         // $42
		intent.MappingConfidenceScore,     // $43
		intent.SchemaCompletenessScore,    // $44
		intent.GovernanceReasonCodesJSON,  // $45
		intent.DuplicateReasonCode,        // $46
		intent.ClientBatchRef,             // $47
		intent.BatchID,                    // $48
		intent.SourceRowNum,               // $49
		intent.AggregateConfidenceScore,   // $50 -- NEW
		intent.ReferenceQualityScore,      // $51
		intent.DuplicateRiskScore,         // $52
		intent.ScoreVersion,               // $53
		intent.ScoreValidityStatus,        // $54
		intent.ScoreBreakdownJSON,         // $55
		intent.ScoreReasonCodesJSON,       // $56
		intent.ScoredAt,                   // $57
		intent.RequiredFieldsStatus,       // $58
		intent.TokenizationStatus,         // $59
		intent.GovernanceDecision,         // $60
		intent.PaymentInstructionReceived, // $61
		intent.CanonicalIntentCreated,     // $62
	)

	if err != nil {
		log.Printf("Repo.Save: INSERT payment_intents failed: %v", err)
		return intent, err
	}

	outboxQuery := `
INSERT INTO outbox (
    trace_id,
    envelope_id,
    tenant_id,
    contract_id,
    aggregate_type,
    aggregate_id,
    event_type,
    schema_version,
    amount,
    currency,
    idempotency_key,
    salient_hash,
    intent_type,
    canonical_version,
		intended_execution_at,
    constraints,
    beneficiary_type,
    pii_tokens,
    beneficiary,
    intent_status,
    confidence_score,
    canonical_hash,
    canonical_snapshot_ref,
    nir_snapshot_ref,
    governance_snapshot_ref,
    governance_hash,
    client_payout_ref,
    provider_hint,
    request_fingerprint,
    routing_hints_json,
    governance_state,
    business_state,
    duplicate_risk_flag,
    mapping_profile_id,
    mapping_profile_version,
    source_system,
    business_idempotency_key,
    beneficiary_fingerprint,
    proof_readiness_score,
    matchability_score,
    intent_quality_score,
    mapping_confidence_score,
    schema_completeness_score,
    governance_reason_codes_json,
    duplicate_reason_code,
    client_batch_ref,
    payload,
	payload_hash,
    status,
    retry_count,
    next_attempt_at,
    created_at,
	batchid,
	source_row_num,
    aggregate_confidence_score, -- NEW
    required_fields_status,
    tokenization_status,
    governance_decision,
    payment_instruction_received,
    canonical_intent_created
) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
    $11,$12,$13,$14,$15,$16,$17,$18,$19,
    $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
    $30,$31,$32,$33,$34,$35,$36,$37,$38,$39,
    $40,$41,$42,$43,$44,$45,$46,$47,$48,$49,
    $50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60
)`

	outbox.ContractID = intent.ContractID

	_, err = tx.ExecContext(
		ctx,
		outboxQuery,
		outbox.TraceID,                    // $1
		outbox.EnvelopeID,                 // $2
		outbox.TenantID,                   // $3
		outbox.ContractID,                 // $4
		outbox.AggregateType,              // $5
		outbox.AggregateID,                // $6
		outbox.EventType,                  // $7
		outbox.SchemaVersion,              // $8
		outbox.Amount,                     // $9
		outbox.Currency,                   // $10
		outbox.IdempotencyKey,             // $11
		outbox.SalientHash,                // $12
		outbox.IntentType,                 // $13
		outbox.CanonicalVersion,           // $14
		outbox.IntendedExecutionAt,        // $15
		outbox.Constraints,                // $16
		outbox.BeneficiaryType,            // $17
		outbox.PIITokens,                  // $18
		outbox.Beneficiary,                // $19
		outbox.IntentStatus,               // $20
		outbox.ConfidenceScore,            // $21
		outbox.CanonicalHash,              // $22
		outbox.CanonicalSnapshotRef,       // $23
		outbox.NIRSnapshotRef,             // $24
		outbox.GovernanceSnapshotRef,      // $25
		outbox.GovernanceHash,             // $26  ← matches column: governance_hash
		outbox.ClientPayoutRef,            // $27  ← matches column: client_payout_ref
		outbox.ProviderHint,               // $28
		outbox.RequestFingerprint,         // $29
		outbox.RoutingHintsJSON,           // $30
		outbox.GovernanceState,            // $31
		outbox.BusinessState,              // $32
		outbox.DuplicateRiskFlag,          // $33
		outbox.MappingProfileID,           // $34
		outbox.MappingProfileVersion,      // $35
		outbox.SourceSystem,               // $36
		outbox.BusinessIdempotencyKey,     // $37
		outbox.BeneficiaryFingerprint,     // $38
		outbox.ProofReadinessScore,        // $39
		outbox.MatchabilityScore,          // $40
		outbox.IntentQualityScore,         // $41
		outbox.MappingConfidenceScore,     // $42
		outbox.SchemaCompletenessScore,    // $43
		outbox.GovernanceReasonCodesJSON,  // $44  ← matches column: governance_reason_codes_json (JSON)
		outbox.DuplicateReasonCode,        // $45
		outbox.ClientBatchRef,             // $46
		outbox.Payload,                    // $47  ← matches column: payload (JSON)
		outbox.PayloadHash,                // $48
		outbox.Status,                     // $49
		outbox.RetryCount,                 // $50
		outbox.NextRetryAt,                // $51
		outbox.CreatedAt,                  // $52
		outbox.BatchID,                    // $53  ← matches column: batchid
		outbox.SourceRowNum,               // $54  ← matches column: source_row_num
		outbox.AggregateConfidenceScore,   // $55 -- NEW
		outbox.RequiredFieldsStatus,       // $56
		outbox.TokenizationStatus,         // $57
		outbox.GovernanceDecision,         // $58
		outbox.PaymentInstructionReceived, // $59
		outbox.CanonicalIntentCreated,     // $60
	)
	if err != nil {
		log.Printf("Repo.Save: INSERT outbox failed: %v", err)
		return intent, err
	}

	if registry != nil {
		registryQuery := `
    INSERT INTO business_idempotency_registry (
        tenant_id, business_idempotency_key, intent_id,
        beneficiary_fingerprint, amount_minor, currency_code,
        time_bucket, duplicate_reason_code, created_at
    ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
    ) ON CONFLICT (tenant_id, business_idempotency_key) DO NOTHING`
		result, err := tx.ExecContext(ctx, registryQuery,
			registry.TenantID, registry.BusinessIdempotencyKey, registry.IntentID,
			registry.BeneficiaryFingerprint, registry.AmountMinor, registry.CurrencyCode,
			registry.TimeBucket, registry.DuplicateReasonCode, registry.CreatedAt,
		)
		if err != nil {
			log.Printf("Repo.Save: INSERT business_idempotency_registry failed: %v", err)
			return intent, err
		}
		// Check if the INSERT was suppressed by ON CONFLICT (rows affected = 0 means a concurrent
		// intent already owns this key — signal the service layer to mark this intent as duplicate)
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			intent.DuplicateRiskFlag = true
			if intent.DuplicateReasonCode == "" || intent.DuplicateReasonCode == "NONE" {
				intent.DuplicateReasonCode = "SAME_BENEFICIARY_AMOUNT_TIME"
			}
			intent.GovernanceState = "FLAGGED"
			// Update the already-inserted payment_intents row to reflect duplicate flag
			_, err = tx.ExecContext(ctx, `
            UPDATE payment_intents
            SET duplicate_risk_flag = true,
                duplicate_reason_code = $1,
                governance_state = 'FLAGGED',
                updated_at = now()
            WHERE intent_id = $2`,
				intent.DuplicateReasonCode,
				intent.IntentID,
			)
			if err != nil {
				log.Printf("Repo.Save: UPDATE duplicate flag failed: %v", err)
				return intent, err
			}
		}
	}

	err = tx.Commit()
	if err != nil {
		return intent, err
	}

	return intent, nil
}

func (r *PaymentIntentRepo) FindByEnvelope(
	ctx context.Context,
	tenantID string,
	envelopeID string,
) (*models.CanonicalIntent, error) {

	query := `
	SELECT
		intent_id,
		envelope_id,
		tenant_id,
		contract_id,
		intent_type,
		canonical_version,
		schema_version,
		amount,
		currency,
		intended_execution_at,
		constraints,
		beneficiary_type,
		pii_tokens,
		beneficiary,
		status,
		confidence_score,
		created_at,
		client_payout_ref,
		provider_hint,
		request_fingerprint,
		routing_hints_json,
		governance_state,
		business_state,
		duplicate_risk_flag,
		mapping_profile_id,
		mapping_profile_version,
		source_system,
		updated_at,
		business_idempotency_key,
		beneficiary_fingerprint,
		proof_readiness_score,
		matchability_score,
		intent_quality_score,
		mapping_confidence_score,
		schema_completeness_score,
		governance_reason_codes_json,
		duplicate_reason_code,
		client_batch_ref,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
		COALESCE(governance_hash, '') as governance_hash,
		batchid,
		source_row_num,
		aggregate_confidence_score, -- NEW
		required_fields_status,
		tokenization_status,
		governance_decision,
		payment_instruction_received,
		canonical_intent_created
	FROM payment_intents
	WHERE tenant_id = $1
	  AND envelope_id = $2
	LIMIT 1
	`

	var intent models.CanonicalIntent

	err := r.db.QueryRowContext(
		ctx,
		query,
		tenantID,
		envelopeID,
	).Scan(
		&intent.IntentID,
		&intent.EnvelopeID,
		&intent.TenantID,
		&intent.ContractID,
		&intent.IntentType,
		&intent.CanonicalVersion,
		&intent.SchemaVersion,
		&intent.Amount,
		&intent.Currency,
		&intent.IntendedExecutionAt,
		&intent.Constraints,
		&intent.BeneficiaryType,
		&intent.PIITokens,
		&intent.Beneficiary,
		&intent.Status,
		&intent.ConfidenceScore,
		&intent.CreatedAt,
		&intent.ClientPayoutRef,
		&intent.ProviderHint,
		&intent.RequestFingerprint,
		&intent.RoutingHintsJSON,
		&intent.GovernanceState,
		&intent.BusinessState,
		&intent.DuplicateRiskFlag,
		&intent.MappingProfileID,
		&intent.MappingProfileVersion,
		&intent.SourceSystem,
		&intent.UpdatedAt,
		&intent.BusinessIdempotencyKey,
		&intent.BeneficiaryFingerprint,
		&intent.ProofReadinessScore,
		&intent.MatchabilityScore,
		&intent.IntentQualityScore,
		&intent.MappingConfidenceScore,
		&intent.SchemaCompletenessScore,
		&intent.GovernanceReasonCodesJSON,
		&intent.DuplicateReasonCode,
		&intent.ClientBatchRef,
		&intent.CanonicalSnapshotRef,
		&intent.NIRSnapshotRef,
		&intent.GovernanceSnapshotRef,
		&intent.GovernanceHash,
		&intent.BatchID,
		&intent.SourceRowNum,
		&intent.AggregateConfidenceScore, // NEW
		&intent.RequiredFieldsStatus,
		&intent.TokenizationStatus,
		&intent.GovernanceDecision,
		&intent.PaymentInstructionReceived,
		&intent.CanonicalIntentCreated,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &intent, nil
}

func (r *PaymentIntentRepo) UpdateSnapshotRefs(
	ctx context.Context,
	intentID string,
	canonicalRef string,
	nirRef string,
	govRef string,
	hash string,
	prevHash string,
) error {
	query := `
	UPDATE payment_intents
	SET canonical_snapshot_ref = $1,
	    nir_snapshot_ref = $2,
	    governance_snapshot_ref = $3,
	    canonical_hash = $4
	WHERE intent_id = $5
	`

	if _, err := r.db.ExecContext(ctx, query, canonicalRef, nirRef, govRef, hash, intentID); err != nil {
		return err
	}

	outboxQuery := `
	UPDATE outbox
	SET canonical_snapshot_ref = $1,
	    nir_snapshot_ref = $2,
	    governance_snapshot_ref = $3,
	    canonical_hash = $4
	WHERE aggregate_id = $5
	`

	if _, err := r.db.ExecContext(ctx, outboxQuery, canonicalRef, nirRef, govRef, hash, intentID); err != nil {
		return err
	}

	insertVersionQuery := `
	INSERT INTO intent_versions (intent_id, version_no, prev_hash, created_at)
	VALUES ($1, $2, $3, now())
	ON CONFLICT (intent_id, version_no) DO NOTHING
	`

	_, err := r.db.ExecContext(ctx, insertVersionQuery, intentID, 1, prevHash)

	return err
}

func (r *PaymentIntentRepo) GetPreviousTenantCanonicalHash(
	ctx context.Context,
	tenantID string,
	intentID string,
) (string, error) {
	var prevHash string

	err := r.db.QueryRowContext(ctx, `
		SELECT canonical_hash
		FROM payment_intents
		WHERE tenant_id = $1
		  AND intent_id <> $2
		  AND canonical_hash IS NOT NULL
		  AND canonical_hash <> ''
		ORDER BY created_at DESC
		LIMIT 1
	`, tenantID, intentID).Scan(&prevHash)

	if err == sql.ErrNoRows {
		return "GENESIS", nil
	}
	if err != nil {
		return "", err
	}

	return prevHash, nil
}

func (r *PaymentIntentRepo) FindByBusinessIdempotencyKey(
	ctx context.Context,
	tenantID string,
	key string,
) (*models.CanonicalIntent, error) {

	query := `
	SELECT
		intent_id,
		envelope_id,
		tenant_id,
		contract_id,
		intent_type,
		canonical_version,
		schema_version,
		amount,
		currency,
		intended_execution_at,
		constraints,
		beneficiary_type,
		pii_tokens,
		beneficiary,
		status,
		confidence_score,
		created_at,
		client_payout_ref,
		provider_hint,
		request_fingerprint,
		routing_hints_json,
		governance_state,
		business_state,
		duplicate_risk_flag,
		mapping_profile_id,
		mapping_profile_version,
		source_system,
		updated_at,
		business_idempotency_key,
		beneficiary_fingerprint,
		proof_readiness_score,
		matchability_score,
		intent_quality_score,
		mapping_confidence_score,
		schema_completeness_score,
		governance_reason_codes_json,
		duplicate_reason_code,
		client_batch_ref,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
		COALESCE(governance_hash, '') as governance_hash,
		batchid,
		source_row_num,
		aggregate_confidence_score, -- NEW
		required_fields_status,
		tokenization_status,
		governance_decision,
		payment_instruction_received,
		canonical_intent_created
	FROM payment_intents
	WHERE tenant_id = $1
	  AND business_idempotency_key = $2
	LIMIT 1
	`

	var intent models.CanonicalIntent

	err := r.db.QueryRowContext(
		ctx,
		query,
		tenantID,
		key,
	).Scan(
		&intent.IntentID,
		&intent.EnvelopeID,
		&intent.TenantID,
		&intent.ContractID,
		&intent.IntentType,
		&intent.CanonicalVersion,
		&intent.SchemaVersion,
		&intent.Amount,
		&intent.Currency,
		&intent.IntendedExecutionAt,
		&intent.Constraints,
		&intent.BeneficiaryType,
		&intent.PIITokens,
		&intent.Beneficiary,
		&intent.Status,
		&intent.ConfidenceScore,
		&intent.CreatedAt,
		&intent.ClientPayoutRef,
		&intent.ProviderHint,
		&intent.RequestFingerprint,
		&intent.RoutingHintsJSON,
		&intent.GovernanceState,
		&intent.BusinessState,
		&intent.DuplicateRiskFlag,
		&intent.MappingProfileID,
		&intent.MappingProfileVersion,
		&intent.SourceSystem,
		&intent.UpdatedAt,
		&intent.BusinessIdempotencyKey,
		&intent.BeneficiaryFingerprint,
		&intent.ProofReadinessScore,
		&intent.MatchabilityScore,
		&intent.IntentQualityScore,
		&intent.MappingConfidenceScore,
		&intent.SchemaCompletenessScore,
		&intent.GovernanceReasonCodesJSON,
		&intent.DuplicateReasonCode,
		&intent.ClientBatchRef,
		&intent.CanonicalSnapshotRef,
		&intent.NIRSnapshotRef,
		&intent.GovernanceSnapshotRef,
		&intent.GovernanceHash,
		&intent.BatchID,
		&intent.SourceRowNum,
		&intent.AggregateConfidenceScore, // NEW
		&intent.RequiredFieldsStatus,
		&intent.TokenizationStatus,
		&intent.GovernanceDecision,
		&intent.PaymentInstructionReceived,
		&intent.CanonicalIntentCreated,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &intent, nil
}

func (r *PaymentIntentRepo) CheckIdempotencyRegistry(
	ctx context.Context,
	tenantID string,
	key string,
) (*models.BusinessIdempotencyEntry, error) {

	query := `
	SELECT
		tenant_id,
		business_idempotency_key,
		intent_id,
		beneficiary_fingerprint,
		amount_minor,
		currency_code,
		time_bucket,
		duplicate_reason_code,
		created_at
	FROM business_idempotency_registry
	WHERE tenant_id = $1
	  AND business_idempotency_key = $2
	LIMIT 1
	`

	var entry models.BusinessIdempotencyEntry

	err := r.db.QueryRowContext(
		ctx,
		query,
		tenantID,
		key,
	).Scan(
		&entry.TenantID,
		&entry.BusinessIdempotencyKey,
		&entry.IntentID,
		&entry.BeneficiaryFingerprint,
		&entry.AmountMinor,
		&entry.CurrencyCode,
		&entry.TimeBucket,
		&entry.DuplicateReasonCode,
		&entry.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &entry, nil
}

// UpdateBatchAggregateConfidence computes the batch_quality_score using the FULL received
// population as denominator — including DLQ rows. This fixes the problem where
// 487 DLQ rows produced a healthy 0.77 batch score.
//
// Formula (doc section 7):
//
//	batch_quality_score =
//	  0.20 * canonicalization_success_rate
//	+ 0.20 * avg_intent_quality_score (normalized 0–100)
//	+ 0.20 * avg_matchability_score
//	+ 0.15 * avg_proof_readiness_score
//	+ 0.10 * (1 - duplicate_risk_rate)
//	+ 0.10 * (1 - low_matchability_rate)
//	+ 0.05 * (1 - review_rate)
//
// DLQ cap rules:
//
//	dlq_rate > 0.05  → cap at 75
//	dlq_rate > 0.10  → cap at 60
//	dlq_rate > 0.20  → cap at 40
func (r *PaymentIntentRepo) UpdateBatchAggregateConfidence(ctx context.Context, tenantID, batchID string) (float64, error) {
	if batchID == "" {
		return 0, nil
	}

	// Step 1: Gather batch counts from payment_intents (canonicalized rows)
	var canonicalized int
	var avgQuality, avgMatchability, avgProof, avgDupRisk, avgSchema, avgMapping sql.NullFloat64
	var totalAmount decimal.Decimal
	var lowMatchCount, lowProofCount, dupRiskCount int
	var dupRiskAmount int64
	var retrievedTenantID sql.NullString
	var sourceSystem sql.NullString

	err := r.db.QueryRowContext(ctx, `
        SELECT
            COUNT(*),
            AVG(intent_quality_score),
            AVG(matchability_score),
            AVG(proof_readiness_score),
            AVG(duplicate_risk_score),
            AVG(schema_completeness_score),
            AVG(mapping_confidence_score),
            SUM(CASE WHEN matchability_score < 40 THEN 1 ELSE 0 END),
            SUM(CASE WHEN proof_readiness_score < 40 THEN 1 ELSE 0 END),
            SUM(CASE WHEN duplicate_risk_flag = true THEN 1 ELSE 0 END),
            COALESCE(SUM(CASE WHEN duplicate_risk_score >= 31 THEN (amount * 100)::BIGINT ELSE 0 END), 0),
            MAX(tenant_id::TEXT),
            MAX(source_system),
            COALESCE(SUM(amount), 0)
        FROM payment_intents
        WHERE tenant_id = $1 AND
		batchid=$2
    `, tenantID, batchID).Scan(
		&canonicalized,
		&avgQuality, &avgMatchability, &avgProof, &avgDupRisk, &avgSchema, &avgMapping,
		&lowMatchCount, &lowProofCount, &dupRiskCount, &dupRiskAmount,
		&retrievedTenantID, &sourceSystem, &totalAmount,
	)
	if err != nil {
		return 0, err
	}

	// Step 2: Get DLQ count for this batch from dlq_items
	var dlqCount int
	_ = r.db.QueryRowContext(ctx, `
        SELECT COUNT(*) FROM dlq_items WHERE tenant_id = $1 AND batch_id = $2
    `, tenantID, batchID).Scan(&dlqCount)

	// Fallback if tenantID/sourceSystem not in payment_intents (all DLQ'd)
	if !retrievedTenantID.Valid || retrievedTenantID.String == "" {
		_ = r.db.QueryRowContext(ctx, `
            SELECT MAX(tenant_id::TEXT) FROM dlq_items WHERE tenant_id = $1 AND batch_id = $2
        `, tenantID, batchID).Scan(&retrievedTenantID)
	}

	// Step 3: Get review count (FLAGGED governance state)
	var reviewCount int
	_ = r.db.QueryRowContext(ctx, `
        SELECT COUNT(*) FROM payment_intents
        WHERE tenant_id = $1 AND batchid = $2 AND governance_state IN ('FLAGGED','REQUIRES_REVIEW')
    `, tenantID, batchID).Scan(&reviewCount)

	// Step 4: Full denominator — received = canonicalized + dlq
	received := canonicalized + dlqCount
	if received == 0 {
		return 0, nil
	}

	canonRate := float64(canonicalized) / float64(received)
	dlqRate := float64(dlqCount) / float64(received)
	reviewRate := float64(reviewCount) / float64(received)
	dupRiskRate := float64(dupRiskCount) / float64(received)
	lowMatchRate := float64(lowMatchCount) / float64(received)

	// Normalize avg scores to 0–1 for weighting (now stored as 0–1 in DB)
	avgQ := safeFloat(avgQuality)
	avgM := safeFloat(avgMatchability)
	avgP := safeFloat(avgProof)

	batchScore := (canonRate*0.20 +
		avgQ*0.20 +
		avgM*0.20 +
		avgP*0.15 +
		(1.0-dupRiskRate)*0.10 +
		(1.0-lowMatchRate)*0.10 +
		(1.0-reviewRate)*0.05)

	// DLQ caps — the critical fix for the 487-DLQ problem
	switch {
	case dlqRate > 0.20:
		if batchScore > 0.40 {
			batchScore = 0.40
		}
	case dlqRate > 0.10:
		if batchScore > 0.60 {
			batchScore = 0.60
		}
	case dlqRate > 0.05:
		if batchScore > 0.75 {
			batchScore = 0.75
		}
	}

	if batchScore < 0 {
		batchScore = 0
	}
	if batchScore > 1.0 {
		batchScore = 1.0
	}

	// Step 5: Update payment_intents with batch quality score + counters
	_, err = r.db.ExecContext(ctx, `
        UPDATE payment_intents
        SET aggregate_confidence_score = $1
        WHERE tenant_id = $2 AND batchid = $3
    `, batchScore, tenantID, batchID) // stored as 0–1
	if err != nil {
		return 0, err
	}

	// Step 6: Update outbox payload with all batch quality fields
	batchBreakdown := map[string]any{
		"batch_quality_score":         batchScore,
		"received_count":              received,
		"canonicalized_count":         canonicalized,
		"dlq_count":                   dlqCount,
		"review_count":                reviewCount,
		"canonicalization_rate":       canonRate,
		"dlq_rate":                    dlqRate,
		"duplicate_risk_count":        dupRiskCount,
		"low_matchability_count":      lowMatchCount,
		"low_proof_readiness_count":   lowProofCount,
		"avg_intent_quality_score":    safeFloat(avgQuality),
		"avg_matchability_score":      safeFloat(avgMatchability),
		"avg_proof_readiness_score":   safeFloat(avgProof),
		"avg_schema_completeness":     safeFloat(avgSchema),
		"avg_mapping_confidence":      safeFloat(avgMapping),
		"duplicate_risk_amount_minor": dupRiskAmount,
		"score_version":               "service2_score_v2.0",
	}
	breakdownJSON, _ := json.Marshal(batchBreakdown)

	_, err = r.db.ExecContext(ctx, `
        WITH locked AS (
            SELECT event_id
            FROM outbox
            WHERE tenant_id = $3 AND batchid = $4
            ORDER BY event_id
            FOR UPDATE
        )
        UPDATE outbox o
        SET aggregate_confidence_score = $1,
            payload = jsonb_set(
                jsonb_set(o.payload, '{aggregate_confidence_score}', to_jsonb($1::numeric)),
                '{batch_quality_breakdown}', $2::jsonb
            )
        FROM locked l
        WHERE o.event_id = l.event_id
    `, batchScore, breakdownJSON, tenantID, batchID)
	if err != nil {
		return 0, err
	}

	// Step 7: UPSERT into canonical_batches (New Table)
	upsertBatchQuery := `
    INSERT INTO canonical_batches (
        batch_id, tenant_id, source_system, received_count, canonicalized_count, dlq_count, review_count,
        low_matchability_count, low_proof_readiness_count, duplicate_risk_count,
        canonicalization_success_rate, avg_schema_completeness_score,
        avg_mapping_confidence_score, avg_matchability_score, avg_proof_readiness_score,
        avg_intent_quality_score, duplicate_risk_amount_minor, batch_quality_score,
        score_breakdown_json, total_amount, updated_at
    ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18,
        $19, $20, now()
    ) ON CONFLICT (tenant_id, batch_id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        source_system = EXCLUDED.source_system,
        received_count = EXCLUDED.received_count,
        canonicalized_count = EXCLUDED.canonicalized_count,
        dlq_count = EXCLUDED.dlq_count,
        review_count = EXCLUDED.review_count,
        low_matchability_count = EXCLUDED.low_matchability_count,
        low_proof_readiness_count = EXCLUDED.low_proof_readiness_count,
        duplicate_risk_count = EXCLUDED.duplicate_risk_count,
        canonicalization_success_rate = EXCLUDED.canonicalization_success_rate,
        avg_schema_completeness_score = EXCLUDED.avg_schema_completeness_score,
        avg_mapping_confidence_score = EXCLUDED.avg_mapping_confidence_score,
        avg_matchability_score = EXCLUDED.avg_matchability_score,
        avg_proof_readiness_score = EXCLUDED.avg_proof_readiness_score,
        avg_intent_quality_score = EXCLUDED.avg_intent_quality_score,
        duplicate_risk_amount_minor = EXCLUDED.duplicate_risk_amount_minor,
        batch_quality_score = EXCLUDED.batch_quality_score,
        score_breakdown_json = EXCLUDED.score_breakdown_json,
        total_amount = EXCLUDED.total_amount,
        updated_at = now()
    `
	_, err = r.db.ExecContext(ctx, upsertBatchQuery,
		batchID, tenantID, sourceSystem, received, canonicalized, dlqCount, reviewCount,
		lowMatchCount, lowProofCount, dupRiskCount,
		canonRate, safeFloat(avgSchema),
		safeFloat(avgMapping), safeFloat(avgMatchability), safeFloat(avgProof),
		safeFloat(avgQuality), dupRiskAmount, batchScore,
		breakdownJSON, totalAmount,
	)
	if err != nil {
		log.Printf("⚠️ Failed to upsert into canonical_batches for batchID=%s: %v", batchID, err)
		return batchScore, err
	}

	return batchScore, nil
}

func safeFloat(n sql.NullFloat64) float64 {
	if n.Valid {
		return n.Float64
	}
	return 0.0
}
