package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Relay-level metrics.
// All metrics carry a "service" label so a single Grafana dashboard can fan out
// across all upstream services.

var (
	// LeaseTotal counts how many lease calls were made.
	LeaseTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "lease_total",
		Help:      "Total number of lease calls made to upstream services.",
	}, []string{"service", "result"}) // result: success | empty | error

	// LeaseBatchSize tracks the distribution of batch sizes returned by /lease.
	LeaseBatchSize = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "relay",
		Name:      "lease_batch_size",
		Help:      "Number of events returned per lease call.",
		Buckets:   []float64{0, 1, 10, 50, 100, 200, 500, 1000},
	}, []string{"service"})

	// PublishTotal counts Kafka publish attempts.
	PublishTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "publish_total",
		Help:      "Total Kafka publish attempts.",
	}, []string{"service", "topic", "result"}) // result: success | error

	// PublishDuration tracks end-to-end publish latency per event.
	PublishDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "relay",
		Name:      "publish_duration_seconds",
		Help:      "Latency of Kafka publish calls.",
		Buckets:   prometheus.DefBuckets,
	}, []string{"service", "topic"})

	// AckTotal counts ack calls.
	AckTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "ack_total",
		Help:      "Total ack calls made to upstream services.",
	}, []string{"service", "result"})

	// NackTotal counts nack calls.
	NackTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "nack_total",
		Help:      "Total nack calls made to upstream services.",
	}, []string{"service", "result"})

	// DLQTotal counts events sent to either DLQ topic.
	DLQTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "dlq_total",
		Help:      "Total events routed to a DLQ topic.",
	}, []string{"service", "dlq_type"}) // dlq_type: publish_failure | poison

	// RetryTotal counts per-event Kafka retry attempts.
	RetryTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "retry_total",
		Help:      "Total Kafka publish retry attempts.",
	}, []string{"service"})

	// BacklogGauge tracks the current known backlog size per service
	// (= batch size when last lease returned events).
	BacklogGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "outbox_backlog",
		Help:      "Approximate number of PENDING outbox events seen in the last lease call.",
	}, []string{"service"})

	// PollCycleTotal counts complete poll cycles (lease → publish → ack/nack).
	PollCycleTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "poll_cycle_total",
		Help:      "Total number of completed poll cycles per service.",
	}, []string{"service"})

	// WorkerUp is 1 while the worker goroutine for a service is running.
	WorkerUp = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "worker_up",
		Help:      "1 if the worker for this service is running, 0 otherwise.",
	}, []string{"service"})

	// InFlightPublishes tracks the current semaphore usage per service.
	InFlightPublishes = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "in_flight_publishes",
		Help:      "Current number of in-flight Kafka publish goroutines.",
	}, []string{"service"})

	// LeaseAckNackMismatchTotal counts ack/nack calls where fewer rows were
	// updated than requested (P1 6.1.4 — lease owner validation). This means
	// the lease had already expired and been reclaimed by another relay
	// instance before the ack/nack landed. Not itself data loss — the
	// reclaiming instance will re-lease and reprocess those events — but a
	// sustained non-zero rate indicates lease TTLs are too tight for the
	// actual processing time.
	LeaseAckNackMismatchTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "lease_ack_nack_mismatch_total",
		Help:      "Ack/nack calls where updated rows < requested rows — lease likely reclaimed by another instance.",
	}, []string{"service", "op"}) // op: ack | nack

	// ── Dispatch loop metrics ────────────────────────────────────────────────

	// DispatchTotal counts dispatch lifecycle outcomes.
	DispatchTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "dispatch_total",
		Help:      "Total dispatch attempts by outcome.",
	}, []string{"outcome"}) // outcome: provider_acked | failed_retryable | failed_terminal | awaiting_signal | held

	// DispatchDuration tracks end-to-end dispatch latency (Step 1 → Step 5).
	DispatchDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Namespace: "relay",
		Name:      "dispatch_duration_seconds",
		Help:      "End-to-end dispatch latency from Step 1 commit to Step 5 commit.",
		Buckets:   []float64{0.1, 0.5, 1, 2, 5, 10, 30, 60},
	})

	// PSPCallDuration tracks PSP HTTP call latency.
	PSPCallDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "relay",
		Name:      "psp_call_duration_seconds",
		Help:      "PSP HTTP call latency.",
		Buckets:   []float64{0.1, 0.5, 1, 2, 5, 10, 30},
	}, []string{"outcome"}) // outcome: success | timeout | fatal | retryable

	// PSPCircuitBreakerState tracks the circuit breaker state.
	PSPCircuitBreakerState = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "psp_circuit_breaker_open",
		Help:      "1 if PSP circuit breaker is open (pausing dispatches), 0 if closed.",
	})

	// DetokenizeDuration tracks Service 3 call latency.
	DetokenizeDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "relay",
		Name:      "detokenize_duration_seconds",
		Help:      "Service 3 detokenize call latency.",
		Buckets:   []float64{0.01, 0.05, 0.1, 0.5, 1, 2},
	}, []string{"outcome"}) // outcome: success | error

	// DispatchStatusGauge tracks count of dispatches by status for operational visibility.
	DispatchStatusGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "dispatch_status_count",
		Help:      "Current count of dispatch rows by status. Updated by sweeper.",
	}, []string{"status"})

	// SweeperRunTotal counts sweeper executions.
	SweeperRunTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "sweeper_run_total",
		Help:      "Total sweeper runs by type.",
	}, []string{"sweeper_type", "outcome"}) // sweeper_type: retry | awaiting_signal | sent_recovery

	// RelayOutboxPendingGauge tracks PENDING rows in relay_outbox.
	RelayOutboxPendingGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "relay_outbox_pending",
		Help:      "Current count of PENDING rows in relay_outbox.",
	})

	// ── Payload hash verification metrics (P0 6.1.2) ────────────────────────

	// PayloadHashConflictTotal counts every payload_hash mismatch event.
	// This counter feeds the high-severity operational alert:
	//   increase(relay_payload_hash_conflict_total[5m]) > 0 → SEV1 / PagerDuty.
	// The "decision" label says whether we NACKed (re-queue) or ACKed as
	// permanent conflict (gave up after MaxConflictRetries).
	PayloadHashConflictTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "payload_hash_conflict_total",
		Help:      "Payload hash verification mismatches. Alert on this (SEV1): any non-zero increase in 5m window.",
	}, []string{"service", "decision"}) // decision: nack | ack_permanent

	// PayloadHashVerifiedTotal counts happy-path hash verifications so the
	// conflict ratio can be computed (conflicts / total_verified).
	PayloadHashVerifiedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "payload_hash_verified_total",
		Help:      "Events whose payload hash was verified successfully. Denominator for conflict-rate calculation.",
	}, []string{"service"})

	// PayloadHashSkippedTotal counts events whose payload_hash was empty and
	// therefore skipped (strict=false). Flip strict=true once all upstreams
	// guarantee the field to make this counter go to zero.
	PayloadHashSkippedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "payload_hash_skipped_total",
		Help:      "Events with empty payload_hash that were skipped (strict=false). Trend should go to 0 over time.",
	}, []string{"service"})

	// ── Durable publish-failure persistence (P0 6.1.3) ───────────────────────

	// PublishFailureRecordedTotal counts exhausted publish attempts (poison or
	// retries-exhausted) durably persisted to relay_publish_failures.
	PublishFailureRecordedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "publish_failure_recorded_total",
		Help:      "Exhausted publish attempts durably recorded to relay_publish_failures.",
	}, []string{"service", "failure_class"})

	// PublishFailurePersistErrorTotal counts failures to durably persist a
	// publish-failure record. When this fires for a poison event, the
	// upstream lease is deliberately withheld (nacked instead of acked) —
	// alert on any non-zero rate.
	PublishFailurePersistErrorTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "publish_failure_persist_error_total",
		Help:      "Failed attempts to durably persist a publish-failure record. Alert on this (SEV1): any non-zero increase.",
	}, []string{"service"})

	// ── Controlled replay (P0 6.1.3) ─────────────────────────────────────────

	// ReplayTotal counts controlled replay attempts.
	ReplayTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "failure_replay_total",
		Help:      "Total number of controlled replay attempts.",
	}, []string{"outcome"}) // outcome: SUCCESS | FAILED
)
