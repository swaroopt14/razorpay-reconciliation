package razorpay

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// PayoutResponse is the RazorpayX payout DTO. Status is stored exactly as sent.
type PayoutResponse struct {
	ID             string         `json:"id"`
	Entity         string         `json:"entity"`
	FundAccountID  string         `json:"fund_account_id"`
	Amount         int64          `json:"amount"`
	Currency       string         `json:"currency"`
	Fees           int64          `json:"fees"`
	Tax            int64          `json:"tax"`
	Status         string         `json:"status"`
	Purpose        string         `json:"purpose"`
	UTR            string         `json:"utr"`
	Mode           string         `json:"mode"`
	ReferenceID    string         `json:"reference_id"`
	Narration      string         `json:"narration"`
	StatusDetails  map[string]any `json:"status_details"`
	CreatedAt      int64          `json:"created_at"`
}

type NeutralPayout struct {
	PayoutID      string
	AmountMinor   int64
	Currency      string
	Status        string
	UTR           string
	Mode          string
	Purpose       string
	ReferenceID   string
	StatusReason  string
	CreatedAt     time.Time
	PayloadHash   string
}

func (c *Client) FetchPayout(ctx context.Context, payoutID string) (*PayoutResponse, error) {
	var result PayoutResponse
	if err := c.do(ctx, http.MethodGet, "/payouts/"+payoutID, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) ListPayoutsPage(ctx context.Context, window TimeWindow, skip, count int) (ListResponse[PayoutResponse], ResponseMeta, error) {
	if skip < 0 {
		skip = 0
	}
	if count <= 0 || count > 100 {
		count = 100
	}
	q := PaginationParams(SkipCount{Skip: skip, Count: count})
	if !window.From.IsZero() {
		q.Set("from", strconv.FormatInt(window.From.Unix(), 10))
	}
	if !window.To.IsZero() {
		q.Set("to", strconv.FormatInt(window.To.Unix(), 10))
	}
	var result ListResponse[PayoutResponse]
	meta, err := c.doRaw(ctx, http.MethodGet, "/payouts", q, &result)
	return result, meta, err
}

func NeutralFromPayout(p PayoutResponse) NeutralPayout {
	reason := ""
	if p.StatusDetails != nil {
		if r, ok := p.StatusDetails["reason"].(string); ok {
			reason = r
		}
	}
	created := time.Time{}
	if p.CreatedAt > 0 {
		created = time.Unix(p.CreatedAt, 0).UTC()
	}
	item := NeutralPayout{
		PayoutID:     strings.TrimSpace(p.ID),
		AmountMinor:  p.Amount,
		Currency:     strings.ToUpper(strings.TrimSpace(p.Currency)),
		Status:       NormalizePayoutStatus(p.Status),
		UTR:          strings.TrimSpace(p.UTR),
		Mode:         strings.TrimSpace(p.Mode),
		Purpose:      strings.TrimSpace(p.Purpose),
		ReferenceID:  strings.TrimSpace(p.ReferenceID),
		StatusReason: reason,
		CreatedAt:    created,
	}
	if canonical, err := CanonicalizeForHash(map[string]any{
		"payout_id": item.PayoutID, "amount": item.AmountMinor, "currency": item.Currency,
		"status": item.Status, "utr": item.UTR, "mode": item.Mode,
	}); err == nil {
		item.PayloadHash = HashRawResponse(canonical)
	}
	return item
}
