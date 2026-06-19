package persistence

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"zord-intent-engine/internal/models"
)

// NEW INTERFACE FOR API ENDPOINTS

type IntentQueryRepository interface {
	ListIntents(ctx context.Context, filter IntentFilter) ([]models.CanonicalIntent, int, error)
	GetIntentByID(ctx context.Context, tenantID, intentID string) (models.CanonicalIntent, error)
	ListBatchIDsByTenant(ctx context.Context, tenantID string) ([]models.BatchIDItem, error)
	ListPaymentIntentLiteByBatch(ctx context.Context, tenantID, batchID string) ([]models.PaymentIntentLite, error)
	ListDLQItemsByBatchSimple(ctx context.Context, tenantID, batchID string) ([]models.DLQEntry, error)

	ListPaymentIntentsByBatch(ctx context.Context, tenantID, batchID string, page, pageSize int) ([]models.CanonicalIntent, int, error)
	ListDLQItemsByBatch(ctx context.Context, tenantID, batchID string, page, pageSize int) ([]models.DLQEntry, int, error)
}

// FILTER STRUCT
type IntentFilter struct {
	TenantID   string
	Status     string
	IntentType string
	BatchID    string
	Page       int
	PageSize   int
}

//  NEW POSTGRES IMPLEMENTATION

type IntentQueryRepo struct {
	db *sql.DB
}

// NewIntentQueryRepo creates a new query repository for API endpoints
// This is SEPARATE from NewPaymentIntentRepo - both can coexist!
func NewIntentQueryRepo(db *sql.DB) *IntentQueryRepo {
	return &IntentQueryRepo{db: db}
}

// LIST INTENTS
func (r *IntentQueryRepo) ListIntents(
	ctx context.Context,
	filter IntentFilter,
) ([]models.CanonicalIntent, int, error) {

	// Build dynamic WHERE clause
	var conditions []string
	var args []interface{}
	argPosition := 1

	if filter.TenantID != "" {
		conditions = append(conditions, fmt.Sprintf("tenant_id = $%d", argPosition))
		args = append(args, filter.TenantID)
		argPosition++
	}

	if filter.Status != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argPosition))
		args = append(args, filter.Status)
		argPosition++
	}

	if filter.IntentType != "" {
		conditions = append(conditions, fmt.Sprintf("intent_type = $%d", argPosition))
		args = append(args, filter.IntentType)
		argPosition++
	}

	if filter.BatchID != "" {
		conditions = append(conditions, fmt.Sprintf("batchid = $%d", argPosition))
		args = append(args, filter.BatchID)
		argPosition++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM payment_intents %s", whereClause)

	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count intents: %w", err)
	}

	// Fetch paginated results
	offset := (filter.Page - 1) * filter.PageSize

	dataQuery := fmt.Sprintf(`
	SELECT 
		intent_id, envelope_id, tenant_id, contract_id,
		intent_type, canonical_version, 
		COALESCE(schema_version, '') as schema_version,
		amount, currency, intended_execution_at,
		COALESCE(constraints, '{}'::jsonb) as constraints, 
		COALESCE(beneficiary_type, '') as beneficiary_type,
		COALESCE(pii_tokens, '{}'::jsonb) as pii_tokens,
		COALESCE(beneficiary, '{}'::jsonb) as beneficiary,
		status, confidence_score, created_at,
		COALESCE(client_payout_ref, '') as client_payout_ref,
		COALESCE(request_fingerprint, '') as request_fingerprint,
		COALESCE(routing_hints_json, '{}'::jsonb) as routing_hints_json,
		COALESCE(governance_state, '') as governance_state,
		COALESCE(business_state, '') as business_state,
		COALESCE(duplicate_risk_flag, false) as duplicate_risk_flag,
		COALESCE(mapping_profile_version, '') as mapping_profile_version,
		updated_at,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
		COALESCE(governance_hash, '') as governance_hash,
		source_row_num,
		aggregate_confidence_score, -- NEW
		required_fields_status,
		tokenization_status,
		governance_decision,
		payment_instruction_received,
		canonical_intent_created
	FROM payment_intents
	%s
	ORDER BY created_at DESC
	LIMIT $%d OFFSET $%d
`, whereClause, argPosition, argPosition+1)

	args = append(args, filter.PageSize, offset)

	rows, err := r.db.QueryContext(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch intents: %w", err)
	}
	defer rows.Close()

	var intents []models.CanonicalIntent

	for rows.Next() {
		var intent models.CanonicalIntent

		err := rows.Scan(
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
			&intent.RequestFingerprint,
			&intent.RoutingHintsJSON,
			&intent.GovernanceState,
			&intent.BusinessState,
			&intent.DuplicateRiskFlag,
			&intent.MappingProfileVersion,
			&intent.UpdatedAt,
			&intent.CanonicalSnapshotRef,
			&intent.NIRSnapshotRef,
			&intent.GovernanceSnapshotRef,
			&intent.GovernanceHash,
			&intent.SourceRowNum,
			&intent.AggregateConfidenceScore, // NEW
			&intent.RequiredFieldsStatus,
			&intent.TokenizationStatus,
			&intent.GovernanceDecision,
			&intent.PaymentInstructionReceived,
			&intent.CanonicalIntentCreated,
		)

		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan intent: %w", err)
		}

		intents = append(intents, intent)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating intents: %w", err)
	}

	return intents, total, nil
}

