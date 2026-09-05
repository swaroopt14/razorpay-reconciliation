package poll

import (
	"sync/atomic"
	"time"
)

type counterVec struct {
	n atomic.Int64
}

func (c *counterVec) Inc() { c.n.Add(1) }
func (c *counterVec) Add(v int64) {
	if v > 0 {
		c.n.Add(v)
	}
}
func (c *counterVec) Get() int64 { return c.n.Load() }

type sourceCounter struct {
	webhook     atomic.Int64
	apiBackfill atomic.Int64
}

var (
	backfillRunsTotal       counterVec
	backfillSuccessTotal    counterVec
	backfillFailureTotal    counterVec
	backfillFetchedTotal    counterVec
	backfillInsertedTotal   counterVec
	backfillUpdatedTotal    counterVec
	backfillDuplicatesTotal counterVec
	backfillMissingWebhook  counterVec
	observationSources      sourceCounter
	backfillAPILatencyNs    atomic.Int64
	backfillLagNs           atomic.Int64
	backfillCursorAgeNs     atomic.Int64
)

func observeBackfillRun() { backfillRunsTotal.Inc() }

func observeBackfillSuccess() { backfillSuccessTotal.Inc() }

func observeBackfillFailure() { backfillFailureTotal.Inc() }

func observeBackfillResult(job BackfillJob) {
	backfillFetchedTotal.Add(job.FetchedCount)
	backfillInsertedTotal.Add(job.InsertedCount)
	backfillUpdatedTotal.Add(job.UpdatedCount)
	backfillDuplicatesTotal.Add(job.DuplicateCount)
	backfillMissingWebhook.Add(job.MissingWebhookCount)
}

func observeObservationSource(source string) {
	switch NormalizeObservationSource(source) {
	case SourceWebhook:
		observationSources.webhook.Add(1)
	default:
		observationSources.apiBackfill.Add(1)
	}
}

func observeBackfillAPILatency(d time.Duration) {
	if d > 0 {
		backfillAPILatencyNs.Store(d.Nanoseconds())
	}
}

func observeBackfillLag(d time.Duration) {
	if d < 0 {
		d = 0
	}
	backfillLagNs.Store(d.Nanoseconds())
}

func observeCursorAge(d time.Duration) {
	if d < 0 {
		d = 0
	}
	backfillCursorAgeNs.Store(d.Nanoseconds())
}

// BackfillMetricSnapshot is a test-friendly view of Phase 3 counters.
func BackfillMetricSnapshot() map[string]int64 {
	return map[string]int64{
		"razorpay_backfill_runs_total":             backfillRunsTotal.Get(),
		"razorpay_backfill_success_total":          backfillSuccessTotal.Get(),
		"razorpay_backfill_failure_total":          backfillFailureTotal.Get(),
		"razorpay_backfill_records_fetched_total":  backfillFetchedTotal.Get(),
		"razorpay_backfill_records_inserted_total": backfillInsertedTotal.Get(),
		"razorpay_backfill_records_updated_total":  backfillUpdatedTotal.Get(),
		"razorpay_backfill_duplicates_total":       backfillDuplicatesTotal.Get(),
		"razorpay_backfill_missing_webhook_total":  backfillMissingWebhook.Get(),
		"payment_observation_source_webhook":       observationSources.webhook.Load(),
		"payment_observation_source_api_backfill":  observationSources.apiBackfill.Load(),
		"razorpay_backfill_api_latency_ns":         backfillAPILatencyNs.Load(),
		"razorpay_backfill_lag_seconds_ns":         backfillLagNs.Load(),
		"razorpay_backfill_cursor_age_seconds_ns":  backfillCursorAgeNs.Load(),
	}
}
