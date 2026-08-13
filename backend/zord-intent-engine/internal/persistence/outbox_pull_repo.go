package persistence

import (
	"context"
	"database/sql"
	"time"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type OutboxPullRepository interface {
	LeaseOutboxBatch(ctx context.Context, limit int, leaseTTLSeconds int, leasedBy string) (string, *time.Time, []models.OutboxEvent, error)
	AckOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error)
	NackOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error)
}

type OutboxPullRepo struct {
	db *sql.DB
}

const (
	maxOutboxAttempts = 7
	maxOutboxAgeHours = 8
)

func NewOutboxPullRepo(db *sql.DB) *OutboxPullRepo {
	return &OutboxPullRepo{db: db}
}

func (r *OutboxPullRepo) LeaseOutboxBatch(ctx context.Context, limit int, leaseTTLSeconds int, leasedBy string) (string, *time.Time, []models.OutboxEvent, error) {
	const maxLeaseLimit = 1000

	if limit <= 0 {
		limit = 500
	}
	if limit > maxLeaseLimit {
		limit = maxLeaseLimit
	}

	leaseUUID := uuid.New()
	leaseID := leaseUUID.String()

	// INT-09: the RETURNING clause and the outer SELECT below both derive
	// from outboxLeaseColumns (outbox_lease_contract.go) — previously these
	// were two independently hand-typed 56-column lists in this same query
	// that had to stay in the same order by eye, with no automated check
	// tying them together.
	query := `
WITH picked AS (
	SELECT event_id
	FROM outbox
	WHERE status = 'PENDING'
	  AND retry_count < $5
	  AND (lease_until IS NULL OR lease_until < NOW())
	  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
	ORDER BY created_at ASC
	LIMIT $1
	FOR UPDATE SKIP LOCKED
),
leased AS (
	UPDATE outbox o
	SET lease_id = $2::uuid,
	    leased_by = $3,
	    lease_until = NOW() + ($4::int * INTERVAL '1 second')
	FROM picked p
	WHERE o.event_id = p.event_id
	RETURNING
		` + buildOutboxLeaseReturningSQL() + `
)
SELECT
	` + buildOutboxLeaseSelectSQL() + `
FROM leased
ORDER BY created_at ASC;
`

	rows, err := r.db.QueryContext(ctx, query, limit, leaseID, leasedBy, leaseTTLSeconds, maxOutboxAttempts)
	if err != nil {
		return "", nil, nil, err
	}
	defer rows.Close()

	events := make([]models.OutboxEvent, 0, limit)
	var leaseUntil *time.Time

	for rows.Next() {
		var evt models.OutboxEvent
		var nextRetry sql.NullTime
		var lu sql.NullTime
		var corridorId sql.NullString
		var canonicalHash sql.NullString
		var governanceState sql.NullString
		var governanceHash sql.NullString
		// INT-02: intended_execution_at is genuinely nullable with no sensible
		// COALESCE default (unlike the string/score columns below); confidence_score
		// and aggregate_confidence_score are *float64 fields on models.OutboxEvent,
		// so — even though COALESCE(...,0) guarantees a non-NULL SQL value — they
		// need a plain-float64 scan destination before being taken by address.
		var intendedExecutionAt sql.NullTime
		var confidenceScore float64
		var aggregateConfidenceScore float64

		if err := rows.Scan(
			&evt.EventID,
			&evt.EnvelopeID,
			&evt.TraceID,
			&evt.TenantID,
			&evt.ContractID,
			&evt.AggregateType,
			&evt.AggregateID,
			&evt.EventType,
			&evt.Amount,
			&evt.Currency,
			&corridorId,
			&evt.RetryCount,
			&nextRetry,
			&evt.Payload,
			&evt.Status,
			&evt.CreatedAt,
			&evt.LeaseID,
			&evt.LeasedBy,
			&lu,
			&evt.BatchID,
			&evt.SourceRowNum,
			&canonicalHash,
			&governanceState,
			&governanceHash,
			&evt.MappingProfileID,
			&evt.RequiredFieldsStatus,
			&evt.TokenizationStatus,
			&evt.GovernanceDecision,
			&evt.PaymentInstructionReceived,
			&evt.CanonicalIntentCreated,
			&evt.ClientPayoutRef,
			&evt.IntentLifecycleState,
			&evt.MappingProfileHash,
			&evt.PolicySource,
			&evt.PolicyVersion,
			&evt.PolicyHash,
			&evt.RawRowEvidenceLeafHash,
			&evt.CanonicalRowEvidenceLeafHash,
			&evt.BusinessIdempotencyKey,
			&evt.TokenizedDataHash,
			&evt.ArtifactID,
			&evt.ArtifactVersionID,
			&evt.GovernanceReasonCodesJSON,
			&evt.ScoreVersion,
			&evt.ScoreValidityStatus,
			&evt.ScoreBreakdownJSON,
			&evt.ScoreReasonCodesJSON,
			&evt.ScoredAt,
			&evt.ReferenceQualityScore,
			&evt.DuplicateRiskScore,
			&evt.ProofReadinessScore,
			&evt.MatchabilityScore,
			&evt.IntentQualityScore,
			&evt.MappingConfidenceScore,
			&evt.SchemaCompletenessScore,
			&evt.DuplicateReasonCode,
			&evt.SchemaVersion,
			&evt.PayloadHash,
			&evt.CanonicalPayloadHash,
			&evt.SourceRowRef,
			&evt.SourceSystem,
			&evt.ClientBatchRef,
			&evt.SalientHash,
			&evt.CanonicalRowHash,
			&evt.GovernanceInputFactsHash,
			&evt.RawRowHash,
			&evt.IdempotencyKey,
			&evt.IntentType,
			&evt.CanonicalVersion,
			&intendedExecutionAt,
			&evt.Constraints,
			&evt.BeneficiaryType,
			&evt.PIITokens,
			&evt.Beneficiary,
			&evt.IntentStatus,
			&confidenceScore,
			&evt.CanonicalSnapshotRef,
			&evt.NIRSnapshotRef,
			&evt.GovernanceSnapshotRef,
			&evt.ProviderHint,
			&evt.RequestFingerprint,
			&evt.RoutingHintsJSON,
			&evt.BusinessState,
			&evt.DuplicateRiskFlag,
			&evt.MappingProfileVersion,
			&evt.BeneficiaryFingerprint,
			&aggregateConfidenceScore,
		); err != nil {
			return "", nil, nil, err
		}

		evt.IntentID = evt.AggregateID.String()
		if corridorId.Valid {
			evt.CorridorID = &corridorId.String
		} else {
			evt.CorridorID = nil
		}
		if canonicalHash.Valid {
			evt.CanonicalHash = canonicalHash.String
		}
		if governanceState.Valid {
			evt.GovernanceState = governanceState.String
		}
		if governanceHash.Valid {
			evt.GovernanceHash = governanceHash.String
		}
		if intendedExecutionAt.Valid {
			t := intendedExecutionAt.Time
			evt.IntendedExecutionAt = &t
		}
		evt.ConfidenceScore = &confidenceScore
		evt.AggregateConfidenceScore = &aggregateConfidenceScore

		if nextRetry.Valid {
			t := nextRetry.Time
			evt.NextRetryAt = &t
		}
		// All rows in this batch share the same lease_until value because it is
		// computed once in the SQL statement (NOW() + interval).
		// We capture it from the first row only to avoid redundant assignments.
		if lu.Valid {
			t := lu.Time
			evt.LeaseUntil = &t
			if leaseUntil == nil {
				leaseUntil = &t
			}
		}

		events = append(events, evt)
	}

	if err := rows.Err(); err != nil {
		return "", nil, nil, err
	}

	// No rows leased -> return empty lease info
	if len(events) == 0 {
		return "", nil, []models.OutboxEvent{}, nil
	}

	return leaseID, leaseUntil, events, nil
}

