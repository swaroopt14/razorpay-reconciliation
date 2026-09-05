package payouttruth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

type Kind string

const (
	KindInserted  Kind = "inserted"
	KindUpdated   Kind = "updated"
	KindDuplicate Kind = "duplicate"
	KindObserved  Kind = "observed"
)

type Result struct {
	Kind     Kind
	PayoutID string
	Canonical CanonicalPayout
}

type Store interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
	InsertOutbox(ctx context.Context, row models.OutboxRow) error
	InsertPayoutObservationEvent(ctx context.Context, obs Observation) (inserted bool, err error)
	GetCanonicalPayout(ctx context.Context, tenantID, connectorID, payoutID string) (CanonicalPayout, bool, error)
	UpsertCanonicalPayout(ctx context.Context, pay CanonicalPayout) error
	ListPayoutObservationEvents(ctx context.Context, tenantID, connectorID, payoutID string) ([]Observation, error)
}

type Processor struct {
	store Store
}

func NewProcessor(store Store) *Processor {
	return &Processor{store: store}
}

func MapNeutral(tenantID, connectorID, provider, source, sourceEventID string, item razorpay.NeutralPayout, observedAt time.Time) (Observation, error) {
	if strings.TrimSpace(item.PayoutID) == "" {
		return Observation{}, fmt.Errorf("payout_id is required")
	}
	if item.PayloadHash == "" {
		sum := sha256.Sum256([]byte(item.PayoutID + "|" + item.Status + "|" + sourceEventID))
		item.PayloadHash = hex.EncodeToString(sum[:])
	}
	status := razorpay.NormalizePayoutStatus(item.Status)
	obs := Observation{
		TenantID: tenantID, ConnectorID: connectorID, Provider: provider,
		PayoutID: item.PayoutID, AmountMinor: item.AmountMinor, Currency: item.Currency,
		ProviderStatus: status, UTR: item.UTR, Mode: item.Mode, Purpose: item.Purpose,
		StatusReason: item.StatusReason, ProviderCreatedAt: item.CreatedAt,
		ObservedAt: observedAt, Source: source, SourceEventID: sourceEventID,
		SourceHash: item.PayloadHash,
	}
	obs.IdentityHash = IdentityHash(obs.TenantID, obs.ConnectorID, obs.Provider, obs.PayoutID, obs.Source, obs.SourceEventID, obs.SourceHash)
	return obs, nil
}

func IdentityHash(tenantID, connectorID, provider, payoutID, source, sourceEventID, sourceHash string) string {
	if provider == "" {
		provider = "razorpay"
	}
	raw := strings.Join([]string{tenantID, connectorID, provider, payoutID, source, sourceEventID, sourceHash}, "|")
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (p *Processor) Process(ctx context.Context, obs Observation) (Result, error) {
	if p == nil || p.store == nil {
		return Result{}, fmt.Errorf("payout truth processor not configured")
	}
	if strings.TrimSpace(obs.PayoutID) == "" {
		return Result{}, fmt.Errorf("payout_id is required")
	}
	if obs.IdentityHash == "" {
		obs.IdentityHash = IdentityHash(obs.TenantID, obs.ConnectorID, obs.Provider, obs.PayoutID, obs.Source, obs.SourceEventID, obs.SourceHash)
	}
	var result Result
	err := p.store.RunInTx(ctx, func(ctx context.Context) error {
		inserted, err := p.store.InsertPayoutObservationEvent(ctx, obs)
		if err != nil {
			return err
		}
		current, _, err := p.store.GetCanonicalPayout(ctx, obs.TenantID, obs.ConnectorID, obs.PayoutID)
		if err != nil {
			return err
		}
		if !inserted {
			result = Result{Kind: KindDuplicate, PayoutID: obs.PayoutID, Canonical: current}
			return nil
		}
		reduced := Reduce(current, obs)
		changed := current.PayoutID == "" || current.ProviderStatus != reduced.ProviderStatus || current.AmountMinor != reduced.AmountMinor
		if reduced.ID == "" && current.ID != "" {
			reduced.ID = current.ID
		}
		if err := p.store.UpsertCanonicalPayout(ctx, reduced); err != nil {
			return err
		}
		if changed {
			tid, _ := uuid.Parse(obs.TenantID)
			payload, _ := jsonPayload(reduced, obs)
			if err := p.store.InsertOutbox(ctx, models.OutboxRow{
				EventID: uuid.Must(uuid.NewV7()), TenantID: tid,
				AggregateType: "canonical_payout", AggregateID: parseOrNew(reduced.ID),
				EventType: models.EventTypePayoutCanonicalUpdatedV1, Payload: payload, CreatedAt: time.Now().UTC(),
			}); err != nil {
				return err
			}
		}
		switch {
		case current.PayoutID == "":
			result = Result{Kind: KindInserted, PayoutID: obs.PayoutID, Canonical: reduced}
		case changed:
			result = Result{Kind: KindUpdated, PayoutID: obs.PayoutID, Canonical: reduced}
		default:
			result = Result{Kind: KindObserved, PayoutID: obs.PayoutID, Canonical: reduced}
		}
		return nil
	})
	return result, err
}

func jsonPayload(pay CanonicalPayout, obs Observation) ([]byte, error) {
	return json.Marshal(map[string]any{
		"event_type":      models.EventTypePayoutCanonicalUpdatedV1,
		"payout_id":       pay.PayoutID,
		"provider_status": pay.ProviderStatus,
		"amount_minor":    pay.AmountMinor,
		"currency":        pay.Currency,
		"source":          obs.Source,
	})
}

func parseOrNew(id string) uuid.UUID {
	if parsed, err := uuid.Parse(id); err == nil {
		return parsed
	}
	return uuid.Must(uuid.NewV7())
}
