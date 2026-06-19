package mlclient

import (
	"context"
	"errors"
	"log"
)

// errAsyncPoolFull is returned when all 100 async slots are occupied.
// Callers receive the typed fallback value immediately so business logic
// is never blocked, even under extreme burst.
var errAsyncPoolFull = errors.New("mlclient: async pool full")

// invokeAsync runs fn in a background goroutine, bounded by asyncSem (capacity=100).
// Returns errAsyncPoolFull without blocking if all slots are taken.
func (c *Client) invokeAsync(fn func()) error {
	select {
	case c.asyncSem <- struct{}{}:
	default:
		return errAsyncPoolFull
	}
	go func() {
		defer func() { <-c.asyncSem }()
		fn()
	}()
	return nil
}

// InvokeIsolationForestAsync fires an IF scoring request in the background.
// cb is called from a goroutine when the result is ready.
// If the pool is full, cb is called immediately (in its own goroutine) with FallbackIFResult.
func (c *Client) InvokeIsolationForestAsync(ctx context.Context, req IFRequest, cb func(IFResult, error)) {
	err := c.invokeAsync(func() {
		result, err := c.InvokeIsolationForest(ctx, req)
		cb(result, err)
	})
	if err != nil {
		log.Printf("mlclient: InvokeIsolationForestAsync pool full tenant=%s — using fallback", req.TenantID)
		go cb(FallbackIFResult(), err)
	}
}

// InvokeLogisticRegressionAsync fires an LR predict request in the background.
// cb is called from a goroutine when the result is ready.
// If the pool is full, cb is called immediately (in its own goroutine) with FallbackLRResult.
func (c *Client) InvokeLogisticRegressionAsync(ctx context.Context, req LRRequest, cb func(LRResult, error)) {
	err := c.invokeAsync(func() {
		result, err := c.InvokeLogisticRegression(ctx, req)
		cb(result, err)
	})
	if err != nil {
		log.Printf("mlclient: InvokeLogisticRegressionAsync pool full tenant=%s — using fallback", req.TenantID)
		go cb(FallbackLRResult(), err)
	}
}

// InvokeRCAClusteringAsync fires an RCA clustering request in the background.
// cb is called from a goroutine when the result is ready.
// If the pool is full, cb is called immediately (in its own goroutine) with FallbackRCAResult.
func (c *Client) InvokeRCAClusteringAsync(ctx context.Context, req RCARequest, cb func(RCAClusterResult, error)) {
	err := c.invokeAsync(func() {
		result, err := c.InvokeRCAClustering(ctx, req)
		cb(result, err)
	})
	if err != nil {
		log.Printf("mlclient: InvokeRCAClusteringAsync pool full tenant=%s batch=%s — using fallback",
			req.TenantID, req.BatchID)
		go cb(FallbackRCAResult(), err)
	}
}

// InvokeLeakagePredictionAsync fires a leakage regression request in the background.
// If the pool is full, cb is called immediately with a safe fallback.
func (c *Client) InvokeLeakagePredictionAsync(
	ctx context.Context,
	req LeakagePredictionRequest,
	cb func(LeakagePredictionResult, error),
) {
	err := c.invokeAsync(func() {
		result, err := c.InvokeLeakagePrediction(ctx, req)
		cb(result, err)
	})
	if err != nil {
		log.Printf("mlclient: InvokeLeakagePredictionAsync pool full tenant=%s batch=%s - using fallback",
			req.TenantID, req.BatchID)
		go cb(FallbackLeakagePredictionResult(), err)
	}
}

// InvokeZScoreAsync fires a Z-score anomaly detection request in the background.
// cb is called from a goroutine when the result is ready.
// If the pool is full, cb is called immediately (in its own goroutine) with FallbackZScoreResult.
func (c *Client) InvokeZScoreAsync(ctx context.Context, req ZScoreRequest, cb func(ZScoreResult, error)) {
	err := c.invokeAsync(func() {
		result, err := c.InvokeZScore(ctx, req)
		cb(result, err)
	})
	if err != nil {
		log.Printf("mlclient: InvokeZScoreAsync pool full tenant=%s — using fallback", req.TenantID)
		go cb(FallbackZScoreResult(), err)
	}
}
