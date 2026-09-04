package razorpay

import (
	"context"
	"fmt"
	"net/url"
)

// Razorpay pagination uses skip and count query parameters.
// List endpoints return { "entity": "...", "count": N, "items": [...] }

// PaginationParams builds Razorpay pagination query parameters.
func PaginationParams(page SkipCount) url.Values {
	q := url.Values{}
	if page.Skip > 0 {
		q.Set("skip", fmt.Sprintf("%d", page.Skip))
	}
	if page.Count > 0 {
		q.Set("count", fmt.Sprintf("%d", page.Count))
	}
	return q
}

// SkipCount represents Razorpay's skip/count pagination model.
type SkipCount struct {
	Skip  int
	Count int
}

// NextPage returns the next page of results.
func (s SkipCount) NextPage(pageSize int) SkipCount {
	return SkipCount{
		Skip:  s.Skip + pageSize,
		Count: pageSize,
	}
}

// HasMore returns true if there might be more pages.
func (s SkipCount) HasMore(returnedCount int, maxPageSize int) bool {
	return returnedCount >= maxPageSize
}

// ListPaymentsFunc is called for each page of payments during bounded iteration.
type ListPaymentsFunc func(payment PaymentResponse) error

// ListSettlementsFunc is called for each settlement row during bounded iteration.
type ListSettlementsFunc func(settlement SettlementResponse) error

// iteratePayments traverses all pages of a payment list using a bounded iterator.
// It stops when: no more items, max page count reached, context cancelled, or error.
func iteratePayments(
	ctx context.Context,
	client *Client,
	window TimeWindow,
	fn ListPaymentsFunc,
	maxPages int,
) error {
	page := SkipCount{Skip: 0, Count: client.config.MaxPageSize}
	pagesRead := 0

	for pagesRead < maxPages {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("context cancelled during pagination: %w", err)
		}

		ListPayments, err := client.ListPayments(ctx, window, page)
		if err != nil {
			return err
		}

		if len(ListPayments) == 0 {
			return nil
		}

		for _, p := range ListPayments {
			if err := fn(p); err != nil {
				return err
			}
		}

		if !page.HasMore(len(ListPayments), client.config.MaxPageSize) {
			return nil
		}

		page = page.NextPage(client.config.MaxPageSize)
		pagesRead++
	}

	return nil
}
