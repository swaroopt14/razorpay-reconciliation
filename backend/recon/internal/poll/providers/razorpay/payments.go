package razorpay

import (
	"context"
	"time"
)

// PaymentFetchOptions is the window/page input for FetchPayments.
type PaymentFetchOptions struct {
	From  time.Time
	To    time.Time
	Skip  int
	Count int
}

// FetchPayments is an alias for ListPaymentsPage used by the backfill job.
func (c *Client) FetchPayments(ctx context.Context, opts PaymentFetchOptions) (ListResponse[PaymentResponse], ResponseMeta, error) {
	return c.ListPaymentsPage(ctx, TimeWindow{From: opts.From, To: opts.To}, opts.Skip, opts.Count)
}

// IteratePayments traverses all pages of payments in a time window.
// Calls fn for each payment. Stops on error, context cancel, or max pages.
func IteratePayments(
	ctx context.Context,
	client *Client,
	window TimeWindow,
	fn ListPaymentsFunc,
	maxPages int,
) error {
	return iteratePayments(ctx, client, window, fn, maxPages)
}

// FetchAllPayments collects all payments in a time window up to maxPages.
// Returns the full slice or an error.
func FetchAllPayments(
	ctx context.Context,
	client *Client,
	window TimeWindow,
	maxPages int,
) ([]PaymentResponse, error) {
	var all []PaymentResponse
	err := IteratePayments(ctx, client, window, func(p PaymentResponse) error {
		all = append(all, p)
		return nil
	}, maxPages)
	return all, err
}
