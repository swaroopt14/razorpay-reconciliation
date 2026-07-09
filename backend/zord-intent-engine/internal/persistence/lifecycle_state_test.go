package persistence

import (
	"context"
	"testing"

	"zord-intent-engine/config"
	"zord-intent-engine/db"

	"github.com/google/uuid"
)

// TestIntentLifecycleState_DefaultAndCheckConstraint is a Phase 2 regression test:
// intent_lifecycle_state must default to 'RECEIVED' when omitted, and the DB must
// reject any value outside the documented state vocabulary.
func TestIntentLifecycleState_DefaultAndCheckConstraint(t *testing.T) {
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

	var state string
	if err := db.DB.QueryRowContext(ctx,
		"SELECT intent_lifecycle_state FROM payment_intents WHERE intent_id = $1", intentID,
	).Scan(&state); err != nil {
		t.Fatalf("failed to read intent_lifecycle_state: %v", err)
	}
	if state != "RECEIVED" {
		t.Fatalf("expected default intent_lifecycle_state to be RECEIVED, got %q", state)
	}

	_, err := db.DB.ExecContext(ctx,
		"UPDATE payment_intents SET intent_lifecycle_state = 'NOT_A_REAL_STATE' WHERE intent_id = $1", intentID,
	)
	if err == nil {
		t.Fatal("expected CHECK constraint to reject an unrecognized intent_lifecycle_state value, but UPDATE succeeded")
	}

	_, err = db.DB.ExecContext(ctx, "INSERT INTO dlq_items (dlq_id, tenant_id, envelope_id, stage, reason_code, replayable, dlq_status) VALUES ($1, $2, $3, 'X', 'Y', false, 'NOT_A_REAL_STATUS')",
		uuid.New().String(), tenantID, uuid.New().String())
	if err == nil {
		t.Fatal("expected CHECK constraint to reject an unrecognized dlq_status value, but INSERT succeeded")
	}
}
