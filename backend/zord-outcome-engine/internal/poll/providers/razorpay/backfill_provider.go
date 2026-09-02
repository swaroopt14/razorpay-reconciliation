package razorpay

import (
	"context"
	"encoding/json"
	"strings"
	"time"
)

// NeutralPayment is a provider-neutral payment snapshot for the backfill service.
type NeutralPayment struct {
	PaymentID   string
	OrderID     string
	AmountMinor int64
	Currency    string
	Status         string
	ProviderStatus string
	Method         string
	Captured    bool
	FeeMinor    int64
	TaxMinor    int64
	CreatedAt   time.Time
	CapturedAt  time.Time
	Email       string
	Contact     string
	Notes       map[string]string
	PayloadHash string
}

// NeutralSettlementLine is a provider-neutral settlement recon row.
type NeutralSettlementLine struct {
	SettlementID     string
	EntityID         string
	LineType         string
	PaymentID        string
	OrderID          string
	AmountMinor      int64
	DebitMinor       int64
	CreditMinor      int64
	FeeMinor         int64
	TaxMinor         int64
	AdjustmentMinor  int64
	Currency         string
	UTR              string
	Settled          bool
	SettledAt        time.Time
	CreatedAt        time.Time
	RefundID         string
	ProviderStatus   string
	CanonicalStatus  string
	SourceFile       string
	SourceRow        int64
	RawReference     string
	PaymentLink      string
	PayloadHash      string
	Raw              json.RawMessage
}

// NeutralPage is one provider page plus response evidence.
type NeutralPage[T any] struct {
	Items   []T
	Skip    int
	Count   int
	HasMore bool
	Meta    ResponseMeta
}

// BackfillAdapter maps Razorpay DTOs into provider-neutral pages.
type BackfillAdapter struct {
	client *Client
}

func NewBackfillAdapter(client *Client) *BackfillAdapter {
	return &BackfillAdapter{client: client}
}

func (a *BackfillAdapter) ListPaymentsPage(ctx context.Context, from, to time.Time, skip, count int) (NeutralPage[NeutralPayment], error) {
	window := TimeWindow{From: from, To: to}
	page, meta, err := a.client.ListPaymentsPage(ctx, window, skip, count)
	out := NeutralPage[NeutralPayment]{
		Skip:    skip,
		Count:   count,
		Meta:    meta,
		HasMore: len(page.Items) >= count && count > 0,
	}
	if err != nil {
		return out, err
	}
	out.Items = make([]NeutralPayment, 0, len(page.Items))
	for _, item := range page.Items {
		canonical, _ := CanonicalizeForHash(item)
		neutral := NeutralPayment{
			PaymentID:   item.ID,
			OrderID:     item.OrderID,
			AmountMinor: item.Amount,
			Currency:    item.Currency,
			Status:         NormalizePaymentStatus(item.Status),
			ProviderStatus: item.Status,
			Method:         item.Method,
			Captured:    item.Captured || item.Status == "captured",
			FeeMinor:    item.Fee,
			TaxMinor:    item.Tax,
			CreatedAt:   time.Unix(item.CreatedAt, 0).UTC(),
			Email:       item.Email,
			Contact:     item.Contact,
			Notes:       item.Notes,
			PayloadHash: HashRawResponse(canonical),
		}
		if item.CapturedAt > 0 {
			neutral.CapturedAt = time.Unix(item.CapturedAt, 0).UTC()
		} else if neutral.Captured && item.CreatedAt > 0 {
			neutral.CapturedAt = neutral.CreatedAt
		}
		out.Items = append(out.Items, neutral)
	}
	return out, nil
}

func (a *BackfillAdapter) ListSettlementDay(ctx context.Context, day CivilDate, skip, count int) (NeutralPage[NeutralSettlementLine], error) {
	page, meta, err := a.client.ListSettlementReconDay(ctx, day, skip, count)
	out := NeutralPage[NeutralSettlementLine]{
		Skip:    skip,
		Count:   count,
		Meta:    meta,
		HasMore: len(page.Items) >= count && count > 0,
	}
	if err != nil {
		return out, err
	}
	out.Items = make([]NeutralSettlementLine, 0, len(page.Items))
	for _, item := range page.Items {
		canonical, _ := CanonicalizeForHash(item)
		currency := item.Currency
		if currency == "" {
			currency = "INR"
		}
		line := NeutralSettlementLine{
			SettlementID: item.SettlementID,
			EntityID:     item.EntityID,
			LineType:     strings.ToLower(strings.TrimSpace(item.Type)),
			PaymentID:    item.PaymentID,
			OrderID:      item.OrderID,
			AmountMinor:  item.Amount,
			DebitMinor:   item.Debit,
			CreditMinor:  item.Credit,
			FeeMinor:     item.Fee,
			TaxMinor:     item.Tax,
			Currency:     currency,
			UTR:          item.SettlementUTR,
			Settled:      item.Settled,
			RefundID:     item.RefundID,
			PayloadHash:  HashRawResponse(canonical),
		}
		EnrichSettlementLine(&line)
		if item.SettledAt > 0 {
			line.SettledAt = time.Unix(item.SettledAt, 0).UTC()
		}
		out.Items = append(out.Items, line)
	}
	return out, nil
}
