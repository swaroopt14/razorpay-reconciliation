package bankingest

import (
	"context"
	"encoding/json"
	"time"

	"zord-outcome-engine/internal/imports"
	"zord-outcome-engine/internal/recon"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

type DecisionStore interface {
	ListSettlementLines(ctx context.Context, tenantID, connectorID string) ([]recon.SettlementLine, error)
	ListBankTxns(ctx context.Context, tenantID, connectorID, accountID string) ([]recon.BankTxn, error)
	InsertSettlementBankDecisions(ctx context.Context, tenantID, connectorID string, decisions []recon.SettlementBankDecision) error
	InsertMatchOutbox(ctx context.Context, row models.OutboxRow) error
	CountProofs(ctx context.Context, tenantID, connectorID string) (int, error)
}

type Service struct {
	Imports    *imports.Service
	Store      DecisionStore
	AfterMatch func(ctx context.Context, tenantID, connectorID, accountID string) error
}

func NewService(imp *imports.Service, store DecisionStore) *Service {
	return &Service{Imports: imp, Store: store}
}

type IngestRequest struct {
	TenantID    string
	ConnectorID string
	AccountID   string
	FileName    string
	Profile     string
	Currency    string
	AmountUnit  string
	Timezone    string
	Payload     []byte
}

type IngestResult struct {
	Import     imports.Import
	Decisions  []recon.SettlementBankDecision
	ProofCount int
}

func (s *Service) IngestAndMatch(ctx context.Context, req IngestRequest) (IngestResult, error) {
	unit := req.AmountUnit
	if unit == "" {
		unit = "paise"
	}
	tz := req.Timezone
	if tz == "" {
		tz = "Asia/Kolkata"
	}
	imp, err := s.Imports.UploadValidateCommit(ctx, imports.UploadInput{
		TenantID:     req.TenantID,
		ConnectorID:  req.ConnectorID,
		AccountID:    req.AccountID,
		ImportType:   imports.TypeBankCSV,
		FileName:     req.FileName,
		ProviderMode: "test",
		Payload:      req.Payload,
	}, imports.ValidateRequest{
		Currency:   req.Currency,
		AmountUnit: unit,
		Timezone:   tz,
		Profile:    req.Profile,
	})
	if err != nil {
		return IngestResult{}, err
	}
	out := IngestResult{Import: imp}
	if imp.Status == imports.StatusDuplicate || imp.Status == imports.StatusValidationFailed {
		return out, nil
	}
	decisions, err := s.Match(ctx, req.TenantID, req.ConnectorID, req.AccountID)
	if err != nil {
		return out, err
	}
	out.Decisions = decisions
	if s.Store != nil {
		n, _ := s.Store.CountProofs(ctx, req.TenantID, req.ConnectorID)
		out.ProofCount = n
	}
	return out, nil
}

func (s *Service) Match(ctx context.Context, tenantID, connectorID, accountID string) ([]recon.SettlementBankDecision, error) {
	if s.Store == nil {
		return nil, nil
	}
	lines, err := s.Store.ListSettlementLines(ctx, tenantID, connectorID)
	if err != nil {
		return nil, err
	}
	banks, err := s.Store.ListBankTxns(ctx, tenantID, connectorID, accountID)
	if err != nil {
		return nil, err
	}
	decisions := recon.MatchSettlementBank(lines, banks)
	if err := s.Store.InsertSettlementBankDecisions(ctx, tenantID, connectorID, decisions); err != nil {
		return nil, err
	}
	if err := s.emitMatchOutbox(ctx, tenantID, connectorID, decisions); err != nil {
		return nil, err
	}
	if s.AfterMatch != nil {
		if err := s.AfterMatch(ctx, tenantID, connectorID, accountID); err != nil {
			return decisions, err
		}
	}
	return decisions, nil
}

func (s *Service) emitMatchOutbox(ctx context.Context, tenantID, connectorID string, decisions []recon.SettlementBankDecision) error {
	tid, err := uuid.Parse(tenantID)
	if err != nil {
		tid = uuid.Nil
	}
	counts := map[string]int{}
	for _, d := range decisions {
		counts[d.State]++
	}
	payload, _ := json.Marshal(map[string]any{
		"event_type":     models.EventTypeBankMatchCompletedV1,
		"event_version":  models.EventVersionV1,
		"schema_version": models.SchemaVersionV1,
		"tenant_id":      tenantID,
		"connector_id":   connectorID,
		"counts":         counts,
		"decision_count": len(decisions),
	})
	return s.Store.InsertMatchOutbox(ctx, models.OutboxRow{
		EventID:       uuid.Must(uuid.NewV7()),
		TenantID:      tid,
		AggregateType: "settlement_bank_match",
		AggregateID:   uuid.Must(uuid.NewV7()),
		EventType:     models.EventTypeBankMatchCompletedV1,
		Payload:       payload,
		CreatedAt:     time.Now().UTC(),
	})
}
