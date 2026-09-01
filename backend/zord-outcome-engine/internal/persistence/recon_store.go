package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"zord-outcome-engine/internal/recon"

	"github.com/google/uuid"
)

var _ recon.Store = (*ReconSQLStore)(nil)

type ReconSQLStore struct {
	db *sql.DB
}

func NewReconSQLStore(db *sql.DB) *ReconSQLStore {
	return &ReconSQLStore{db: db}
}

func (s *ReconSQLStore) InsertUpload(ctx context.Context, up recon.BankUpload) (recon.BankUpload, error) {
	if up.ID == "" {
		up.ID = uuid.Must(uuid.NewV7()).String()
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO bank_statement_uploads (id, tenant_id, connector_id, account_id, filename, file_hash, row_count, status, last_error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		up.ID, up.TenantID, up.ConnectorID, up.AccountID, up.Filename, up.FileHash, up.RowCount, up.Status, nullIfEmpty(up.LastError),
	)
	return up, err
}

func (s *ReconSQLStore) InsertBankTxns(ctx context.Context, tenantID, connectorID, uploadID string, rows []recon.BankTxn) error {
	for _, r := range rows {
		id := uuid.Must(uuid.NewV7()).String()
		var vd any
		if !r.ValueDate.IsZero() {
			vd = r.ValueDate
		}
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO bank_transaction_observations (
				id, tenant_id, connector_id, account_id, bank_transaction_id, value_date, description,
				credit_minor, debit_minor, currency, utr, source, row_hash, upload_id
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'bank_csv',$12,$13)
			ON CONFLICT (tenant_id, account_id, row_hash) DO NOTHING`,
			id, tenantID, connectorID, r.AccountID, nullIfEmpty(r.BankTxnID), vd, r.Description,
			r.CreditMinor, r.DebitMinor, r.Currency, nullIfEmpty(r.UTR), r.RowHash, nullIfEmpty(uploadID),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *ReconSQLStore) ListBankTxns(ctx context.Context, tenantID, connectorID, accountID string) ([]recon.BankTxn, error) {
	q := `
		SELECT id::text, account_id, COALESCE(bank_transaction_id,''), COALESCE(utr,''), description,
		       credit_minor, debit_minor, currency, COALESCE(row_hash,''), value_date
		FROM bank_transaction_observations
		WHERE tenant_id=$1 AND connector_id=$2`
	args := []any{tenantID, connectorID}
	if accountID != "" {
		q += " AND account_id=$3"
		args = append(args, accountID)
	}
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recon.BankTxn
	for rows.Next() {
		var b recon.BankTxn
		var vd sql.NullTime
		if err := rows.Scan(&b.ID, &b.AccountID, &b.BankTxnID, &b.UTR, &b.Description, &b.CreditMinor, &b.DebitMinor, &b.Currency, &b.RowHash, &vd); err != nil {
			return nil, err
		}
		if vd.Valid {
			b.ValueDate = vd.Time
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *ReconSQLStore) ListPayments(ctx context.Context, tenantID, connectorID string) ([]recon.PaymentObs, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT payment_id, COALESCE(order_id,''), status, amount_minor, currency, captured,
		       source, payload_hash, fee_minor, tax_minor
		FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2`, tenantID, connectorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recon.PaymentObs
	for rows.Next() {
		var p recon.PaymentObs
		if err := rows.Scan(&p.PaymentID, &p.OrderID, &p.Status, &p.AmountMinor, &p.Currency, &p.Captured, &p.Source, &p.PayloadHash, &p.FeeMinor, &p.TaxMinor); err != nil {
			return nil, err
		}
		p.HasWebhook = true
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *ReconSQLStore) ListSettlementLines(ctx context.Context, tenantID, connectorID string) ([]recon.SettlementLine, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT settlement_id, entity_id, COALESCE(payment_id,''), line_type, amount_minor, debit_minor, credit_minor,
		       fee_minor, tax_minor, currency, COALESCE(settlement_utr,''), settled, settled_at, payload_hash
		FROM provider_settlement_line_observations
		WHERE tenant_id=$1 AND connector_id=$2`, tenantID, connectorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recon.SettlementLine
	for rows.Next() {
		var l recon.SettlementLine
		var settledAt sql.NullTime
		if err := rows.Scan(&l.SettlementID, &l.EntityID, &l.PaymentID, &l.LineType, &l.AmountMinor, &l.DebitMinor, &l.CreditMinor,
			&l.FeeMinor, &l.TaxMinor, &l.Currency, &l.UTR, &l.Settled, &settledAt, &l.PayloadHash); err != nil {
			return nil, err
		}
		if settledAt.Valid {
			l.SettledAt = settledAt.Time
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *ReconSQLStore) UpsertProof(ctx context.Context, sub recon.ProofSubject) error {
	id := uuid.Must(uuid.NewV7()).String()
	var bankObs any
	if sub.BankObservationID != "" {
		if _, err := uuid.Parse(sub.BankObservationID); err == nil {
			bankObs = sub.BankObservationID
		}
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO payment_proof_subjects (
			id, tenant_id, connector_id, payment_id, order_id, payment_state, provider_settlement_state,
			bank_credit_state, reconciliation_state, proof_state, settlement_id, bank_observation_id, expected_net_minor,
			bank_credit_minor, difference_minor, currency, missing_webhook, message, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
		ON CONFLICT (tenant_id, connector_id, payment_id) DO UPDATE SET
			order_id=EXCLUDED.order_id, payment_state=EXCLUDED.payment_state,
			provider_settlement_state=EXCLUDED.provider_settlement_state,
			bank_credit_state=EXCLUDED.bank_credit_state, reconciliation_state=EXCLUDED.reconciliation_state,
			proof_state=EXCLUDED.proof_state, settlement_id=EXCLUDED.settlement_id,
			bank_observation_id=EXCLUDED.bank_observation_id,
			expected_net_minor=EXCLUDED.expected_net_minor, bank_credit_minor=EXCLUDED.bank_credit_minor,
			difference_minor=EXCLUDED.difference_minor, currency=EXCLUDED.currency,
			missing_webhook=EXCLUDED.missing_webhook, message=EXCLUDED.message, updated_at=now()`,
		id, sub.TenantID, sub.ConnectorID, sub.PaymentID, nullIfEmpty(sub.OrderID), sub.PaymentState, sub.ProviderSettlementState,
		sub.BankCreditState, sub.ReconciliationState, sub.ProofState, nullIfEmpty(sub.SettlementID), bankObs, sub.ExpectedNetMinor,
		sub.BankCreditMinor, sub.DifferenceMinor, sub.Currency, sub.MissingWebhook, sub.Message,
	)
	return err
}

func (s *ReconSQLStore) InsertDecisions(ctx context.Context, tenantID, connectorID string, pairs []recon.MatchDecision) error {
	for _, p := range pairs {
		id := p.MatchID
		if id == "" {
			id = uuid.Must(uuid.NewV7()).String()
		}
		raw, _ := json.Marshal(p.ScoreBreakdown)
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO recon_match_decisions (
				id, tenant_id, connector_id, subject_type, subject_id, left_source, left_id, right_source, right_id,
				match_type, confidence, score_breakdown, ambiguous, decision_reason, rule_version, computed_at
			) VALUES ($1,$2,$3,'payment',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())`,
			id, tenantID, connectorID, p.SourceAID, p.LeftSource, p.SourceAID, p.RightSource, p.SourceBID,
			p.MatchType, p.Confidence, raw, p.Ambiguous, p.DecisionReason, recon.RuleVersion,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *ReconSQLStore) GetProof(ctx context.Context, tenantID, connectorID, paymentID string) (recon.ProofSubject, error) {
	var sub recon.ProofSubject
	err := s.db.QueryRowContext(ctx, `
		SELECT tenant_id::text, connector_id::text, payment_id, COALESCE(order_id,''), payment_state,
		       provider_settlement_state, bank_credit_state, reconciliation_state, proof_state,
		       COALESCE(settlement_id,''), expected_net_minor, bank_credit_minor, difference_minor,
		       currency, missing_webhook, message
		FROM payment_proof_subjects
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`,
		tenantID, connectorID, paymentID,
	).Scan(&sub.TenantID, &sub.ConnectorID, &sub.PaymentID, &sub.OrderID, &sub.PaymentState,
		&sub.ProviderSettlementState, &sub.BankCreditState, &sub.ReconciliationState, &sub.ProofState,
		&sub.SettlementID, &sub.ExpectedNetMinor, &sub.BankCreditMinor, &sub.DifferenceMinor,
		&sub.Currency, &sub.MissingWebhook, &sub.Message)
	if errors.Is(err, sql.ErrNoRows) {
		return recon.ProofSubject{}, recon.ErrNotFound
	}
	return sub, err
}

func (s *ReconSQLStore) ListProofs(ctx context.Context, tenantID, connectorID string) ([]recon.ProofSubject, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT tenant_id::text, connector_id::text, payment_id, COALESCE(order_id,''), payment_state,
		       provider_settlement_state, bank_credit_state, reconciliation_state, proof_state,
		       COALESCE(settlement_id,''), expected_net_minor, bank_credit_minor, difference_minor,
		       currency, missing_webhook, message
		FROM payment_proof_subjects WHERE tenant_id=$1 AND connector_id=$2`, tenantID, connectorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recon.ProofSubject
	for rows.Next() {
		var sub recon.ProofSubject
		if err := rows.Scan(&sub.TenantID, &sub.ConnectorID, &sub.PaymentID, &sub.OrderID, &sub.PaymentState,
			&sub.ProviderSettlementState, &sub.BankCreditState, &sub.ReconciliationState, &sub.ProofState,
			&sub.SettlementID, &sub.ExpectedNetMinor, &sub.BankCreditMinor, &sub.DifferenceMinor,
			&sub.Currency, &sub.MissingWebhook, &sub.Message); err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

func (s *ReconSQLStore) InsertLeaves(ctx context.Context, tenantID, connectorID string, leaves []recon.EvidenceLeaf) error {
	for _, l := range leaves {
		id := l.ID
		if id == "" {
			id = uuid.Must(uuid.NewV7()).String()
		}
		if l.ObservedAt.IsZero() {
			l.ObservedAt = time.Now().UTC()
		}
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO payment_evidence_leaves (
				id, tenant_id, connector_id, payment_id, source, source_record_id, raw_payload_hash, observed_at, provider_mode, trace_id
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'test',$9)
			ON CONFLICT (tenant_id, payment_id, source, raw_payload_hash) DO NOTHING`,
			id, tenantID, connectorID, l.PaymentID, l.Source, l.SourceRecordID, l.RawPayloadHash, l.ObservedAt, nullIfEmpty(l.TraceID),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *ReconSQLStore) ListLeaves(ctx context.Context, tenantID, connectorID, paymentID string) ([]recon.EvidenceLeaf, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id::text, payment_id, source, source_record_id, raw_payload_hash, observed_at, provider_mode, COALESCE(trace_id,'')
		FROM payment_evidence_leaves
		WHERE tenant_id=$1 AND connector_id=$2 AND payment_id=$3`, tenantID, connectorID, paymentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recon.EvidenceLeaf
	for rows.Next() {
		var l recon.EvidenceLeaf
		if err := rows.Scan(&l.ID, &l.PaymentID, &l.Source, &l.SourceRecordID, &l.RawPayloadHash, &l.ObservedAt, &l.ProviderMode, &l.TraceID); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}
