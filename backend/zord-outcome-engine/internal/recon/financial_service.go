package recon

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

type FinancialStore interface {
	ListCanonicalPayments(ctx context.Context, tenantID, connectorID string) ([]PaymentFact, error)
	GetCanonicalPayment(ctx context.Context, tenantID, connectorID, paymentID string) (PaymentFact, bool, error)
	ListObservationEvents(ctx context.Context, tenantID, connectorID, paymentID string) ([]ObservationFact, error)
	ListCanonicalPayouts(ctx context.Context, tenantID, connectorID string) ([]PayoutFact, error)
	GetCanonicalPayoutFact(ctx context.Context, tenantID, connectorID, payoutID string) (PayoutFact, bool, error)
	ListPayoutObservationFacts(ctx context.Context, tenantID, connectorID, payoutID string) ([]ObservationFact, error)
	ListSettlementLines(ctx context.Context, tenantID, connectorID string) ([]SettlementLine, error)
	ListBankTxns(ctx context.Context, tenantID, connectorID, accountID string) ([]BankTxn, error)
	ListSettlementBankDecisions(ctx context.Context, tenantID, connectorID string) ([]SettlementBankDecision, error)
	InsertReconciliationRun(ctx context.Context, run ReconciliationRun) (ReconciliationRun, error)
	CompleteReconciliationRun(ctx context.Context, run ReconciliationRun) error
	GetReconciliationRun(ctx context.Context, tenantID, runID string) (ReconciliationRun, error)
	UpsertReconciliationResult(ctx context.Context, tenantID, connectorID, runID string, r FinancialResult) (FinancialResult, error)
	GetReconciliationResult(ctx context.Context, tenantID, connectorID, entityType, entityID string) (FinancialResult, bool, error)
	InsertReconciliationException(ctx context.Context, tenantID, connectorID, runID string, ex ReconciliationException) (ReconciliationException, error)
	ListReconciliationExceptions(ctx context.Context, tenantID, connectorID string) ([]ReconciliationException, error)
	GetReconciliationException(ctx context.Context, tenantID, connectorID, id string) (ReconciliationException, bool, error)
	InsertInvestigation(ctx context.Context, rec InvestigationRecord) (InvestigationRecord, error)
	GetInvestigation(ctx context.Context, tenantID, connectorID, id string) (InvestigationRecord, bool, error)
	InsertMatchOutbox(ctx context.Context, row models.OutboxRow) error
}

type FinancialService struct {
	Store FinancialStore
	now   func() time.Time
}

func NewFinancialService(store FinancialStore) *FinancialService {
	return &FinancialService{Store: store, now: func() time.Time { return time.Now().UTC() }}
}

type FinancialRunRequest struct {
	TenantID    string
	ConnectorID string
	AccountID   string
}

