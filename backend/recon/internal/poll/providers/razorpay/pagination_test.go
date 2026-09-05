package razorpay

import (
	"testing"
)

func TestPaginationParams(t *testing.T) {
	page := SkipCount{Skip: 10, Count: 50}
	q := PaginationParams(page)

	if q.Get("skip") != "10" {
		t.Errorf("expected skip=10, got %s", q.Get("skip"))
	}
	if q.Get("count") != "50" {
		t.Errorf("expected count=50, got %s", q.Get("count"))
	}
}

func TestPaginationParamsZeroSkip(t *testing.T) {
	page := SkipCount{Skip: 0, Count: 100}
	q := PaginationParams(page)

	if q.Get("skip") != "" {
		t.Error("skip=0 should not be set")
	}
	if q.Get("count") != "100" {
		t.Errorf("expected count=100, got %s", q.Get("count"))
	}
}

func TestNextPage(t *testing.T) {
	page := SkipCount{Skip: 0, Count: 100}
	next := page.NextPage(100)

	if next.Skip != 100 {
		t.Errorf("expected skip=100, got %d", next.Skip)
	}
	if next.Count != 100 {
		t.Errorf("expected count=100, got %d", next.Count)
	}
}

func TestHasMoreTrue(t *testing.T) {
	page := SkipCount{Skip: 0, Count: 100}
	if !page.HasMore(100, 100) {
		t.Error("100 returned items with max 100 should have more")
	}
}

func TestHasMoreFalse(t *testing.T) {
	page := SkipCount{Skip: 0, Count: 100}
	if page.HasMore(50, 100) {
		t.Error("50 returned items with max 100 should not have more")
	}
}

func TestHasMoreEmpty(t *testing.T) {
	page := SkipCount{Skip: 0, Count: 100}
	if page.HasMore(0, 100) {
		t.Error("0 returned items should not have more")
	}
}
