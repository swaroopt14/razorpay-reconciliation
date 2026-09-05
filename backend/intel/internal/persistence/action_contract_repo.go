package persistence

// action_contract_repo.go
//
// Reads and writes the action_contracts table.
// IMPORTANT: This table is IMMUTABLE — we only INSERT rows, never UPDATE data fields.
//            The ONLY allowed UPDATEs are to contract_status (approval lifecycle).
//
// PHASE 5 ADDITIONS:
//   - InsertIfNewTx now writes contract_status, expires_at, policy_family, severity
//   - UpdateStatus:           approve / dismiss a PENDING_APPROVAL contract
//   - ListPendingApproval:    ops dashboard — "what needs human review?"
//   - MarkExpiredContracts:   background job — expire stale approval windows
//   - ListByDecision:         "show all HOLD decisions for tenant X"
//   - ListByPolicyFamily:     "show all LEAKAGE-family actions"
//
// WHO WRITES TO THIS FILE?
//   action_service.go → InsertIfNewTx()  when a policy fires
//   action_handler.go → UpdateStatus()   when ops approves/dismisses
//   outbox_worker.go  → MarkExpiredContracts() on every tick
//
// WHO READS FROM THIS FILE?
//   action_handler.go → List, GetByID, ListPendingApproval for the frontend

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/models"
)

// ActionContractRepo reads and writes action_contracts.
type ActionContractRepo struct {
	pool *pgxpool.Pool
}

// NewActionContractRepo creates an ActionContractRepo.
func NewActionContractRepo(pool *pgxpool.Pool) *ActionContractRepo {
	return &ActionContractRepo{pool: pool}
}

// ── INSERT ────────────────────────────────────────────────────────────────────

// insertSQL is the shared INSERT statement used by all insert paths.
// PHASE 5: Includes contract_status, expires_at, policy_family, severity.
// PHASE 5 (refactor): Includes policy lineage, scope classifier, trigger
// lineage, integrity/signature hashes — see models.ActionContract for the
// full field list. "PHASE 5 (refactor)" = this refactor's phase 5, distinct
// from this file's own pre-existing "PHASE 5" naming (see that file's note).
const insertSQL = `
	INSERT INTO action_contracts
		(action_id, tenant_id, policy_id, policy_version,
		 scope_refs, input_refs_json, decision, confidence,
		 payload_json, integrity_digest, idempotency_key,
		 contract_status, expires_at, policy_family, severity,
		 created_at,
		 policy_registry_id, policy_source, policy_digest,
		 scope_type, scope_ref, scope_refs_hash,
		 trigger_event_id, trigger_event_source, trigger_event_type, trigger_event_version,
		 input_facts_hash, payload_hash, payload_schema_version,
		 mapping_profile_id, mapping_profile_version, mapping_profile_hash,
		 signature_algorithm, signature_key_id, signature_payload_hash,
		 canonicalization_version, signed_at, signature_verification_status)
	VALUES
		($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
		 $12, $13, $14, $15,
		 $16,
		 $17, $18, $19,
		 $20, $21, $22,
		 $23, $24, $25, $26,
		 $27, $28, $29,
		 $30, $31, $32,
		 $33, $34, $35,
		 $36, $37, $38)
	ON CONFLICT (idempotency_key) DO NOTHING
`

