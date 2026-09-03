package razorpay

import (
	"context"
	"net/http"
)

type RefundResponse struct {
	ID        string `json:"id"`
	Entity    string `json:"entity"`
	PaymentID string `json:"payment_id"`
	Amount    int64  `json:"amount"`
	Currency  string `json:"currency"`
	Status    string `json:"status"`
}

func (c *Client) FetchRefund(ctx context.Context, refundID string) (*RefundResponse, error) {
	var result RefundResponse
	if err := c.do(ctx, http.MethodGet, "/refunds/"+refundID, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) ListRefundsPage(ctx context.Context, skip, count int) (ListResponse[RefundResponse], error) {
	if count <= 0 {
		count = 10
	}
	q := PaginationParams(SkipCount{Skip: skip, Count: count})
	var result ListResponse[RefundResponse]
	if err := c.do(ctx, http.MethodGet, "/refunds", q, &result); err != nil {
		return ListResponse[RefundResponse]{}, err
	}
	return result, nil
}