// GET BY ID
func (r *IntentQueryRepo) GetIntentByID(
	ctx context.Context,
	tenantID, intentID string,
) (models.CanonicalIntent, error) {

	query := `
	SELECT 
		intent_id, envelope_id, tenant_id, contract_id,
		intent_type, canonical_version,
		COALESCE(schema_version, '') as schema_version,
		amount, currency, intended_execution_at,
		COALESCE(constraints, '{}'::jsonb) as constraints,
		COALESCE(beneficiary_type, '') as beneficiary_type,
		COALESCE(pii_tokens, '{}'::jsonb) as pii_tokens,
		COALESCE(beneficiary, '{}'::jsonb) as beneficiary,
		status, confidence_score, created_at,
		COALESCE(client_payout_ref, '') as client_payout_ref,
		COALESCE(request_fingerprint, '') as request_fingerprint,
		COALESCE(routing_hints_json, '{}'::jsonb) as routing_hints_json,
		COALESCE(governance_state, '') as governance_state,
		COALESCE(business_state, '') as business_state,
		COALESCE(duplicate_risk_flag, false) as duplicate_risk_flag,
		COALESCE(mapping_profile_version, '') as mapping_profile_version,
		updated_at,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
		COALESCE(governance_hash, '') as governance_hash,
		source_row_num,
		aggregate_confidence_score,
		required_fields_status,
		tokenization_status,
		governance_decision,
		payment_instruction_received,
		canonical_intent_created
	FROM payment_intents
	WHERE tenant_id = $1
	AND intent_id=$2
`

	var intent models.CanonicalIntent

	err := r.db.QueryRowContext(ctx, query, tenantID, intentID).Scan(
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
		&intent.RequestFingerprint,
		&intent.RoutingHintsJSON,
		&intent.GovernanceState,
		&intent.BusinessState,
		&intent.DuplicateRiskFlag,
		&intent.MappingProfileVersion,
		&intent.UpdatedAt,
		&intent.CanonicalSnapshotRef,
		&intent.NIRSnapshotRef,
		&intent.GovernanceSnapshotRef,
		&intent.GovernanceHash,
		&intent.SourceRowNum,
		&intent.AggregateConfidenceScore, // NEW
		&intent.RequiredFieldsStatus,
		&intent.TokenizationStatus,
		&intent.GovernanceDecision,
		&intent.PaymentInstructionReceived,
		&intent.CanonicalIntentCreated,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.CanonicalIntent{}, errors.New("intent not found")
		}
		return models.CanonicalIntent{}, fmt.Errorf("failed to fetch intent: %w", err)
	}

	return intent, nil
}
func (r *IntentQueryRepo) ListBatchesForSidebar(
	ctx context.Context,
	tenantID string,
) ([]models.BatchSidebarItem, error) {
	const mergedQuery = `
		WITH pi_agg AS (
			SELECT
				pi.batchid AS batch_id,
				MAX(pi.intent_type) AS intent_type,
				COALESCE(SUM(pi.amount), 0)::text AS total_value,
				COUNT(*)::bigint AS transactions,
				COUNT(*)::bigint AS confirmed_count,
				MAX(pi.aggregate_confidence_score) AS high_confidence_count,
				SUM(CASE WHEN pi.duplicate_risk_flag = true THEN 1 ELSE 0 END)::bigint AS mismatch_count,
				MAX(pi.created_at) AS last_created_at
			FROM payment_intents pi
			WHERE pi.tenant_id = $1
			  AND pi.batchid IS NOT NULL
			  AND pi.batchid <> ''
			GROUP BY pi.batchid
		),
		dlq_join AS (
			SELECT
				COALESCE(
					NULLIF(d.client_batch_ref, ''),
					NULLIF(d.batch_id, ''),
					NULLIF(n.fields_json->>'client_batch_ref', '')
				) AS batch_id,
				COALESCE(NULLIF(n.fields_json->>'intent_type', ''), 'UNKNOWN') AS intent_type,
				d.created_at
			FROM dlq_items d
			LEFT JOIN normalized_ingest_records n
				ON n.tenant_id = d.tenant_id
			   AND n.envelope_id = d.envelope_id
			WHERE d.tenant_id = $1
		),
		dlq_agg AS (
			SELECT
				j.batch_id,
				MAX(j.intent_type) AS intent_type,
				COUNT(*)::bigint AS unresolved_count,
				MAX(j.created_at) AS last_created_at
			FROM dlq_join j
			WHERE j.batch_id IS NOT NULL
			  AND j.batch_id <> ''
			GROUP BY j.batch_id
		)
		SELECT
			COALESCE(p.batch_id, d.batch_id) AS batchid,
			COALESCE(NULLIF(p.intent_type, ''), NULLIF(d.intent_type, ''), 'UNKNOWN') AS intent_type,
			COALESCE(p.total_value, '0') AS total_value,
			COALESCE(p.transactions, 0)::bigint AS transactions,
			COALESCE(p.confirmed_count, 0)::bigint AS confirmed_count,
			COALESCE(p.high_confidence_count, 0)::float8 AS high_confidence_count,
			COALESCE(p.mismatch_count, 0)::bigint AS mismatch_count,
			COALESCE(d.unresolved_count, 0)::bigint AS unresolved_count
		FROM pi_agg p
		FULL OUTER JOIN dlq_agg d
			ON d.batch_id = p.batch_id
		ORDER BY COALESCE(p.last_created_at, d.last_created_at) DESC
	`

	rows, err := r.db.QueryContext(ctx, mergedQuery, tenantID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch batches sidebar data: %w", err)
	}
	defer rows.Close()

	items := make([]models.BatchSidebarItem, 0)
	for rows.Next() {
		var item models.BatchSidebarItem
		var highConfidence sql.NullFloat64

		if err := rows.Scan(
			&item.BatchID,
			&item.Type,
			&item.TotalValue,
			&item.Transactions,
			&item.ConfirmedCount,
			&highConfidence,
			&item.MismatchCount,
			&item.UnresolvedCount,
		); err != nil {
			return nil, fmt.Errorf("failed to scan batch sidebar row: %w", err)
		}

		if highConfidence.Valid {
			v := highConfidence.Float64
			item.HighConfidenceCount = &v
		} else {
			zero := 0.0
			item.HighConfidenceCount = &zero
		}

		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating batch sidebar rows: %w", err)
	}

	return items, nil
}
func (r *IntentQueryRepo) ListPaymentIntentsByBatch(
	ctx context.Context,
	tenantID, batchID string,
	page, pageSize int,
) ([]models.CanonicalIntent, int, error) {
	const countQ = `
		SELECT COUNT(*)
		FROM payment_intents
		WHERE tenant_id = $1
		  AND batchid = $2
	`
	var total int
	if err := r.db.QueryRowContext(ctx, countQ, tenantID, batchID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count payment intents by batch: %w", err)
	}

	const dataQ = `
		SELECT 
			intent_id, envelope_id, tenant_id, contract_id,trace_id,
			intent_type, canonical_version,
			COALESCE(schema_version, '') as schema_version,
			amount, currency, intended_execution_at,
			COALESCE(constraints, '{}'::jsonb) as constraints,
			COALESCE(beneficiary_type, '') as beneficiary_type,
			COALESCE(pii_tokens, '{}'::jsonb) as pii_tokens,
			COALESCE(beneficiary, '{}'::jsonb) as beneficiary,
			status, confidence_score, created_at,
			COALESCE(client_payout_ref, '') as client_payout_ref,
			COALESCE(request_fingerprint, '') as request_fingerprint,
			COALESCE(routing_hints_json, '{}'::jsonb) as routing_hints_json,
			COALESCE(governance_state, '') as governance_state,
			COALESCE(business_state, '') as business_state,
			COALESCE(duplicate_risk_flag, false) as duplicate_risk_flag,
			COALESCE(mapping_profile_version, '') as mapping_profile_version,
			updated_at,
			canonical_snapshot_ref,
			COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
			COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
			COALESCE(governance_hash, '') as governance_hash,
			source_row_num,
			aggregate_confidence_score,
			required_fields_status,
			tokenization_status,
			governance_decision,
			payment_instruction_received,
			canonical_intent_created
		FROM payment_intents
		WHERE tenant_id = $1
		  AND batchid = $2
		ORDER BY created_at DESC, intent_id DESC
	`

	rows, err := r.db.QueryContext(ctx, dataQ, tenantID, batchID)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch payment intents by batch: %w", err)
	}
	defer rows.Close()

	items := make([]models.CanonicalIntent, 0)
	for rows.Next() {
		var intent models.CanonicalIntent
		if err := rows.Scan(
			&intent.IntentID,
			&intent.EnvelopeID,
			&intent.TenantID,
			&intent.ContractID,
			&intent.TraceID,
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
			&intent.RequestFingerprint,
			&intent.RoutingHintsJSON,
			&intent.GovernanceState,
			&intent.BusinessState,
			&intent.DuplicateRiskFlag,
			&intent.MappingProfileVersion,
			&intent.UpdatedAt,
			&intent.CanonicalSnapshotRef,
			&intent.NIRSnapshotRef,
			&intent.GovernanceSnapshotRef,
			&intent.GovernanceHash,
			&intent.SourceRowNum,
			&intent.AggregateConfidenceScore,
			&intent.RequiredFieldsStatus,
			&intent.TokenizationStatus,
			&intent.GovernanceDecision,
			&intent.PaymentInstructionReceived,
			&intent.CanonicalIntentCreated,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan payment intent detail row: %w", err)
		}
		items = append(items, intent)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating payment intent detail rows: %w", err)
	}

	return items, total, nil
}