// nilIfEmpty converts an empty string to a nil pointer so optional Phase 5
// (refactor) columns store SQL NULL instead of an empty string — matching
// the same idiom already used here for policy_family/severity.
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// buildInsertArgs constructs the $1..$37 argument list for insertSQL.
// Handles nil-ification of nullable string fields.
func buildInsertArgs(ac models.ActionContract) ([]any, error) {
	scopeJSON, err := json.Marshal(ac.ScopeRefs)
	if err != nil {
		return nil, fmt.Errorf("marshal scope_refs: %w", err)
	}

	var policyFamily *string
	if ac.PolicyFamily != "" {
		s := string(ac.PolicyFamily)
		policyFamily = &s
	}
	var severity *string
	if ac.Severity != "" {
		s := ac.Severity
		severity = &s
	}

	return []any{
		ac.ActionID,
		ac.TenantID,
		ac.PolicyID,
		ac.PolicyVersion,
		string(scopeJSON),
		ac.InputRefsJSON,
		string(ac.Decision),
		ac.Confidence,
		ac.PayloadJSON,
		ac.IntegrityDigest,
		ac.IdempotencyKey,
		string(ac.ContractStatus), // PHASE 5
		ac.ExpiresAt,              // PHASE 5 — *time.Time, nil → NULL
		policyFamily,              // PHASE 5 — *string, nil → NULL
		severity,                  // PHASE 5 — *string, nil → NULL
		ac.CreatedAt,
		// ── PHASE 5 (refactor) ──────────────────────────────────────────────
		nilIfEmpty(ac.PolicyRegistryID),
		nilIfEmpty(ac.PolicySource),
		nilIfEmpty(ac.PolicyDigest),
		nilIfEmpty(ac.ScopeType),
		nilIfEmpty(ac.ScopeRef),
		nilIfEmpty(ac.ScopeRefsHash),
		nilIfEmpty(ac.TriggerEventID),
		nilIfEmpty(ac.TriggerEventSource),
		nilIfEmpty(ac.TriggerEventType),
		nilIfEmpty(ac.TriggerEventVersion),
		nilIfEmpty(ac.InputFactsHash),
		nilIfEmpty(ac.PayloadHash),
		nilIfEmpty(ac.PayloadSchemaVersion),
		ac.MappingProfileID, // already *string, nil by default (reserved, unpopulated)
		ac.MappingProfileVersion,
		ac.MappingProfileHash,
		nilIfEmpty(ac.SignatureAlgorithm),
		nilIfEmpty(ac.SignatureKeyID),
		nilIfEmpty(ac.SignaturePayloadHash),
		nilIfEmpty(ac.CanonicalizationVersion),
		ac.SignedAt, // *time.Time, nil → NULL
		nilIfEmpty(ac.SignatureVerificationStatus),
	}, nil
}

// InsertIfNew inserts an ActionContract only if the idempotency_key is new.
// Non-transactional — for use outside of transactions.
func (r *ActionContractRepo) InsertIfNew(ctx context.Context, ac models.ActionContract) error {
	args, err := buildInsertArgs(ac)
	if err != nil {
		return fmt.Errorf("action_repo.InsertIfNew id=%s: %w", ac.ActionID, err)
	}
	_, err = r.pool.Exec(ctx, insertSQL, args...)
	if err != nil {
		return fmt.Errorf("action_repo.InsertIfNew id=%s: %w", ac.ActionID, err)
	}
	return nil
}

// InsertIfNewTx inserts an ActionContract inside an existing pgx.Tx transaction.
//
// PHASE 5: Writes contract_status, expires_at, policy_family, severity.
//
// Returns (true, nil)  → row was inserted (new contract)
// Returns (false, nil) → idempotency_key already existed (duplicate, silently skipped)
// Returns (false, err) → database error
func (r *ActionContractRepo) InsertIfNewTx(
	ctx context.Context,
	tx pgx.Tx,
	ac models.ActionContract,
) (bool, error) {
	args, err := buildInsertArgs(ac)
	if err != nil {
		return false, fmt.Errorf("action_repo.InsertIfNewTx id=%s: %w", ac.ActionID, err)
	}
	tag, err := tx.Exec(ctx, insertSQL, args...)
	if err != nil {
		return false, fmt.Errorf("action_repo.InsertIfNewTx id=%s: %w", ac.ActionID, err)
	}
	return tag.RowsAffected() > 0, nil
}

