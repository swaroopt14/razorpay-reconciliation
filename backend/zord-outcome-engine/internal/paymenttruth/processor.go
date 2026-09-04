package paymenttruth

import (
	"context"
	"fmt"
	"strings"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/models"
)

type Kind string

const (
	KindInserted  Kind = "inserted"
	KindUpdated   Kind = "updated"
	KindDuplicate Kind = "duplicate"
	KindObserved  Kind = "observed"
)

type Result struct {
	Kind      Kind
	PaymentID string
	Canonical CanonicalPayment
}

type Store interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
	InsertOutbox(ctx context.Context, row models.OutboxRow) error
	InsertObservationEvent(ctx context.Context, obs Observation) (inserted bool, err error)
	GetCanonicalPayment(ctx context.Context, tenantID, connectorID, paymentID string) (CanonicalPayment, bool, error)
	UpsertCanonicalPayment(ctx context.Context, pay CanonicalPayment) error
	ApplyCanonicalSnapshot(ctx context.Context, pay CanonicalPayment, incoming Observation) error
	FindIntentByOrderID(ctx context.Context, tenantID, orderID string) (intentID string, ok bool, err error)
	ListObservationEvents(ctx context.Context, tenantID, connectorID, paymentID string) ([]Observation, error)
}

type Processor struct {
	store Store
}

func NewProcessor(store Store) *Processor {
	return &Processor{store: store}
}

func (p *Processor) ProcessNeutral(ctx context.Context, tenantID, connectorID, provider, mode, source, sourceEventID, receiptID string, item razorpay.NeutralPayment, webhookMissing bool) (Result, error) {
	obs, err := MapNeutral(tenantID, connectorID, provider, mode, source, sourceEventID, receiptID, item, webhookMissing, time.Now().UTC())
	if err != nil {
		return Result{}, err
	}
	return p.Process(ctx, obs)
}

func (p *Processor) Process(ctx context.Context, obs Observation) (Result, error) {
	if p == nil || p.store == nil {
		return Result{}, fmt.Errorf("payment truth processor not configured")
	}
	if err := validateObservation(obs); err != nil {
		return Result{}, err
	}
	if obs.IdentityHash == "" {
		obs.IdentityHash = ObservationIdentityHash(obs.TenantID, obs.ConnectorID, obs.Provider, obs.PaymentID, obs.Source, obs.SourceEventID, obs.SourceHash)
	}
	obs.Source = normalizeSource(obs.Source)
	var result Result
	err := p.store.RunInTx(ctx, func(ctx context.Context) error {
		inserted, err := p.store.InsertObservationEvent(ctx, obs)
		if err != nil {
			return err
		}
		current, _, err := p.store.GetCanonicalPayment(ctx, obs.TenantID, obs.ConnectorID, obs.PaymentID)
		if err != nil {
			return err
		}
		if !inserted {
			result = Result{Kind: KindDuplicate, PaymentID: obs.PaymentID, Canonical: current}
			return nil
		}
		reduced := ReducePaymentState(current, obs)
		if err := p.linkIntent(ctx, &reduced); err != nil {
			return err
		}
		changed := current.PaymentID == "" ||
			current.CanonicalStatus != reduced.CanonicalStatus ||
			current.AmountMinor != reduced.AmountMinor ||
			current.IntentID != reduced.IntentID
		if reduced.ID == "" && current.ID != "" {
			reduced.ID = current.ID
		}
		if err := p.store.UpsertCanonicalPayment(ctx, reduced); err != nil {
			return err
		}
		if err := p.store.ApplyCanonicalSnapshot(ctx, reduced, obs); err != nil {
			return err
		}
		obsRow, err := ObservationOutboxRow(obs)
		if err != nil {
			return err
		}
		if err := p.store.InsertOutbox(ctx, obsRow); err != nil {
			return err
		}
		if changed {
			canonRow, err := CanonicalOutboxRow(reduced, obs)
			if err != nil {
				return err
			}
			if err := p.store.InsertOutbox(ctx, canonRow); err != nil {
				return err
			}
		}
		switch {
		case current.PaymentID == "":
			result = Result{Kind: KindInserted, PaymentID: obs.PaymentID, Canonical: reduced}
		case changed:
			result = Result{Kind: KindUpdated, PaymentID: obs.PaymentID, Canonical: reduced}
		default:
			result = Result{Kind: KindObserved, PaymentID: obs.PaymentID, Canonical: reduced}
		}
		return nil
	})
	if err != nil {
		return Result{}, err
	}
	return result, nil
}

func (p *Processor) linkIntent(ctx context.Context, pay *CanonicalPayment) error {
	if pay.OrderID == "" {
		if pay.IntentLink == "" {
			pay.IntentLink = IntentUnlinked
		}
		return nil
	}
	if pay.IntentLink == IntentLinked && pay.IntentID != "" {
		return nil
	}
	id, ok, err := p.store.FindIntentByOrderID(ctx, pay.TenantID, pay.OrderID)
	if err != nil {
		return err
	}
	if ok && id != "" {
		pay.IntentID = id
		pay.IntentLink = IntentLinked
		return nil
	}
	pay.IntentLink = IntentUnlinked
	return nil
}

func validateObservation(obs Observation) error {
	if strings.TrimSpace(obs.TenantID) == "" || strings.TrimSpace(obs.ConnectorID) == "" {
		return fmt.Errorf("tenant_id and connector_id are required")
	}
	if strings.TrimSpace(obs.PaymentID) == "" {
		return fmt.Errorf("payment_id is required")
	}
	if obs.AmountMinor < 0 {
		return fmt.Errorf("amount must not be negative")
	}
	cur := strings.ToUpper(strings.TrimSpace(obs.Currency))
	if cur != "" && len(cur) != 3 {
		return fmt.Errorf("invalid currency")
	}
	return nil
}
