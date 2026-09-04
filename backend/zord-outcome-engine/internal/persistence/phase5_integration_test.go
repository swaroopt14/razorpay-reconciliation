//go:build integration

package persistence_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"zord-outcome-engine/internal/bankingest"
	"zord-outcome-engine/internal/imports"
	"zord-outcome-engine/internal/persistence"
	"zord-outcome-engine/internal/recon"

	"github.com/google/uuid"
)

func TestPhase5SchemaPresent(t *testing.T) {
	db := testDB(t)
	for _, col := range []struct{ table, column string }{
		{"provider_settlement_line_observations", "adjustment_minor"},
		{"provider_settlement_line_observations", "payment_link"},
		{"bank_transaction_observations", "credit_debit"},
		{"bank_transaction_observations", "utr_raw"},
		{"bank_transaction_observations", "observation_identity_hash"},
	} {
		var ok bool
		if err := db.QueryRow(`
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name=$1 AND column_name=$2
			)`, col.table, col.column).Scan(&ok); err != nil || !ok {
			t.Fatalf("missing %s.%s: %v", col.table, col.column, err)
		}
	}
	var name string
	if err := db.QueryRow(`SELECT to_regclass($1)`, "settlement_bank_match_decisions").Scan(&name); err != nil || name == "" {
		t.Fatalf("missing settlement_bank_match_decisions: %v", err)
	}
}

func TestPhase5SettlementBankChain(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	tenant := uuid.Must(uuid.NewV7())
	connector := uuid.Must(uuid.NewV7())
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	payID := "pay_123_" + suffix
	lineID := uuid.Must(uuid.NewV7()).String()
	bankID := uuid.Must(uuid.NewV7()).String()

	if _, err := db.ExecContext(ctx, `
		INSERT INTO canonical_payments (
			id, tenant_id, connector_id, provider, payment_id, amount_minor, currency,
			provider_status, canonical_status, captured
		) VALUES ($1,$2,$3,'razorpay',$4,10000,'INR','captured','captured',true)`,
		uuid.Must(uuid.NewV7()), tenant, connector, payID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO provider_settlement_line_observations (
			id, tenant_id, connector_id, provider, provider_mode, settlement_id, entity_id, line_type,
			payment_id, amount_minor, credit_minor, fee_minor, currency, settlement_utr, settled, payload_hash, source, payment_link
		) VALUES ($1,$2,$3,'razorpay','test',$4,$5,'payment',$5,10000,9728,272,'INR','UTR123',true,$6,'settlement_file','linked')`,
		lineID, tenant, connector, "setl_"+suffix, payID, "sha256:setl:"+suffix,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO bank_transaction_observations (
			id, tenant_id, connector_id, account_id, description, credit_minor, debit_minor, currency, utr, credit_debit, source, row_hash
		) VALUES ($1,$2,$3,'acc-1','RAZORPAY UTR123',9728,0,'INR','UTR123','CREDIT','bank_csv',$4)`,
		bankID, tenant, connector, "row:"+suffix,
	); err != nil {
		t.Fatal(err)
	}

	store := persistence.NewReconSQLStore(db)
	svc := bankingest.NewService(imports.NewService(imports.NewMemoryStore()), store)
	decisions, err := svc.Match(ctx, tenant.String(), connector.String(), "acc-1")
	if err != nil {
		t.Fatal(err)
	}
	var exact bool
	for _, d := range decisions {
		if d.State == recon.BankMatchExact && d.BankObservationID == bankID {
			exact = true
		}
	}
	if !exact {
		t.Fatalf("expected EXACT_MATCH %+v", decisions)
	}
	proofs, err := store.CountProofs(ctx, tenant.String(), connector.String())
	if err != nil {
		t.Fatal(err)
	}
	if proofs != 0 {
		t.Fatalf("must not write payment_proof_subjects, got %d", proofs)
	}

	var reconType string
	_ = db.QueryRowContext(ctx, `
		SELECT event_type FROM outcome_outbox
		WHERE tenant_id=$1 AND event_type=$2
		ORDER BY created_at DESC LIMIT 1`, tenant, "bank.match.completed.v1").Scan(&reconType)
	if reconType != "bank.match.completed.v1" {
		t.Fatalf("outbox event=%q", reconType)
	}
	var decisionEvent string
	_ = db.QueryRowContext(ctx, `
		SELECT event_type FROM outcome_outbox
		WHERE tenant_id=$1 AND event_type='reconciliation.decision.v1' LIMIT 1`, tenant).Scan(&decisionEvent)
	if decisionEvent != "" {
		t.Fatal("must not emit reconciliation.decision.v1")
	}
}