func (s *FinancialService) Run(ctx context.Context, req FinancialRunRequest) (ReconciliationRun, []FinancialResult, error) {
	now := s.now()
	run, err := s.Store.InsertReconciliationRun(ctx, ReconciliationRun{
		TenantID:    req.TenantID,
		ConnectorID: req.ConnectorID,
		AccountID:   req.AccountID,
		Status:      "running",
		Counts:      map[string]int{},
		CreatedAt:   now,
	})
	if err != nil {
		return ReconciliationRun{}, nil, err
	}

	pays, err := s.Store.ListCanonicalPayments(ctx, req.TenantID, req.ConnectorID)
	if err != nil {
		return run, nil, err
	}
	lines, err := s.Store.ListSettlementLines(ctx, req.TenantID, req.ConnectorID)
	if err != nil {
		return run, nil, err
	}
	banks, err := s.Store.ListBankTxns(ctx, req.TenantID, req.ConnectorID, req.AccountID)
	if err != nil {
		return run, nil, err
	}
	decisions, err := s.Store.ListSettlementBankDecisions(ctx, req.TenantID, req.ConnectorID)
	if err != nil {
		return run, nil, err
	}

	linesByPay := indexSettlementByPayment(lines)
	lineByID := map[string]SettlementLine{}
	for _, l := range lines {
		if id := lineID(l); id != "" {
			lineByID[id] = l
		}
	}
	decisionsByLine := map[string][]SettlementBankDecision{}
	bankByID := map[string]BankTxn{}
	for _, b := range banks {
		bankByID[b.ID] = b
	}
	for _, d := range decisions {
		if d.SettlementLineID != "" {
			decisionsByLine[d.SettlementLineID] = append(decisionsByLine[d.SettlementLineID], d)
		}
	}

	results := make([]FinancialResult, 0, len(pays)+4)
	usedBanks := map[string]struct{}{}

	for _, pay := range pays {
		events, err := s.Store.ListObservationEvents(ctx, req.TenantID, req.ConnectorID, pay.PaymentID)
		if err != nil {
			return run, nil, err
		}
		payLines := linesByPay[pay.PaymentID]
		var payDecisions []SettlementBankDecision
		for _, l := range payLines {
			payDecisions = append(payDecisions, decisionsByLine[lineID(l)]...)
		}
		related := relatedBanks(pay, events, banks, payDecisions)
		fr := ReconcilePayment(FinancialInput{
			Payment:    pay,
			Events:     events,
			Lines:      payLines,
			Decisions:  payDecisions,
			Banks:      related,
			Now:        now,
			StuckAfter: DefaultStuckAfter,
		})
		markUsedBanks(usedBanks, fr)
		results = append(results, fr)
	}

	payouts, err := s.Store.ListCanonicalPayouts(ctx, req.TenantID, req.ConnectorID)
	if err != nil {
		return run, nil, err
	}
	for _, po := range payouts {
		events, err := s.Store.ListPayoutObservationFacts(ctx, req.TenantID, req.ConnectorID, po.PayoutID)
		if err != nil {
			return run, nil, err
		}
		related := relatedPayoutBanks(po, events, banks)
		fr := ReconcilePayout(PayoutInput{
			Payout: po, Events: events, Banks: related, Now: now, StuckAfter: DefaultPayoutSLA,
		})
		markUsedBanks(usedBanks, fr)
		results = append(results, fr)
	}

	results = applySharedBankAmbiguity(results)

	for _, d := range decisions {
		if d.State != BankMatchOrphanBank {
			continue
		}
		b, ok := bankByID[d.BankObservationID]
		if !ok {
			continue
		}
		if _, used := usedBanks[b.ID]; used {
			continue
		}
		fr := OrphanBankResult(b)
		fr.EvidenceRefs.SettlementBankDecisionID = d.ID
		if fr.Exception != nil {
			fr.Exception.EvidenceRefs = fr.EvidenceRefs
			fr.Exception.EvidenceIDs = EvidenceIDList(fr.EvidenceRefs)
		}
		markUsedBanks(usedBanks, fr)
		results = append(results, fr)
	}
	for _, b := range UnusedCreditBanks(banks, usedBanks) {
		fr := OrphanBankResult(b)
		markUsedBanks(usedBanks, fr)
		results = append(results, fr)
	}

	counts := map[string]int{}
	matched := 0
	exceptions := 0
	persisted := make([]FinancialResult, 0, len(results))
	for _, fr := range results {
		saved, err := s.Store.UpsertReconciliationResult(ctx, req.TenantID, req.ConnectorID, run.ID, fr)
		if err != nil {
			return run, nil, err
		}
		if saved.Exception != nil && NeedsInvestigation(saved) {
			ex := *saved.Exception
			ex.TenantID = req.TenantID
			ex.ConnectorID = req.ConnectorID
			ex.RunID = run.ID
			if _, err := s.Store.InsertReconciliationException(ctx, req.TenantID, req.ConnectorID, run.ID, ex); err != nil {
				return run, nil, err
			}
			exceptions++
		}
		if saved.Result == ResultMatched {
			matched++
		}
		counts[saved.Result]++
		if err := s.emitDecision(ctx, req.TenantID, req.ConnectorID, run.ID, saved); err != nil {
			return run, nil, err
		}
		persisted = append(persisted, saved)
	}

	run.Status = "completed"
	run.PaymentCount = len(pays) + len(payouts)
	run.MatchedCount = matched
	run.ExceptionCount = exceptions
	run.Counts = counts
	run.CompletedAt = s.now()
	if err := s.Store.CompleteReconciliationRun(ctx, run); err != nil {
		return run, persisted, err
	}
	return run, persisted, nil
}

