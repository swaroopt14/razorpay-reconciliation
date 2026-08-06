package persistence

//   policy_service.go → GetByTrigger() to find policies to evaluate on each event
//   policy_handler.go → Insert(), SetEnabled() when ops team manages policies via API
//
// PHASE 5 (refactor) ADDITIONS: Insert()/SetEnabled() dual-write immutable
// policy_definitions + policy_activations rows alongside the unchanged
// policy_registry writes (see REFACTOR_IMPLEMENTATION_GUIDE.md §K). This
// "PHASE 5 (refactor)" label is this refactor's phase — unrelated to this
// codebase's own pre-existing "PHASE 5" naming elsewhere (action_contracts'
// approval-lifecycle feature). policy_registry stays the source of truth for
// every read path in this file; the dual-write is best-effort and never
// fails the primary write (errors are logged, not propagated) — matching the
// same "old table stays authoritative" precedent as Phase 1/2's dual-writes.

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/logger"
	"github.com/zord/zord-intelligence/internal/models"
)

type PolicyRepo struct {
	pool *pgxpool.Pool
}

func NewPolicyRepo(pool *pgxpool.Pool) *PolicyRepo {
	return &PolicyRepo{pool: pool}
}

// policyDefinitionCols is appended to every policy_registry SELECT so
// callers get the matching policy_definitions row's identity/digest
// (PHASE 5 (refactor) — this refactor's phase 5, unrelated to this
// codebase's own pre-existing "PHASE 5" naming elsewhere). A correlated
// subquery, not a JOIN: a policy missing its dual-written definition (should
// not happen post-backfill, but must never silently drop a live policy from
// evaluation) still returns normally with empty strings.
//
// Corrective-action-report P0-05: the tenant predicate below is load-bearing,
// not cosmetic. Without it, two tenants sharing the same policy_key+version
// (e.g. both on "LIMIT_HIGH_VALUE" v3) could have the correlated subquery
// return either tenant's digest depending only on created_at ordering — a
// wrong policy_registry_id/digest attached to a real action. IS NOT DISTINCT
// FROM is required (not =) because global policies store tenant_id NULL on
// both policy_registry and policy_definitions, and NULL = NULL is never true
// in plain SQL equality.
const policyDefinitionCols = `
	COALESCE((SELECT pd.policy_registry_id::text FROM policy_definitions pd
	          WHERE pd.policy_key = policy_registry.policy_id AND pd.policy_version = policy_registry.version
	            AND pd.tenant_id IS NOT DISTINCT FROM policy_registry.tenant_id
	          ORDER BY pd.created_at DESC LIMIT 1), ''),
	COALESCE((SELECT pd.policy_digest FROM policy_definitions pd
	          WHERE pd.policy_key = policy_registry.policy_id AND pd.policy_version = policy_registry.version
	            AND pd.tenant_id IS NOT DISTINCT FROM policy_registry.tenant_id
	          ORDER BY pd.created_at DESC LIMIT 1), ''),
	COALESCE((SELECT pd.policy_source FROM policy_definitions pd
	          WHERE pd.policy_key = policy_registry.policy_id AND pd.policy_version = policy_registry.version
	            AND pd.tenant_id IS NOT DISTINCT FROM policy_registry.tenant_id
	          ORDER BY pd.created_at DESC LIMIT 1), '')
`

func (r *PolicyRepo) GetByTrigger(ctx context.Context, triggerType, triggerValue string) ([]models.Policy, error) {
	sql := `
		SELECT policy_id, version, scope_type, trigger_type, trigger_value,
		       dsl, enabled, COALESCE(tenant_id, ''), created_at, updated_at,
		       COALESCE(policy_family, ''), COALESCE(severity, ''), requires_manual_approval,
` + policyDefinitionCols + `
		FROM   policy_registry
		WHERE  trigger_type  = $1
		  AND  trigger_value = $2
		  AND  enabled       = true
		ORDER  BY policy_id
	`

	rows, err := r.pool.Query(ctx, sql, triggerType, triggerValue)
	if err != nil {
		return nil, fmt.Errorf("policy_repo.GetByTrigger: %w", err)
	}
	defer rows.Close()

	var result []models.Policy
	for rows.Next() {
		var p models.Policy
		if err := rows.Scan(
			&p.PolicyID, &p.Version, &p.ScopeType,
			&p.TriggerType, &p.TriggerValue, &p.DSL,
			&p.Enabled, &p.TenantID,
			&p.CreatedAt, &p.UpdatedAt,
			&p.PolicyFamily, &p.Severity, &p.RequiresManualApproval,
			&p.PolicyRegistryID, &p.PolicyDigest, &p.PolicySource, // PHASE 5 (refactor)
		); err != nil {
			return nil, fmt.Errorf("policy_repo.GetByTrigger scan: %w", err)
		}
		result = append(result, p)
	}
	return result, nil
}