func (r *IntentQueryRepo) ListDLQItemsByBatch(
	ctx context.Context,
	tenantID, batchID string,
	page, pageSize int,
) ([]models.DLQEntry, int, error) {

	const countQ = `
		SELECT COUNT(*)
		FROM dlq_items d
		LEFT JOIN normalized_ingest_records n
			ON n.tenant_id = d.tenant_id
		   AND n.envelope_id = d.envelope_id
		WHERE d.tenant_id = $1
		  AND COALESCE(
				NULLIF(d.client_batch_ref, ''),
				NULLIF(d.batch_id, ''),
				NULLIF(n.fields_json->>'client_batch_ref', '')
		  ) = $2
	`
	var total int
	if err := r.db.QueryRowContext(ctx, countQ, tenantID, batchID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count dlq items by batch: %w", err)
	}

	const dataQ = `
		SELECT
			d.dlq_id,
			d.tenant_id,
			d.envelope_id,
			d.stage,
			d.reason_code,
			d.error_detail,
			d.replayable,
			d.client_batch_ref,
			d.created_at,
			COALESCE(d.batch_id, ''),
			d.source_row_num
		FROM dlq_items d
		LEFT JOIN normalized_ingest_records n
			ON n.tenant_id = d.tenant_id
		   AND n.envelope_id = d.envelope_id
		WHERE d.tenant_id = $1
		  AND COALESCE(
				NULLIF(d.client_batch_ref, ''),
				NULLIF(d.batch_id, ''),
				NULLIF(n.fields_json->>'client_batch_ref', '')
		  ) = $2
		ORDER BY d.created_at DESC, d.dlq_id DESC
	`

	rows, err := r.db.QueryContext(ctx, dataQ, tenantID, batchID)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch dlq items by batch: %w", err)
	}
	defer rows.Close()

	items := make([]models.DLQEntry, 0)
	for rows.Next() {
		var e models.DLQEntry
		if err := rows.Scan(
			&e.DLQID,
			&e.TenantID,
			&e.EnvelopeID,
			&e.Stage,
			&e.ReasonCode,
			&e.ErrorDetail,
			&e.Replayable,
			&e.ClientBatchRef,
			&e.CreatedAt,
			&e.BatchID,
			&e.SourceRowNum,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan dlq detail row: %w", err)
		}
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating dlq detail rows: %w", err)
	}

	return items, total, nil
}
func (r *IntentQueryRepo) ListBatchIDsByTenant(
	ctx context.Context,
	tenantID string,
) ([]models.BatchIDItem, error) {
	const q = `
		SELECT batchid, COALESCE(SUM(amount), 0) as total_amount
		FROM payment_intents
		WHERE tenant_id = $1
		  AND batchid IS NOT NULL
		  AND batchid <> ''
		GROUP BY batchid
		ORDER BY batchid
	`

	rows, err := r.db.QueryContext(ctx, q, tenantID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch batch ids: %w", err)
	}
	defer rows.Close()

	items := make([]models.BatchIDItem, 0)
	for rows.Next() {
		var it models.BatchIDItem
		if err := rows.Scan(&it.BatchID, &it.TotalAmount); err != nil {
			return nil, fmt.Errorf("failed to scan batch id: %w", err)
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating batch ids: %w", err)
	}

	return items, nil
}

func (r *IntentQueryRepo) ListPaymentIntentLiteByBatch(
	ctx context.Context,
	tenantID, batchID string,
) ([]models.PaymentIntentLite, error) {
	const q = `
		SELECT
			tenant_id::text,
			amount::text,
			currency,
			intended_execution_at,
			COALESCE(provider_hint, '') AS provider_hint,
			intent_quality_score,
			aggregate_confidence_score,
			intent_id::text,
			COALESCE(client_payout_ref, '') AS client_payout_ref,
			source_row_num,
			COALESCE(beneficiary_type, '') AS beneficiary_type,
			COALESCE(beneficiary, '{}'::jsonb) AS beneficiary
		FROM payment_intents
		WHERE tenant_id = $1
		  AND batchid = $2
		ORDER BY source_row_num ASC NULLS LAST, created_at ASC, intent_id ASC
	`

	rows, err := r.db.QueryContext(ctx, q, tenantID, batchID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch payment intent lite rows: %w", err)
	}
	defer rows.Close()

	items := make([]models.PaymentIntentLite, 0)
	for rows.Next() {
		var row models.PaymentIntentLite
		var execAt sql.NullTime
		var quality sql.NullFloat64
		var aggregate sql.NullFloat64
		var sourceRow sql.NullInt64

		if err := rows.Scan(
			&row.TenantID,
			&row.Amount,
			&row.Currency,
			&execAt,
			&row.ProviderHint,
			&quality,
			&aggregate,
			&row.IntentID,
			&row.ClientPayoutRef,
			&sourceRow,
			&row.BeneficiaryType,
			&row.Beneficiary,
		); err != nil {
			return nil, fmt.Errorf("failed to scan payment intent lite row: %w", err)
		}

		if execAt.Valid {
			t := execAt.Time
			row.IntendedExecutionAt = &t
		}
		if quality.Valid {
			v := quality.Float64
			row.IntentQualityScore = &v
		}
		if aggregate.Valid {
			v := aggregate.Float64
			row.AggregateConfidenceScore = &v
		}
		if sourceRow.Valid {
			n := int(sourceRow.Int64)
			row.SourceRowNum = &n
		}

		items = append(items, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating payment intent lite rows: %w", err)
	}

	return items, nil
}

func (r *IntentQueryRepo) ListDLQItemsByBatchSimple(
	ctx context.Context,
	tenantID, batchID string,
) ([]models.DLQEntry, error) {
	const q = `
		SELECT
			dlq_id,
			tenant_id::text,
			stage,
			reason_code,
			COALESCE(error_detail, '') AS error_detail,
			replayable,
			COALESCE(client_batch_ref, '') AS client_batch_ref,
			created_at,
			COALESCE(batch_id, '') AS batch_id,
			source_row_num,
			COALESCE(dlq_status, '') AS dlq_status,
			intent_context
		FROM dlq_items
		WHERE tenant_id = $1
		  AND (client_batch_ref = $2 OR batch_id = $2)
		ORDER BY source_row_num ASC NULLS LAST, created_at ASC, dlq_id ASC
	`

	rows, err := r.db.QueryContext(ctx, q, tenantID, batchID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch dlq rows by batch: %w", err)
	}
	defer rows.Close()

	items := make([]models.DLQEntry, 0)
	for rows.Next() {
		var e models.DLQEntry
		var sourceRow sql.NullInt64
		var intentContext []byte
		if err := rows.Scan(
			&e.DLQID,
			&e.TenantID,
			&e.Stage,
			&e.ReasonCode,
			&e.ErrorDetail,
			&e.Replayable,
			&e.ClientBatchRef,
			&e.CreatedAt,
			&e.BatchID,
			&sourceRow,
			&e.DLQStatus,
			&intentContext,
		); err != nil {
			return nil, fmt.Errorf("failed to scan dlq row: %w", err)
		}
		if sourceRow.Valid {
			n := int(sourceRow.Int64)
			e.SourceRowNum = &n
		}
		if len(intentContext) > 0 {
			e.IntentContext = intentContext
		}
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating dlq rows: %w", err)
	}

	return items, nil
}