func TestPhase5Negatives(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	tenant := uuid.Must(uuid.NewV7())
	connector := uuid.Must(uuid.NewV7())
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	if _, err := db.ExecContext(ctx, `
		INSERT INTO provider_settlement_line_observations (
			id, tenant_id, connector_id, provider, provider_mode, settlement_id, entity_id, line_type,
			amount_minor, credit_minor, currency, settlement_utr, settled, payload_hash, source
		) VALUES ($1,$2,$3,'razorpay','test','setl_u','ent_u','payment',10000,9728,'INR','MISSINGUTR',true,$4,'settlement_file')`,
		uuid.Must(uuid.NewV7()), tenant, connector, "sha256:u:"+suffix,
	); err != nil {
		t.Fatal(err)
	}
	orphanID := uuid.Must(uuid.NewV7()).String()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO bank_transaction_observations (
			id, tenant_id, connector_id, account_id, description, credit_minor, debit_minor, currency, utr, credit_debit, source, row_hash
		) VALUES ($1,$2,$3,'acc-1','ORPHAN',9500,0,'INR','OTHERUTR','CREDIT','bank_csv',$4)`,
		orphanID, tenant, connector, "orphan:"+suffix,
	); err != nil {
		t.Fatal(err)
	}
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	if _, err := db.ExecContext(ctx, `
		INSERT INTO provider_settlement_line_observations (
			id, tenant_id, connector_id, provider, provider_mode, settlement_id, entity_id, line_type,
			amount_minor, credit_minor, currency, settled, settled_at, payload_hash, source
		) VALUES ($1,$2,$3,'razorpay','test','setl_a','ent_a','payment',1000,1000,'INR',true,$4,$5,'settlement_file')`,
		uuid.Must(uuid.NewV7()), tenant, connector, from, "sha256:a:"+suffix,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO bank_transaction_observations (
			id, tenant_id, connector_id, account_id, description, credit_minor, debit_minor, currency, credit_debit, source, row_hash, value_date
		) VALUES
		($1,$3,$4,'acc-1','A',1000,0,'INR','CREDIT','bank_csv',$5,$7),
		($2,$3,$4,'acc-1','B',1000,0,'INR','CREDIT','bank_csv',$6,$7)`,
		uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()), tenant, connector, "amb1:"+suffix, "amb2:"+suffix, from,
	); err != nil {
		t.Fatal(err)
	}

	store := persistence.NewReconSQLStore(db)
	svc := bankingest.NewService(imports.NewService(imports.NewMemoryStore()), store)
	got, err := svc.Match(ctx, tenant.String(), connector.String(), "acc-1")
	if err != nil {
		t.Fatal(err)
	}
	var unresolved, orphan, ambiguous bool
	for _, d := range got {
		switch d.State {
		case recon.BankMatchUnresolved:
			unresolved = true
		case recon.BankMatchOrphanBank:
			orphan = true
		case recon.BankMatchAmbiguous:
			ambiguous = true
		}
	}
	if !unresolved || !orphan || !ambiguous {
		t.Fatalf("unresolved=%v orphan=%v ambiguous=%v %+v", unresolved, orphan, ambiguous, got)
	}
}