func (s *FinancialService) GetPayment(ctx context.Context, tenantID, connectorID, paymentID string) (PaymentFact, FinancialResult, bool, error) {
	pay, ok, err := s.Store.GetCanonicalPayment(ctx, tenantID, connectorID, paymentID)
	if err != nil || !ok {
		return pay, FinancialResult{}, ok, err
	}
	fr, found, err := s.Store.GetReconciliationResult(ctx, tenantID, connectorID, EntityPayment, paymentID)
	if err != nil {
		return pay, FinancialResult{}, false, err
	}
	if !found {
		return pay, FinancialResult{EntityType: EntityPayment, EntityID: paymentID, Status: pay.CanonicalStatus, Result: ResultUnresolved, Reason: "not_run"}, true, nil
	}
	return pay, fr, true, nil
}

func (s *FinancialService) GetPayout(ctx context.Context, tenantID, connectorID, payoutID string) (PayoutFact, FinancialResult, bool, error) {
	po, ok, err := s.Store.GetCanonicalPayoutFact(ctx, tenantID, connectorID, payoutID)
	if err != nil || !ok {
		return po, FinancialResult{}, ok, err
	}
	fr, found, err := s.Store.GetReconciliationResult(ctx, tenantID, connectorID, EntityPayout, payoutID)
	if err != nil {
		return po, FinancialResult{}, false, err
	}
	if !found {
		return po, FinancialResult{EntityType: EntityPayout, EntityID: payoutID, Status: po.ProviderStatus, Result: ResultUnresolved, Reason: "not_run"}, true, nil
	}
	return po, fr, true, nil
}

func (s *FinancialService) Investigate(ctx context.Context, tenantID, connectorID, exceptionID, entityID string) (InvestigationRecord, error) {
	var ex ReconciliationException
	var ok bool
	var err error
	if exceptionID != "" {
		ex, ok, err = s.Store.GetReconciliationException(ctx, tenantID, connectorID, exceptionID)
		if err != nil {
			return InvestigationRecord{}, err
		}
		if !ok {
			return InvestigationRecord{}, errNotFound
		}
	} else {
		list, err := s.Store.ListReconciliationExceptions(ctx, tenantID, connectorID)
		if err != nil {
			return InvestigationRecord{}, err
		}
		for _, item := range list {
			if item.EntityID == entityID {
				ex = item
				ok = true
				break
			}
		}
		if !ok {
			return InvestigationRecord{}, errNotFound
		}
	}
	rec := DeterministicInvestigation(ex)
	rec.TenantID = tenantID
	rec.ConnectorID = connectorID
	rec.ExceptionID = ex.ID
	rec.FinancialImpact = ex.VarianceAmount
	rec.Confidence = ex.Confidence
	rec.EvidenceIDs = append([]string{}, ex.EvidenceIDs...)
	return s.Store.InsertInvestigation(ctx, rec)
}

func (s *FinancialService) emitDecision(ctx context.Context, tenantID, connectorID, runID string, fr FinancialResult) error {
	tid, err := uuid.Parse(tenantID)
	if err != nil {
		tid = uuid.Nil
	}
	payload, _ := json.Marshal(map[string]any{
		"event_type":           models.EventTypeReconDecisionV1,
		"event_version":        models.EventVersionV1,
		"schema_version":       models.SchemaVersionV1,
		"rule_version":         FinancialRuleVersion,
		"tenant_id":            tenantID,
		"connector_id":         connectorID,
		"run_id":               runID,
		"entity_type":          fr.EntityType,
		"entity_id":            fr.EntityID,
		"status":               fr.Status,
		"result":               fr.Result,
		"expected_amount":      fr.ExpectedAmount,
		"observed_amount":      fr.ObservedAmount,
		"variance_amount":      fr.VarianceAmount,
		"bank_credit_proven":   fr.BankCreditProven,
		"reason":               fr.Reason,
		"evidence_refs":        fr.EvidenceRefs,
	})
	agg := uuid.Must(uuid.NewV7())
	if parsed, err := uuid.Parse(fr.EvidenceRefs.CanonicalPaymentID); err == nil {
		agg = parsed
	}
	return s.Store.InsertMatchOutbox(ctx, models.OutboxRow{
		EventID:       uuid.Must(uuid.NewV7()),
		TenantID:      tid,
		AggregateType: "reconciliation_result",
		AggregateID:   agg,
		EventType:     models.EventTypeReconDecisionV1,
		Payload:       payload,
		CreatedAt:     s.now(),
	})
}

