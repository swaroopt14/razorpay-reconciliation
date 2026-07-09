package persistence

import (
	"context"
	"testing"

	"zord-intent-engine/config"
	"zord-intent-engine/db"

	"github.com/google/uuid"
)

// TestIntentPolicyDecisions_InsertAndUniqueConstraint is a Phase 4 regression
// test: a policy decision must attach to a real intent_id, and re-evaluating
// the same intent under the same policy_source/version must not duplicate
// the row (ON CONFLICT DO NOTHING on the ledger).
func TestIntentPolicyDecisions_InsertAndUniqueConstraint(t *testing.T) {
	skipIfNoDB(t)
	config.InitDB()
	defer db.DB.Close()

	ctx := context.Background()
	tenantID := uuid.New().String()
	intentID := uuid.New().String()

	insertMinimalPaymentIntent(t, ctx, tenantID, intentID)
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM payment_intents WHERE intent_id = $1", intentID)
	}()
	defer func() {
		_, _ = db.DB.ExecContext(ctx, "DELETE FROM intent_policy_decisions WHERE intent_id = $1", intentID)
	}()

	insert := func() error {
		_, err := db.DB.ExecContext(ctx, `
			INSERT INTO intent_policy_decisions (
				tenant_id, intent_id, policy_source, policy_version, policy_hash,
				policy_result, reason_codes_json, input_facts_hash
			) VALUES ($1, $2, 'zord-intent-engine-builtin', 'governance_policy_v1', 'hash123', 'ALLOW', '[]', 'facts123')
			ON CONFLICT (tenant_id, intent_id, policy_source, policy_version) DO NOTHING
		`, tenantID, intentID)
		return err
	}

	if err := insert(); err != nil {
		t.Fatalf("failed to insert intent_policy_decisions: %v", err)
	}
	if err := insert(); err != nil {
		t.Fatalf("expected re-insert under ON CONFLICT to succeed as a no-op, got error: %v", err)
	}

	var count int
	if err := db.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM intent_policy_decisions WHERE intent_id = $1", intentID).Scan(&count); err != nil {
		t.Fatalf("failed to count intent_policy_decisions: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 policy decision row after duplicate insert, got %d", count)
	}

	// Confirm the FK is enforced: a decision for a non-existent intent must fail.
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO intent_policy_decisions (
			tenant_id, intent_id, policy_source, policy_version, policy_hash,
			policy_result, reason_codes_json, input_facts_hash
		) VALUES ($1, $2, 'zord-intent-engine-builtin', 'governance_policy_v1', 'hash123', 'ALLOW', '[]', 'facts123')
	`, tenantID, uuid.New().String())
	if err == nil {
		t.Fatal("expected FK violation when intent_id does not exist in payment_intents")
	}
}
