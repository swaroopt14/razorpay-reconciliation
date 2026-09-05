package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"zord-outcome-engine/internal/recon"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
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
				credit_minor, debit_minor, currency, utr, utr_raw, credit_debit, source, row_hash, upload_id
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'bank_csv',$14,$15)
			ON CONFLICT (tenant_id, account_id, row_hash) DO NOTHING`,
			id, tenantID, connectorID, r.AccountID, nullIfEmpty(r.BankTxnID), vd, r.Description,
			r.CreditMinor, r.DebitMinor, r.Currency, nullIfEmpty(r.UTR), nullIfEmpty(r.UTRRaw),
			nullIfEmpty(creditDebitOf(r)), r.RowHash, nullIfEmpty(uploadID),
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *ReconSQLStore) ListBankTxns(ctx context.Context, tenantID, connectorID, accountID string) ([]recon.BankTxn, error) {
	q := `
		SELECT id::text, account_id, COALESCE(bank_transaction_id,''), COALESCE(utr,''), COALESCE(utr_raw,''), description,
		       credit_minor, debit_minor, COALESCE(credit_debit,''), currency, COALESCE(row_hash,''), value_date
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
		if err := rows.Scan(&b.ID, &b.AccountID, &b.BankTxnID, &b.UTR, &b.UTRRaw, &b.Description, &b.CreditMinor, &b.DebitMinor, &b.CreditDebit, &b.Currency, &b.RowHash, &vd); err != nil {
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
		       source, payload_hash, fee_minor, tax_minor,
		       COALESCE(webhook_missing, false), COALESCE(sources, '{}')
		FROM provider_payment_observations
		WHERE tenant_id=$1 AND connector_id=$2`, tenantID, connectorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recon.PaymentObs
	for rows.Next() {
		var p recon.PaymentObs
		var sources pq.StringArray
		var webhookMissing bool
		if err := rows.Scan(&p.PaymentID, &p.OrderID, &p.Status, &p.AmountMinor, &p.Currency, &p.Captured, &p.Source, &p.PayloadHash, &p.FeeMinor, &p.TaxMinor, &webhookMissing, &sources); err != nil {
			return nil, err
		}
		p.Source = normalizePaymentSource(p.Source)
		p.HasWebhook = p.Source == "webhook" || sourceContains(sources, "webhook")
		if webhookMissing && !p.HasWebhook {
			p.HasWebhook = false
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func normalizePaymentSource(source string) string {
	switch source {
	case "razorpay_api", "API_BACKFILL":
		return "api_backfill"
	case "WEBHOOK":
		return "webhook"
	default:
		return source
	}
}

func sourceContains(sources []string, want string) bool {
	for _, s := range sources {
		if normalizePaymentSource(s) == want {
			return true
		}
	}
	return false
}

func (s *ReconSQLStore) ListSettlementLines(ctx context.Context, tenantID, connectorID string) ([]recon.SettlementLine, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id::text, settlement_id, entity_id, COALESCE(payment_id,''), line_type, amount_minor, debit_minor, credit_minor,
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
		if err := rows.Scan(&l.ID, &l.SettlementID, &l.EntityID, &l.PaymentID, &l.LineType, &l.AmountMinor, &l.DebitMinor, &l.CreditMinor,
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

func creditDebitOf(r recon.BankTxn) string {
	if r.CreditDebit != "" {
		return r.CreditDebit
	}
	if r.CreditMinor > 0 && r.DebitMinor == 0 {
		return "CREDIT"
	}
	if r.DebitMinor > 0 && r.CreditMinor == 0 {
		return "DEBIT"
	}
	if r.CreditMinor > 0 {
		return "CREDIT"
	}
	if r.DebitMinor > 0 {
		return "DEBIT"
	}
	return ""
}

func (s *ReconSQLStore) InsertSettlementBankDecisions(ctx context.Context, tenantID, connectorID string, decisions []recon.SettlementBankDecision) error {
	now := time.Now().UTC()
	for _, d := range decisions {
		id := d.ID
		if id == "" {
			id = uuid.Must(uuid.NewV7()).String()
		}
		cands, _ := json.Marshal(d.Candidates)
		if d.Candidates == nil {
			cands = []byte("[]")
		}
		ev, _ := json.Marshal(d.Evidence)
		if d.Evidence == nil {
			ev = []byte("{}")
		}
		decided := d.DecidedAt
		if decided.IsZero() {
			decided = now
		}
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO settlement_bank_match_decisions (
				id, tenant_id, connector_id, settlement_line_id, bank_observation_id,
				state, confidence, rule, candidates, evidence, decided_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			id, tenantID, connectorID, nullIfEmpty(d.SettlementLineID), nullIfEmpty(d.BankObservationID),
			d.State, d.Confidence, d.Rule, cands, ev, decided,
		); err != nil {
			return err
		}
	}
	return nil
}

func (s *ReconSQLStore) InsertMatchOutbox(ctx context.Context, row models.OutboxRow) error {
	if row.EventID == uuid.Nil {
		row.EventID = uuid.Must(uuid.NewV7())
	}
	if row.CreatedAt.IsZero() {
		row.CreatedAt = time.Now().UTC()
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO outcome_outbox (
			event_id, tenant_id, trace_id, aggregate_type, aggregate_id,
			event_type, schema_version, payload, status, retry_count, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',0,$9)`,
		row.EventID, row.TenantID, row.TraceID, row.AggregateType, row.AggregateID,
		row.EventType, models.SchemaVersionV1, row.Payload, row.CreatedAt,
	)
	return err
}

func (s *ReconSQLStore) CountProofs(ctx context.Context, tenantID, connectorID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM payment_proof_subjects WHERE tenant_id=$1 AND connector_id=$2`,
		tenantID, connectorID,
	).Scan(&n)
	return n, err
}