func (r *OutboxPullRepo) AckOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error) {
	query := `
WITH locked AS (
	SELECT event_id
	FROM outbox
	WHERE lease_id = $1::uuid
	  AND event_id = ANY($2::uuid[])
	ORDER BY event_id
	FOR UPDATE
)
UPDATE outbox o
SET status = 'SENT',
    sent_at = NOW(),
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
FROM locked l
WHERE o.event_id = l.event_id;
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(eventIDs))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *OutboxPullRepo) NackOutboxBatch(ctx context.Context, leaseID string, eventIDs []string) (int64, error) {
	query := `
WITH locked AS (
	SELECT event_id
	FROM outbox
	WHERE lease_id = $1::uuid
	  AND event_id = ANY($2::uuid[])
	  AND status = 'PENDING'
	ORDER BY event_id
	FOR UPDATE
)
UPDATE outbox o
SET retry_count = o.retry_count + 1,
	status = CASE
        WHEN o.retry_count + 1 >= $3 OR o.created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN 'FAILED'
        ELSE 'PENDING'
    END,
    next_attempt_at = CASE
        WHEN o.retry_count + 1 >= $3 OR o.created_at < NOW() - ($4::int * INTERVAL '1 hour') THEN NULL
        ELSE NOW() + (
			LEAST(3600, GREATEST(1, POWER(2, o.retry_count))) * (0.8 + random() * 0.4)
		) * INTERVAL '1 second'
    END,
    lease_id = NULL,
    leased_by = NULL,
    lease_until = NULL
FROM locked l
WHERE o.event_id = l.event_id;
`
	res, err := r.db.ExecContext(ctx, query, leaseID, pq.Array(eventIDs), maxOutboxAttempts, maxOutboxAgeHours)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// FetchUnscoredEvents returns outbox events that have no active ETL quality
// run yet, for the (future) Airflow-triggered quality-scoring pipeline.
//
// Deliberately NOT a lease: it reads independent of outbox.status, so it
// never competes with zord-relay's LeaseOutboxBatch/AckOutboxBatch for the
// same PENDING rows. Before this fix, the Airflow ETL worker used the same
// lease-then-ack mechanism as the relay — if the ETL worker acked an event
// first, that row would flip to 'SENT' and zord-relay would never see it,
// silently dropping it from downstream delivery. ETL scoring is a read-only
// quality check on already-canonical events; it has no business consuming
// the delivery queue.
//
// A previously-failed run (is_active=false) is eligible for retry on the
// next fetch — matches the existing run_generation column's intent.
func (r *OutboxPullRepo) FetchUnscoredEvents(ctx context.Context, limit int) ([]models.OutboxEvent, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			o.event_id::text, o.envelope_id, o.tenant_id, o.event_type,
			COALESCE(o.amount, 0), COALESCE(o.currency, ''),
			COALESCE(o.canonical_hash, ''), COALESCE(o.governance_hash, ''), o.governance_state,
			COALESCE(o.canonical_snapshot_ref, ''), COALESCE(o.nir_snapshot_ref, ''),
			COALESCE(o.beneficiary_fingerprint, ''), COALESCE(o.client_payout_ref, ''),
			COALESCE(o.mapping_profile_id, ''), COALESCE(o.batchid, ''), o.aggregate_id
		FROM outbox o
		LEFT JOIN etl_ingest_runs e
			ON e.outbox_event_id = o.event_id::text AND e.is_active = true
		WHERE e.run_id IS NULL
		ORDER BY o.created_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]models.OutboxEvent, 0, limit)
	for rows.Next() {
		var evt models.OutboxEvent
		var batchID string
		if err := rows.Scan(
			&evt.EventID, &evt.EnvelopeID, &evt.TenantID, &evt.EventType,
			&evt.Amount, &evt.Currency, &evt.CanonicalHash, &evt.GovernanceHash, &evt.GovernanceState,
			&evt.CanonicalSnapshotRef, &evt.NIRSnapshotRef,
			&evt.BeneficiaryFingerprint, &evt.ClientPayoutRef,
			&evt.MappingProfileID, &batchID, &evt.AggregateID,
		); err != nil {
			return nil, err
		}
		if batchID != "" {
			evt.BatchID = &batchID
		}
		evt.IntentID = evt.AggregateID.String()
		events = append(events, evt)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}