// RecordDecisionTx inserts an audit row for one approve/dismiss decision,
// inside an existing pgx.Tx so it commits atomically with the corresponding
// UpdateStatus / outbox insert (INTEL-02).
func (r *ActionContractRepo) RecordDecisionTx(
	ctx context.Context,
	tx pgx.Tx,
	d models.ActionContractDecision,
) error {
	sql := `
		INSERT INTO action_contract_decisions (
			action_id, tenant_id, decision, actor_subject_id, actor_roles,
			reason, prior_contract_status, prior_integrity_digest
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := tx.Exec(ctx, sql,
		d.ActionID, d.TenantID, d.Decision, d.ActorSubjectID, d.ActorRoles,
		d.Reason, d.PriorContractStatus, d.PriorIntegrityDigest,
	)
	if err != nil {
		return fmt.Errorf("action_repo.RecordDecisionTx action=%s decision=%s: %w", d.ActionID, d.Decision, err)
	}
	return nil
}

// ── STATUS LIFECYCLE (PHASE 5) ────────────────────────────────────────────────

// UpdateStatus transitions a PENDING_APPROVAL contract to APPROVED or DISMISSED.
//
// GUARD: only contracts currently in PENDING_APPROVAL can be transitioned.
// If the contract is already APPROVED, DISMISSED, or EXPIRED, this returns
// (false, nil) — caller should respond 409 Conflict.
//
// FINTECH RULE: We never update any data field (decision, confidence, payload).
// Only the lifecycle status changes. The audit signature over the data fields
// remains valid forever — proving the decision was not tampered with.
func (r *ActionContractRepo) UpdateStatus(
	ctx context.Context,
	actionID string,
	newStatus models.ContractStatus,
) (updated bool, err error) {
	sql := `
		UPDATE action_contracts
		SET    contract_status = $1
		WHERE  action_id       = $2
		  AND  contract_status = 'PENDING_APPROVAL'
	`
	tag, err := r.pool.Exec(ctx, sql, string(newStatus), actionID)
	if err != nil {
		return false, fmt.Errorf("action_repo.UpdateStatus action=%s status=%s: %w",
			actionID, newStatus, err)
	}
	return tag.RowsAffected() > 0, nil
}

// UpdateStatusTx is UpdateStatus run inside an existing pgx.Tx, so the
// status transition commits atomically with an audit decision row
// (INTEL-02's RecordDecisionTx) or an outbox insert in the same transaction.
func (r *ActionContractRepo) UpdateStatusTx(
	ctx context.Context,
	tx pgx.Tx,
	actionID string,
	newStatus models.ContractStatus,
) (updated bool, err error) {
	sql := `
		UPDATE action_contracts
		SET    contract_status = $1
		WHERE  action_id       = $2
		  AND  contract_status = 'PENDING_APPROVAL'
	`
	tag, err := tx.Exec(ctx, sql, string(newStatus), actionID)
	if err != nil {
		return false, fmt.Errorf("action_repo.UpdateStatusTx action=%s status=%s: %w",
			actionID, newStatus, err)
	}
	return tag.RowsAffected() > 0, nil
}

// MarkExpiredContracts sweeps all PENDING_APPROVAL contracts whose expires_at
// has passed and transitions them to EXPIRED.
//
// Called by outbox_worker on every tick to keep approval windows clean.
// Using a single bulk UPDATE is more efficient than row-by-row scanning.
//
// Returns the number of contracts expired (for logging).
func (r *ActionContractRepo) MarkExpiredContracts(ctx context.Context) (int64, error) {
	sql := `
		UPDATE action_contracts
		SET    contract_status = 'EXPIRED'
		WHERE  contract_status = 'PENDING_APPROVAL'
		  AND  expires_at      IS NOT NULL
		  AND  expires_at      < now()
	`
	tag, err := r.pool.Exec(ctx, sql)
	if err != nil {
		return 0, fmt.Errorf("action_repo.MarkExpiredContracts: %w", err)
	}
	return tag.RowsAffected(), nil
}

// ── READS ─────────────────────────────────────────────────────────────────────

// selectCols is the shared column list for all SELECT queries.
// Keeping it in one place ensures all scan calls stay in sync.
// PHASE 5 (refactor): policy_registry_id is cast to ::text — it's a UUID
// column, but every other ID in this codebase is treated as a plain string,
// so casting here avoids requiring the uuid type registered with pgx.
const selectCols = `
	action_id, tenant_id, policy_id, policy_version,
	scope_refs::text, input_refs_json::text, decision, confidence,
	payload_json::text, integrity_digest, idempotency_key,
	contract_status, expires_at, policy_family, severity,
	created_at,
	policy_registry_id::text, policy_source, policy_digest,
	scope_type, scope_ref, scope_refs_hash,
	trigger_event_id, trigger_event_source, trigger_event_type, trigger_event_version,
	input_facts_hash, payload_hash, payload_schema_version,
	mapping_profile_id, mapping_profile_version, mapping_profile_hash,
	signature_algorithm, signature_key_id, signature_payload_hash,
	canonicalization_version, signed_at, signature_verification_status
`

// GetByID returns a single ActionContract by its action_id.
// Returns (nil, nil) if not found.
func (r *ActionContractRepo) GetByID(ctx context.Context, actionID string) (*models.ActionContract, error) {
	sql := `SELECT ` + selectCols + ` FROM action_contracts WHERE action_id = $1`
	row := r.pool.QueryRow(ctx, sql, actionID)
	return scanActionContract(row.Scan)
}

// GetByIDForTenant returns a single ActionContract scoped to tenantID.
// INTEL-02: a bare action_id is not secret, so an unscoped lookup lets any
// caller who can guess/enumerate an ID read another tenant's action. Returns
// (nil, nil) both when no such action exists AND when it exists but belongs
// to a different tenant — deliberately indistinguishable, so this can't be
// used as a tenant-existence oracle.
func (r *ActionContractRepo) GetByIDForTenant(ctx context.Context, tenantID, actionID string) (*models.ActionContract, error) {
	sql := `SELECT ` + selectCols + ` FROM action_contracts WHERE action_id = $1 AND tenant_id = $2`
	row := r.pool.QueryRow(ctx, sql, actionID, tenantID)
	return scanActionContract(row.Scan)
}

// List returns recent ActionContracts for a tenant, newest first.
// Supports cursor-based pagination via the `before` timestamp.
func (r *ActionContractRepo) List(
	ctx context.Context,
	tenantID string,
	limit int,
	before time.Time,
) ([]models.ActionContract, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	sql := `SELECT ` + selectCols + `
		FROM   action_contracts
		WHERE  tenant_id  = $1
		  AND  created_at < $2
		ORDER  BY created_at DESC
		LIMIT  $3`
	rows, err := r.pool.Query(ctx, sql, tenantID, before, limit)
	if err != nil {
		return nil, fmt.Errorf("action_repo.List tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()
	return scanActionContractRows(rows)
}

// ListByScope returns actions related to a specific entity (contract, intent, corridor, batch).
// Uses the GIN index on scope_refs JSONB for fast lookup.
func (r *ActionContractRepo) ListByScope(
	ctx context.Context,
	tenantID, scopeField, scopeValue string,
) ([]models.ActionContract, error) {
	filter := fmt.Sprintf(`{"%s": "%s"}`, scopeField, scopeValue)
	sql := `SELECT ` + selectCols + `
		FROM   action_contracts
		WHERE  tenant_id  = $1
		  AND  scope_refs @> $2::jsonb
		ORDER  BY created_at DESC
		LIMIT  100`
	rows, err := r.pool.Query(ctx, sql, tenantID, filter)
	if err != nil {
		return nil, fmt.Errorf("action_repo.ListByScope: %w", err)
	}
	defer rows.Close()
	return scanActionContractRows(rows)
}

// ListPendingApproval returns all PENDING_APPROVAL contracts for a tenant.
//
// PHASE 5: Powers the ops approval dashboard.
// Ordered by expires_at ASC (most urgent first) — contracts about to expire
// appear at the top so ops handles time-sensitive decisions before auto-expiry.
// Contracts with no expires_at (NULL) appear last.
func (r *ActionContractRepo) ListPendingApproval(
	ctx context.Context,
	tenantID string,
) ([]models.ActionContract, error) {
	sql := `SELECT ` + selectCols + `
		FROM   action_contracts
		WHERE  tenant_id       = $1
		  AND  contract_status = 'PENDING_APPROVAL'
		ORDER  BY expires_at ASC NULLS LAST, created_at ASC
		LIMIT  200`
	rows, err := r.pool.Query(ctx, sql, tenantID)
	if err != nil {
		return nil, fmt.Errorf("action_repo.ListPendingApproval tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()
	return scanActionContractRows(rows)
}

// ListByDecision returns actions filtered by decision type, newest first.
//
// PHASE 5: Enables intelligence-layer dashboards to show
// "all HOLD decisions" or "all REVIEW_AMBIGUOUS_BATCH decisions" for a tenant.
func (r *ActionContractRepo) ListByDecision(
	ctx context.Context,
	tenantID string,
	decision models.Decision,
	limit int,
) ([]models.ActionContract, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	sql := `SELECT ` + selectCols + `
		FROM   action_contracts
		WHERE  tenant_id = $1
		  AND  decision  = $2
		ORDER  BY created_at DESC
		LIMIT  $3`
	rows, err := r.pool.Query(ctx, sql, tenantID, string(decision), limit)
	if err != nil {
		return nil, fmt.Errorf("action_repo.ListByDecision tenant=%s decision=%s: %w",
			tenantID, decision, err)
	}
	defer rows.Close()
	return scanActionContractRows(rows)
}

// ListByPolicyFamily returns actions filtered by policy family, newest first.
//
// PHASE 5: Powers family-scoped dashboards such as
// "All LEAKAGE actions this week" or "All AMBIGUITY actions pending review".
func (r *ActionContractRepo) ListByPolicyFamily(
	ctx context.Context,
	tenantID string,
	family models.PolicyFamily,
	limit int,
) ([]models.ActionContract, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	sql := `SELECT ` + selectCols + `
		FROM   action_contracts
		WHERE  tenant_id     = $1
		  AND  policy_family = $2
		ORDER  BY created_at DESC
		LIMIT  $3`
	rows, err := r.pool.Query(ctx, sql, tenantID, string(family), limit)
	if err != nil {
		return nil, fmt.Errorf("action_repo.ListByPolicyFamily tenant=%s family=%s: %w",
			tenantID, family, err)
	}
	defer rows.Close()
	return scanActionContractRows(rows)
}

// ActionRateSummary holds aggregate counts for the dashboard recommendation KPIs.
//
// KPI 15 — action_acceptance_rate = Accepted / Total
// KPI 16 — action_resolution_rate = Resolved / Total
//
// Definitions used here:
//   Total    = all contracts for the tenant (excluding EXPIRED for a fair denominator)
//   Accepted = contracts with contract_status = 'APPROVED'
//   Resolved = contracts that reached a terminal decision: APPROVED or DISMISSED
//              (i.e. a human acted on them — not left as PENDING or auto-expired)
type ActionRateSummary struct {
	Total    int
	Accepted int
	Resolved int
}

// GetRateSummary returns aggregate counts for recommendation KPIs 15 and 16.
//
// Optional from/to filter on created_at lets dashboard date-range queries
// show rates for a specific period (e.g. "last 30 days").
// Passing nil for both returns the all-time summary.
func (r *ActionContractRepo) GetRateSummary(
	ctx context.Context,
	tenantID string,
	from, to *time.Time,
) (ActionRateSummary, error) {
	query := `
		SELECT
			COUNT(*)                                                    AS total,
			COUNT(*) FILTER (WHERE contract_status = 'APPROVED')       AS accepted,
			COUNT(*) FILTER (WHERE contract_status IN ('APPROVED','DISMISSED')) AS resolved
		FROM action_contracts
		WHERE tenant_id       = $1
		  AND contract_status != 'EXPIRED'
	`
	args := []any{tenantID}
	argIdx := 2

	if from != nil {
		query += fmt.Sprintf(" AND created_at >= $%d", argIdx)
		args = append(args, *from)
		argIdx++
	}
	if to != nil {
		query += fmt.Sprintf(" AND created_at <= $%d", argIdx)
		args = append(args, *to)
		argIdx++
	}
	_ = argIdx

	var s ActionRateSummary
	if err := r.pool.QueryRow(ctx, query, args...).Scan(&s.Total, &s.Accepted, &s.Resolved); err != nil {
		return ActionRateSummary{}, fmt.Errorf("action_repo.GetRateSummary tenant=%s: %w", tenantID, err)
	}
	return s, nil
}

// HasRecentAction returns true if a non-dismissed, non-expired action already
// exists for this policy+tenant+corridor created within the last cooldown window.
//
// Used by the policy engine to prevent flooding: if P_AMBIGUITY_RATE_HIGH already
// fired for tnt_A/razorpay.UPI in the last 30 minutes, skip the new firing.
func (r *ActionContractRepo) HasRecentAction(
	ctx context.Context,
	tenantID, policyID, corridorID string,
	cooldown time.Duration,
) (bool, error) {
	since := time.Now().UTC().Add(-cooldown)
	sql := `
		SELECT COUNT(*) FROM action_contracts
		WHERE  tenant_id  = $1
		  AND  policy_id  = $2
		  AND  (scope_refs->>'corridor_id' = $3 OR $3 = '')
		  AND  contract_status NOT IN ('DISMISSED', 'EXPIRED')
		  AND  created_at >= $4
	`
	var count int
	if err := r.pool.QueryRow(ctx, sql, tenantID, policyID, corridorID, since).Scan(&count); err != nil {
		return false, fmt.Errorf("action_repo.HasRecentAction: %w", err)
	}
	return count > 0, nil
}

// ── SCAN HELPERS ──────────────────────────────────────────────────────────────

// scanActionContractRows scans a pgx.Rows result set into a slice of ActionContracts.
func scanActionContractRows(rows pgx.Rows) ([]models.ActionContract, error) {
	var result []models.ActionContract
	for rows.Next() {
		ac, err := scanActionContract(rows.Scan)
		if err != nil {
			return nil, fmt.Errorf("action_repo scan: %w", err)
		}
		result = append(result, *ac)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("action_repo rows.Err: %w", err)
	}
	return result, nil
}

// scanActionContract converts one DB row into an ActionContract struct.
// Accepts both row.Scan (QueryRow) and rows.Scan (Query loop).
//
// PHASE 5: Scans contract_status, expires_at, policy_family, severity.
// PHASE 5 (refactor): Scans policy lineage, scope classifier, trigger
// lineage, integrity/signature columns — all nullable (pre-Phase-5 rows have
// NULL here; see migration 012's comment on what is/isn't recoverable).
func scanActionContract(scan func(...any) error) (*models.ActionContract, error) {
	var ac models.ActionContract
	var decision string
	var contractStatus string
	var scopeRefsJSON string
	var policyFamily *string // nullable — *string handles NULL cleanly
	var severity *string     // nullable

	// PHASE 5 (refactor) nullable scan destinations.
	var policyRegistryID, policySource, policyDigest *string
	var scopeType, scopeRef, scopeRefsHash *string
	var triggerEventID, triggerEventSource, triggerEventType, triggerEventVersion *string
	var inputFactsHash, payloadHash, payloadSchemaVersion *string
	var signatureAlgorithm, signatureKeyID, signaturePayloadHash *string
	var canonicalizationVersion, signatureVerificationStatus *string

	err := scan(
		&ac.ActionID,
		&ac.TenantID,
		&ac.PolicyID,
		&ac.PolicyVersion,
		&scopeRefsJSON,
		&ac.InputRefsJSON,
		&decision,
		&ac.Confidence,
		&ac.PayloadJSON,
		&ac.IntegrityDigest,
		&ac.IdempotencyKey,
		&contractStatus, // PHASE 5
		&ac.ExpiresAt,   // PHASE 5 — *time.Time, pgx sets nil for NULL
		&policyFamily,   // PHASE 5
		&severity,       // PHASE 5
		&ac.CreatedAt,
		&policyRegistryID, &policySource, &policyDigest,
		&scopeType, &scopeRef, &scopeRefsHash,
		&triggerEventID, &triggerEventSource, &triggerEventType, &triggerEventVersion,
		&inputFactsHash, &payloadHash, &payloadSchemaVersion,
		&ac.MappingProfileID, &ac.MappingProfileVersion, &ac.MappingProfileHash,
		&signatureAlgorithm, &signatureKeyID, &signaturePayloadHash,
		&canonicalizationVersion, &ac.SignedAt, &signatureVerificationStatus,
	)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, fmt.Errorf("scanActionContract: %w", err)
	}

	ac.Decision = models.Decision(decision)
	ac.ContractStatus = models.ContractStatus(contractStatus)

	if policyFamily != nil {
		ac.PolicyFamily = models.PolicyFamily(*policyFamily)
	}
	if severity != nil {
		ac.Severity = *severity
	}
	if policyRegistryID != nil {
		ac.PolicyRegistryID = *policyRegistryID
	}
	if policySource != nil {
		ac.PolicySource = *policySource
	}
	if policyDigest != nil {
		ac.PolicyDigest = *policyDigest
	}
	if scopeType != nil {
		ac.ScopeType = *scopeType
	}
	if scopeRef != nil {
		ac.ScopeRef = *scopeRef
	}
	if scopeRefsHash != nil {
		ac.ScopeRefsHash = *scopeRefsHash
	}
	if triggerEventID != nil {
		ac.TriggerEventID = *triggerEventID
	}
	if triggerEventSource != nil {
		ac.TriggerEventSource = *triggerEventSource
	}
	if triggerEventType != nil {
		ac.TriggerEventType = *triggerEventType
	}
	if triggerEventVersion != nil {
		ac.TriggerEventVersion = *triggerEventVersion
	}
	if inputFactsHash != nil {
		ac.InputFactsHash = *inputFactsHash
	}
	if payloadHash != nil {
		ac.PayloadHash = *payloadHash
	}
	if payloadSchemaVersion != nil {
		ac.PayloadSchemaVersion = *payloadSchemaVersion
	}
	if signatureAlgorithm != nil {
		ac.SignatureAlgorithm = *signatureAlgorithm
	}
	if signatureKeyID != nil {
		ac.SignatureKeyID = *signatureKeyID
	}
	if signaturePayloadHash != nil {
		ac.SignaturePayloadHash = *signaturePayloadHash
	}
	if canonicalizationVersion != nil {
		ac.CanonicalizationVersion = *canonicalizationVersion
	}
	if signatureVerificationStatus != nil {
		ac.SignatureVerificationStatus = *signatureVerificationStatus
	}

	if err := json.Unmarshal([]byte(scopeRefsJSON), &ac.ScopeRefs); err != nil {
		return nil, fmt.Errorf("scanActionContract unmarshal scope_refs: %w", err)
	}

	return &ac, nil
}