func relatedBanks(pay PaymentFact, events []ObservationFact, banks []BankTxn, decisions []SettlementBankDecision) []BankTxn {
	ids := map[string]struct{}{}
	utrs := map[string]struct{}{}
	for _, d := range decisions {
		if d.BankObservationID != "" {
			ids[d.BankObservationID] = struct{}{}
		}
		for _, c := range d.Candidates {
			ids[c] = struct{}{}
		}
	}
	for _, ev := range events {
		if u := normalizeUTR(ev.RawReference); u != "" {
			utrs[u] = struct{}{}
		}
	}
	var out []BankTxn
	seen := map[string]struct{}{}
	for _, b := range banks {
		_, byID := ids[b.ID]
		_, byUTR := utrs[normalizeUTR(b.UTR)]
		if !byUTR && b.UTRRaw != "" {
			_, byUTR = utrs[normalizeUTR(b.UTRRaw)]
		}
		if !byID && !byUTR {
			continue
		}
		if _, ok := seen[b.ID]; ok {
			continue
		}
		seen[b.ID] = struct{}{}
		out = append(out, b)
	}
	_ = pay
	return out
}

func relatedPayoutBanks(p PayoutFact, events []ObservationFact, banks []BankTxn) []BankTxn {
	utrs := map[string]struct{}{}
	if u := normalizeUTR(p.UTR); u != "" {
		utrs[u] = struct{}{}
	}
	for _, ev := range events {
		if u := normalizeUTR(ev.RawReference); u != "" {
			utrs[u] = struct{}{}
		}
	}
	var out []BankTxn
	for _, b := range banks {
		bu := normalizeUTR(b.UTR)
		if bu == "" {
			bu = normalizeUTR(b.UTRRaw)
		}
		if _, ok := utrs[bu]; ok {
			out = append(out, b)
			continue
		}
		if p.AmountMinor > 0 && b.DebitMinor == p.AmountMinor && (b.Currency == "" || p.Currency == "" || strings.EqualFold(b.Currency, p.Currency)) {
			out = append(out, b)
		}
	}
	return out
}

func markUsedBanks(used map[string]struct{}, fr FinancialResult) {
	if fr.EvidenceRefs.BankObservationID != "" {
		used[fr.EvidenceRefs.BankObservationID] = struct{}{}
	}
	for _, id := range fr.CandidateIDs {
		used[id] = struct{}{}
	}
}

func applySharedBankAmbiguity(results []FinancialResult) []FinancialResult {
	bankToIdx := map[string][]int{}
	for i, r := range results {
		if r.EntityType != EntityPayment {
			continue
		}
		ids := map[string]struct{}{}
		if r.EvidenceRefs.BankObservationID != "" {
			ids[r.EvidenceRefs.BankObservationID] = struct{}{}
		}
		for _, c := range r.CandidateIDs {
			ids[c] = struct{}{}
		}
		for id := range ids {
			bankToIdx[id] = append(bankToIdx[id], i)
		}
	}
	flipped := map[int][]string{}
	for bankID, idxs := range bankToIdx {
		pays := map[string]struct{}{}
		for _, i := range idxs {
			pays[results[i].EntityID] = struct{}{}
		}
		if len(pays) < 2 {
			continue
		}
		var cands []string
		for p := range pays {
			cands = append(cands, p)
		}
		cands = append(cands, bankID)
		for _, i := range idxs {
			flipped[i] = cands
		}
	}
	for i, cands := range flipped {
		results[i] = MarkAmbiguous(results[i], cands)
	}
	return results
}

func normalizeUTR(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}
