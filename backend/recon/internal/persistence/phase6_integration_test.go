//go:build integration

package persistence_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"zord-outcome-engine/internal/persistence"
	"zord-outcome-engine/internal/recon"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

func TestPhase6SchemaPresent(t *testing.T) {
	db := testDB(t)
	for _, table := range []string{
		"reconciliation_runs", "reconciliation_results", "reconciliation_exceptions", "investigation_records",
		"canonical_payouts", "provider_payout_observation_events",
	} {
		var name string
		if err := db.QueryRow(`SELECT to_regclass($1)`, table).Scan(&name); err != nil || name == "" {
			t.Fatalf("missing %s: %v", table, err)
		}
	}
}

func TestPhase6FinancialRunPAY001AndPAY002(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	tenant := uuid.Must(uuid.NewV7())
	connector := uuid.Must(uuid.NewV7())
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	payOK := "pay_p6_ok_" + suffix
	payFail := "pay_p6_fail_" + suffix
	lineID := uuid.Must(uuid.NewV7()).String()
	bankID := uuid.Must(uuid.NewV7()).String()
	decID := uuid.Must(uuid.NewV7()).String()

	if _, err := db.ExecContext(ctx, `
		INSERT INTO canonical_payments (
			id, tenant_id, connector_id, provider, payment_id, amount_minor, currency,
			provider_status, canonical_status, captured
		) VALUES
		($1,$3,$4,'razorpay',$5,10000,'INR','captured','captured',true),
		($2,$3,$4,'razorpay',$6,5000,'INR','failed','failed',false)`,
		uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()), tenant, connector, payOK, payFail,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO provider_settlement_line_observations (
			id, tenant_id, connector_id, provider, provider_mode, settlement_id, entity_id, line_type,
			payment_id, amount_minor, credit_minor, fee_minor, currency, settlement_utr, settled, payload_hash, source, payment_link
		) VALUES ($1,$2,$3,'razorpay','test',$4,$5,'payment',$5,10000,9728,272,'INR','UTR6',true,$6,'settlement_file','linked')`,
		lineID, tenant, connector, "setl_p6_"+suffix, payOK, "sha256:p6:"+suffix,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO bank_transaction_observations (
			id, tenant_id, connector_id, account_id, description, credit_minor, debit_minor, currency, utr, credit_debit, source, row_hash
		) VALUES ($1,$2,$3,'acc-1','RAZORPAY UTR6',9728,0,'INR','UTR6','CREDIT','bank_csv',$4)`,
		bankID, tenant, connector, "row:p6:"+suffix,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO settlement_bank_match_decisions (
			id, tenant_id, connector_id, settlement_line_id, bank_observation_id, state, confidence, rule, candidates, evidence
		) VALUES ($1,$2,$3,$4,$5,'EXACT_MATCH',0.99,'exact_utr_and_amount','["`+bankID+`"]','{"bank_credit_minor":9728}')`,
		decID, tenant, connector, lineID, bankID,
	); err != nil {
		t.Fatal(err)
	}

	store := persistence.NewReconSQLStore(db)
	svc := recon.NewFinancialService(store)
	run, results, err := svc.Run(ctx, recon.FinancialRunRequest{
		TenantID: tenant.String(), ConnectorID: connector.String(), AccountID: "acc-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != "completed" {
		t.Fatalf("run=%s", run.Status)
	}

	var matchedOK, matchedFail, bankProvenFail bool
	for _, r := range results {
		if r.EntityID == payOK && r.Result == recon.ResultMatched && r.BankCreditProven {
			matchedOK = true
		}
		if r.EntityID == payFail && r.Result == recon.ResultMatched {
			matchedFail = true
			bankProvenFail = r.BankCreditProven
		}
	}
	if !matchedOK || !matchedFail {
		t.Fatalf("matched ok=%v fail=%v %+v", matchedOK, matchedFail, results)
	}
	if bankProvenFail {
		t.Fatal("failed MATCHED must not be bank_credited")
	}

	var proofs int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM payment_proof_subjects WHERE tenant_id=$1`, tenant).Scan(&proofs); err != nil {
		t.Fatal(err)
	}
	if proofs != 0 {
		t.Fatalf("must not write payment_proof_subjects: %d", proofs)
	}

	var n int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM outcome_outbox WHERE tenant_id=$1 AND event_type=$2`,
		tenant, models.EventTypeReconDecisionV1).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n == 0 {
		t.Fatal("expected reconciliation.decision.v1")
	}
}

func TestPhase6OrphanJoin(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	tenant := uuid.Must(uuid.NewV7())
	connector := uuid.Must(uuid.NewV7())
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	bankID := uuid.Must(uuid.NewV7()).String()

	if _, err := db.ExecContext(ctx, `
		INSERT INTO bank_transaction_observations (
			id, tenant_id, connector_id, account_id, description, credit_minor, debit_minor, currency, utr, credit_debit, source, row_hash
		) VALUES ($1,$2,$3,'acc-1','ORPHAN P6',8800,0,'INR','NOMATCH','CREDIT','bank_csv',$4)`,
		bankID, tenant, connector, "orphan6:"+suffix,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO settlement_bank_match_decisions (
			id, tenant_id, connector_id, bank_observation_id, state, confidence, rule
		) VALUES ($1,$2,$3,$4,'ORPHAN_BANK',0.9,'orphan_credit')`,
		uuid.Must(uuid.NewV7()), tenant, connector, bankID,
	); err != nil {
		t.Fatal(err)
	}

	store := persistence.NewReconSQLStore(db)
	svc := recon.NewFinancialService(store)
	_, results, err := svc.Run(ctx, recon.FinancialRunRequest{
		TenantID: tenant.String(), ConnectorID: connector.String(), AccountID: "acc-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	var orphan bool
	for _, r := range results {
		if r.Result == recon.ResultOrphan && r.Exception != nil && r.ObservedAmount == 8800 {
			orphan = true
		}
	}
	if !orphan {
		t.Fatalf("expected orphan exception %+v", results)
	}
}

func TestPhase6BPayoutPAYO001AndPAYO002(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	tenant := uuid.Must(uuid.NewV7())
	connector := uuid.Must(uuid.NewV7())
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	poutOK := "pout_p6b_ok_" + suffix
	poutFail := "pout_p6b_fail_" + suffix
	bankID := uuid.Must(uuid.NewV7()).String()

	if _, err := db.ExecContext(ctx, `
		INSERT INTO canonical_payouts (
			id, tenant_id, connector_id, provider, payout_id, amount_minor, currency, provider_status, utr, mode
		) VALUES
		($1,$3,$4,'razorpay',$5,10000,'INR','processed','UTRPO6','IMPS'),
		($2,$3,$4,'razorpay',$6,5000,'INR','failed','','IMPS')`,
		uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7()), tenant, connector, poutOK, poutFail,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO bank_transaction_observations (
			id, tenant_id, connector_id, account_id, description, credit_minor, debit_minor, currency, utr, credit_debit, source, row_hash
		) VALUES ($1,$2,$3,'acc-1','PAYOUT UTRPO6',0,10000,'INR','UTRPO6','DEBIT','bank_csv',$4)`,
		bankID, tenant, connector, "row:p6b:"+suffix,
	); err != nil {
		t.Fatal(err)
	}

	store := persistence.NewReconSQLStore(db)
	svc := recon.NewFinancialService(store)
	_, results, err := svc.Run(ctx, recon.FinancialRunRequest{
		TenantID: tenant.String(), ConnectorID: connector.String(), AccountID: "acc-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	var matchedOK, matchedFail bool
	for _, r := range results {
		if r.EntityID == poutOK && r.EntityType == recon.EntityPayout && r.Result == recon.ResultMatched {
			matchedOK = true
		}
		if r.EntityID == poutFail && r.EntityType == recon.EntityPayout && r.Result == recon.ResultMatched && r.Exception == nil {
			matchedFail = true
			if r.Status != "failed" {
				t.Fatalf("failed payout status=%s", r.Status)
			}
		}
	}
	if !matchedOK || !matchedFail {
		t.Fatalf("matched ok=%v fail=%v %+v", matchedOK, matchedFail, results)
	}
}