// GetByID returns one policy by its ID.
// Used by policy_handler.go to show policy details in the UI.
func (r *PolicyRepo) GetByID(ctx context.Context, policyID string) (*models.Policy, error) {
	sql := `
		SELECT policy_id, version, scope_type, trigger_type, trigger_value,
		       dsl, enabled, COALESCE(tenant_id, ''), created_at, updated_at,
		       COALESCE(policy_family, ''), COALESCE(severity, ''), requires_manual_approval,
` + policyDefinitionCols + `
		FROM   policy_registry
		WHERE  policy_id = $1
	`
	row := r.pool.QueryRow(ctx, sql, policyID)

	var p models.Policy
	err := row.Scan(
		&p.PolicyID, &p.Version, &p.ScopeType,
		&p.TriggerType, &p.TriggerValue, &p.DSL,
		&p.Enabled, &p.TenantID,
		&p.CreatedAt, &p.UpdatedAt,
		&p.PolicyFamily, &p.Severity, &p.RequiresManualApproval,
		&p.PolicyRegistryID, &p.PolicyDigest, &p.PolicySource, // PHASE 5 (refactor)
	)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil // not found is not an error
		}
		return nil, fmt.Errorf("policy_repo.GetByID id=%s: %w", policyID, err)
	}
	return &p, nil
}

// ListAll returns every policy. Used by policy_handler.go for the policy list page.
func (r *PolicyRepo) ListAll(ctx context.Context) ([]models.Policy, error) {
	sql := `
		SELECT policy_id, version, scope_type, trigger_type, trigger_value,
		       dsl, enabled, COALESCE(tenant_id, ''), created_at, updated_at,
		       COALESCE(policy_family, ''), COALESCE(severity, ''), requires_manual_approval,
` + policyDefinitionCols + `
		FROM   policy_registry
		ORDER  BY policy_id
	`
	rows, err := r.pool.Query(ctx, sql)
	if err != nil {
		return nil, fmt.Errorf("policy_repo.ListAll: %w", err)
	}
	defer rows.Close()

	var result []models.Policy
	for rows.Next() {
		var p models.Policy
		if err := rows.Scan(
			&p.PolicyID, &p.Version, &p.ScopeType,
			&p.TriggerType, &p.TriggerValue, &p.DSL,
			&p.Enabled, &p.TenantID,
			&p.CreatedAt, &p.UpdatedAt,
			&p.PolicyFamily, &p.Severity, &p.RequiresManualApproval,
			&p.PolicyRegistryID, &p.PolicyDigest, &p.PolicySource, // PHASE 5 (refactor)
		); err != nil {
			return nil, fmt.Errorf("policy_repo.ListAll scan: %w", err)
		}
		result = append(result, p)
	}
	return result, nil
}

// Insert saves a new policy.
// Called by policy_handler.go when ops team creates a policy via API.
// New policies start DISABLED — must be explicitly enabled.
func (r *PolicyRepo) Insert(ctx context.Context, p models.Policy) error {
	sql := `
		INSERT INTO policy_registry
			(policy_id, version, scope_type, trigger_type, trigger_value,
			 dsl, enabled, tenant_id, created_at, updated_at,
			 policy_family, severity, requires_manual_approval)
		VALUES
			($1, $2, $3, $4, $5, $6, false, NULLIF($7, ''), $8, $9,
			 NULLIF($10, ''), NULLIF($11, ''), $12)
	`
	// NULLIF($7, '')  — empty string → NULL for tenant_id   (reverse of COALESCE in SELECTs)
	// NULLIF($10, '') — empty string → NULL for policy_family (optional field)
	// NULLIF($11, '') — empty string → NULL for severity      (optional field; DB DEFAULT is 'MEDIUM')

	now := time.Now().UTC()
	_, err := r.pool.Exec(ctx, sql,
		p.PolicyID, p.Version, p.ScopeType,
		p.TriggerType, p.TriggerValue, p.DSL,
		p.TenantID, now, now,
		string(p.PolicyFamily), p.Severity, p.RequiresManualApproval,
	)
	if err != nil {
		return fmt.Errorf("policy_repo.Insert id=%s: %w", p.PolicyID, err)
	}

	// PHASE 5 (refactor): dual-write the immutable definition + its initial
	// (disabled — "New policies start DISABLED") activation row. Best-effort:
	// a failure here must not roll back the already-committed policy_registry
	// insert, which remains the source of truth for the hot evaluation path.
	policyRegistryID, defErr := r.insertDefinition(ctx, p, "ops_api")
	if defErr != nil {
		logger.Error(fmt.Sprintf("policy_repo.Insert: policy_definitions dual-write failed id=%s: %v", p.PolicyID, defErr))
		return nil
	}
	if actErr := r.insertActivation(ctx, p.TenantID, policyRegistryID, false, "ops_api"); actErr != nil {
		logger.Error(fmt.Sprintf("policy_repo.Insert: policy_activations dual-write failed id=%s: %v", p.PolicyID, actErr))
	}
	return nil
}

