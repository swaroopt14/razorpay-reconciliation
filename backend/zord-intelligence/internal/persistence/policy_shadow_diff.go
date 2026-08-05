package persistence

// policy_shadow_diff.go — Phase 5 (refactor): extends
// docs/service_7_refactoring_clarifications.md §14's shadow-diff job to the
// policy dual-write introduced by this phase (policy_registry vs
// policy_definitions/policy_activations). REFACTOR_IMPLEMENTATION_GUIDE.md
// §I flagged this comparison target as blocked on "those tables [being]
// refactored" — this is that refactor. "Phase 5 (refactor)" = this
// refactor's phase 5, unrelated to this codebase's other "PHASE 5" naming.
//
// Compares, per policy_id: policy_registry's live fields (dsl, scope_type,
// trigger_type, trigger_value, enabled) against the latest
// policy_definitions row (dsl/scope_type/trigger_type/trigger_value) and its
// latest policy_activations row (enabled). Any mismatch is recorded into
// refactor_shadow_diffs — purely observational, never blocks or mutates data,
// same idiom as batch_shadow_diff.go.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// policyShadowFields holds the fields compared between policy_registry (old)
// and policy_definitions+policy_activations (new).
type policyShadowFields struct {
	DSL          string
	ScopeType    string
	TriggerType  string
	TriggerValue string
	Enabled      bool
}

// ComparePolicyOldVsNew compares one policy_registry row against its
// dual-written policy_definitions/policy_activations rows. Returns
// (true, nil) if they match or if there's nothing to compare yet — not a
// mismatch, matching the "nothing to compare yet" convention in
// batch_shadow_diff.CompareBatchOldVsNew.
func (r *PolicyRepo) ComparePolicyOldVsNew(ctx context.Context, policyID string) (matched bool, err error) {
	old, err := r.GetByID(ctx, policyID)
	if err != nil {
		return false, fmt.Errorf("policy_shadow_diff.ComparePolicyOldVsNew GetByID id=%s: %w", policyID, err)
	}
	if old == nil {
		return true, nil
	}
	if old.PolicyRegistryID == "" {
		// Dual-write hasn't landed for this policy yet (should not happen
		// post-backfill/post-Insert) — not comparable, not a mismatch.
		return true, nil
	}

	oldFields := policyShadowFields{
		DSL: old.DSL, ScopeType: old.ScopeType, TriggerType: old.TriggerType,
		TriggerValue: old.TriggerValue, Enabled: old.Enabled,
	}

	var newFields policyShadowFields
	row := r.pool.QueryRow(ctx, `
		SELECT pd.dsl, pd.scope_type, pd.trigger_type, pd.trigger_value,
		       COALESCE((SELECT pa.enabled FROM policy_activations pa
		                 WHERE pa.policy_registry_id = pd.policy_registry_id
		                 ORDER BY pa.created_at DESC LIMIT 1), false)
		FROM policy_definitions pd
		WHERE pd.policy_registry_id = $1
	`, old.PolicyRegistryID)
	if err := row.Scan(&newFields.DSL, &newFields.ScopeType, &newFields.TriggerType, &newFields.TriggerValue, &newFields.Enabled); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return true, nil
		}
		return false, fmt.Errorf("policy_shadow_diff.ComparePolicyOldVsNew scan id=%s: %w", policyID, err)
	}

	if oldFields == newFields {
		return true, nil
	}

	oldJSON, _ := json.Marshal(oldFields)
	newJSON, _ := json.Marshal(newFields)
	oldHash := sha256.Sum256(oldJSON)
	newHash := sha256.Sum256(newJSON)
	diffJSON, _ := json.Marshal(map[string]any{"old": oldFields, "new": newFields})

	tenantID := old.TenantID
	if tenantID == "" {
		// refactor_shadow_diffs.tenant_id is NOT NULL; global policies (no
		// tenant_id) still need a row to compare against.
		tenantID = "__global__"
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO refactor_shadow_diffs
			(tenant_id, scope_type, scope_ref, diff_family, old_payload_hash, new_payload_hash, diff_json, severity)
		VALUES ($1, 'TENANT', $2, 'policy_registry', $3, $4, $5::jsonb, 'WARNING')
	`, tenantID, policyID, hex.EncodeToString(oldHash[:]), hex.EncodeToString(newHash[:]), diffJSON)
	if err != nil {
		return false, fmt.Errorf("policy_shadow_diff.ComparePolicyOldVsNew insert diff id=%s: %w", policyID, err)
	}
	return false, nil
}

// ListAllPolicyIDs returns every policy_id in policy_registry — the
// candidate set the shadow-diff worker iterates.
func (r *PolicyRepo) ListAllPolicyIDs(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT policy_id FROM policy_registry`)
	if err != nil {
		return nil, fmt.Errorf("policy_shadow_diff.ListAllPolicyIDs: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("policy_shadow_diff.ListAllPolicyIDs scan: %w", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
