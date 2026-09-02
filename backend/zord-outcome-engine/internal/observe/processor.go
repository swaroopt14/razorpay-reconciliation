package observe

import (
	"context"
	"fmt"
	"strings"

	"zord-outcome-engine/internal/poll"
)

type ResultKind string

const (
	ResultSkipped   ResultKind = "skipped"
	ResultInserted  ResultKind = "inserted"
	ResultUpdated   ResultKind = "updated"
	ResultDuplicate ResultKind = "duplicate"
	ResultIgnored   ResultKind = "ignored"
)

type Result struct {
	Kind      ResultKind
	PaymentID string
	EventType string
}

type Processor struct {
	store poll.Store
}

func NewProcessor(store poll.Store) *Processor {
	return &Processor{store: store}
}

func (p *Processor) ApplyBytes(ctx context.Context, raw []byte) (Result, error) {
	env, err := ParseEnvelope(raw)
	if err != nil {
		return Result{Kind: ResultIgnored}, nil
	}
	return p.Apply(ctx, env)
}

func (p *Processor) Apply(ctx context.Context, env Envelope) (Result, error) {
	if p == nil || p.store == nil {
		return Result{}, fmt.Errorf("observation processor not configured")
	}
	if !env.IsProviderObservation() {
		return Result{Kind: ResultIgnored}, nil
	}
	item, ok, err := NormalizePayment(env)
	if err != nil {
		return Result{Kind: ResultSkipped, EventType: env.ProviderEventType}, nil
	}
	if !ok {
		return Result{Kind: ResultSkipped, EventType: env.ProviderEventType}, nil
	}
	if strings.TrimSpace(env.TenantID) == "" || strings.TrimSpace(env.ConnectorID) == "" {
		return Result{}, fmt.Errorf("missing tenant_id or connector_id")
	}
	mode := env.ProviderMode
	if mode != "live" {
		mode = "test"
	}
	provider := env.Provider
	if provider == "" {
		provider = "razorpay"
	}
	upsert, err := p.store.UpsertPayment(ctx, poll.PaymentObservation{
		TenantID:     env.TenantID,
		ConnectorID:  env.ConnectorID,
		Provider:     provider,
		ProviderMode: mode,
		Item:         item,
		ReceiptID:    env.ReceiptID,
		Source:       SourceWebhook,
	})
	if err != nil {
		return Result{}, err
	}
	result := Result{PaymentID: item.PaymentID, EventType: env.ProviderEventType}
	switch upsert {
	case poll.UpsertDuplicate:
		result.Kind = ResultDuplicate
		return result, nil
	case poll.UpsertUpdated:
		result.Kind = ResultUpdated
	default:
		result.Kind = ResultInserted
	}
	row, err := poll.PaymentOutboxRow(env.TenantID, env.ConnectorID, item.PaymentID, SourceWebhook, item)
	if err != nil {
		return Result{}, err
	}
	if err := p.store.InsertOutbox(ctx, row); err != nil {
		return Result{}, err
	}
	return result, nil
}