// GetAllCronPolicies returns every enabled cron-triggered policy regardless
// of their schedule string. Called by EvaluateForCron in policy_service.
// WHY A SEPARATE METHOD (not reusing GetByTrigger)?
// GetByTrigger filters by trigger_value (the schedule string).
// We need ALL cron policies, so we filter only by trigger_type = 'cron'.
// A new method makes the intent explicit and keeps GetByTrigger unchanged.
func (r *PolicyRepo) GetAllCronPolicies(ctx context.Context) ([]models.Policy, error) {
	sql := `
		SELECT policy_id, version, scope_type, trigger_type, trigger_value,
		       dsl, enabled, COALESCE(tenant_id, ''), created_at, updated_at,
		       COALESCE(policy_family, ''), COALESCE(severity, ''), requires_manual_approval,
` + policyDefinitionCols + `
		FROM   policy_registry
		WHERE  trigger_type = 'cron'
		  AND  enabled      = true
		ORDER  BY policy_id
	`
	rows, err := r.pool.Query(ctx, sql)
	if err != nil {
		return nil, fmt.Errorf("policy_repo.GetAllCronPolicies: %w", err)
	}
	defer rows.Close()

	var result []models.Policy
	for rows.Next() {
		var p models.Policy
		if err := rows.Scan(
			&p.PolicyID, &p.Version, &p.ScopeType,
			&p.TriggerType, &p.TriggerValue, &p.DSL,
			&p.Enabled, &p.TenantID,
			&p.CreatedAt, &p.UpdatedAt,
			&p.PolicyFamily, &p.Severity, &p.RequiresManualApproval,
			&p.PolicyRegistryID, &p.PolicyDigest, &p.PolicySource, // PHASE 5 (refactor)
		); err != nil {
			return nil, fmt.Errorf("policy_repo.GetAllCronPolicies scan: %w", err)
		}
		result = append(result, p)
	}
	return result, nil
}
func (r *PolicyRepo) SetEnabled(ctx context.Context, policyID string, enabled bool) error {
	sql := `
		UPDATE policy_registry
		SET    enabled    = $1,
		       updated_at = $2
		WHERE  policy_id  = $3
	`
	result, err := r.pool.Exec(ctx, sql, enabled, time.Now().UTC(), policyID)
	if err != nil {
		return fmt.Errorf("policy_repo.SetEnabled id=%s: %w", policyID, err)
	}
	// RowsAffected() tells us how many rows were updated
	// If 0, the policy_id was not found
	if result.RowsAffected() == 0 {
		return fmt.Errorf("policy_repo.SetEnabled: policy %s not found", policyID)
	}

	// PHASE 5 (refactor): append an immutable activation-history row — never
	// mutates a past row, so toggling ON/OFF/ON/OFF produces a full audit
	// trail instead of overwriting one flag. Best-effort, same as Insert().
	tenantID, policyRegistryID, lookupErr := r.latestDefinitionFor(ctx, policyID)
	if lookupErr != nil {
		logger.Error(fmt.Sprintf("policy_repo.SetEnabled: policy_definitions lookup failed id=%s: %v", policyID, lookupErr))
		return nil
	}
	if actErr := r.insertActivation(ctx, tenantID, policyRegistryID, enabled, "ops_api"); actErr != nil {
		logger.Error(fmt.Sprintf("policy_repo.SetEnabled: policy_activations dual-write failed id=%s: %v", policyID, actErr))
	}
	return nil
}

// ── PHASE 5 (refactor): policy_definitions / policy_activations dual-write ──
//
// "PHASE 5 (refactor)" = this refactor's phase 5 (policy/action/outbox
// hardening) — see the package-doc note at the top of this file.

// computePolicyDigest returns the sha256 hex digest of a policy's immutable
// rule content. MUST match migration 011's SQL derivation exactly
// (asserted by policy_definitions_test.go).
func computePolicyDigest(policyKey string, version int, scopeType, triggerType, triggerValue, dsl string) string {
	raw := fmt.Sprintf("%s|%d|%s|%s|%s|%s", policyKey, version, scopeType, triggerType, triggerValue, dsl)
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

// insertDefinition writes (or, on repeat calls with identical identity,
// returns the existing) immutable policy_definitions row for p. The no-op
// ON CONFLICT DO UPDATE exists purely so RETURNING fires on the conflicting
// row too — same idempotent-resolve idiom as Phase 3's resolveBatchContractID.
func (r *PolicyRepo) insertDefinition(ctx context.Context, p models.Policy, source string) (policyRegistryID string, err error) {
	digest := computePolicyDigest(p.PolicyID, p.Version, p.ScopeType, p.TriggerType, p.TriggerValue, p.DSL)

	var tenantID *string
	if p.TenantID != "" {
		tenantID = &p.TenantID
	}
	var policyFamily *string
	if p.PolicyFamily != "" {
		s := string(p.PolicyFamily)
		policyFamily = &s
	}
	var severity *string
	if p.Severity != "" {
		severity = &p.Severity
	}

	err = r.pool.QueryRow(ctx, `
		INSERT INTO policy_definitions
			(tenant_id, policy_key, policy_version, policy_source, policy_family,
			 scope_type, trigger_type, trigger_value, dsl, policy_digest,
			 severity, requires_manual_approval)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (tenant_id, policy_key, policy_version, policy_source) DO UPDATE
			SET policy_key = policy_definitions.policy_key
		RETURNING policy_registry_id
	`, tenantID, p.PolicyID, p.Version, source, policyFamily,
		p.ScopeType, p.TriggerType, p.TriggerValue, p.DSL, digest,
		severity, p.RequiresManualApproval,
	).Scan(&policyRegistryID)
	if err != nil {
		return "", fmt.Errorf("policy_repo.insertDefinition id=%s: %w", p.PolicyID, err)
	}
	return policyRegistryID, nil
}

// insertActivation appends one immutable policy_activations row.
//
// Corrective-action-report P0-06: the previous open-ended interval (if any)
// must be closed and the new row inserted in the SAME transaction, or a
// crash/race between the two statements can leave two open (effective_to IS
// NULL) rows for the same policy — which uq_policy_activations_open (a
// partial unique index on policy_registry_id WHERE effective_to IS NULL)
// would then reject on the next call instead of preventing the drift itself.
func (r *PolicyRepo) insertActivation(ctx context.Context, tenantID, policyRegistryID string, enabled bool, activatedBy string) error {
	var tenantIDArg *string
	if tenantID != "" {
		tenantIDArg = &tenantID
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("policy_repo.insertActivation begin policy_registry_id=%s: %w", policyRegistryID, err)
	}
	defer tx.Rollback(ctx) // no-op once committed

	if _, err := tx.Exec(ctx, `
		UPDATE policy_activations
		SET    effective_to = now()
		WHERE  policy_registry_id = $1 AND effective_to IS NULL
	`, policyRegistryID); err != nil {
		return fmt.Errorf("policy_repo.insertActivation close-prior policy_registry_id=%s: %w", policyRegistryID, err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO policy_activations (tenant_id, policy_registry_id, enabled, activated_by)
		VALUES ($1, $2, $3, $4)
	`, tenantIDArg, policyRegistryID, enabled, activatedBy); err != nil {
		return fmt.Errorf("policy_repo.insertActivation policy_registry_id=%s: %w", policyRegistryID, err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("policy_repo.insertActivation commit policy_registry_id=%s: %w", policyRegistryID, err)
	}
	return nil
}

// latestDefinitionFor returns the tenant_id + policy_registry_id of the most
// recent policy_definitions row for policyID. Today Insert() only ever
// creates one version per policy_id (no re-versioning flow exists yet), so
// "latest" is simply "the one there is" — ORDER BY future-proofs this for
// whenever a real re-versioning flow is added.
//
// Corrective-action-report P0-05: joined against policy_registry (matched by
// policy_id, the table's actual PRIMARY KEY) with a tenant-matching predicate
// so this can never return a policy_definitions row belonging to a different
// tenant than the policy_registry row policyID actually identifies — the
// same class of fix as policyDefinitionCols above, applied here because this
// lookup builds the tenant/policy_registry_id pair used to write the next
// action's lineage.
func (r *PolicyRepo) latestDefinitionFor(ctx context.Context, policyID string) (tenantID, policyRegistryID string, err error) {
	var tenantIDPtr *string
	err = r.pool.QueryRow(ctx, `
		SELECT pd.tenant_id, pd.policy_registry_id
		FROM   policy_definitions pd
		JOIN   policy_registry pr
		       ON pr.policy_id = pd.policy_key
		      AND pr.tenant_id IS NOT DISTINCT FROM pd.tenant_id
		WHERE  pr.policy_id = $1
		ORDER BY pd.policy_version DESC, pd.created_at DESC
		LIMIT 1
	`, policyID).Scan(&tenantIDPtr, &policyRegistryID)
	if err != nil {
		return "", "", fmt.Errorf("policy_repo.latestDefinitionFor id=%s: %w", policyID, err)
	}
	if tenantIDPtr != nil {
		tenantID = *tenantIDPtr
	}
	return tenantID, policyRegistryID, nil
}
