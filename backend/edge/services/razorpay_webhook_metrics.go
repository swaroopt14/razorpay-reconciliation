package services

import (
	"strings"
	"unicode"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	razorpayWebhookReceivedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "razorpay_webhook_received_total",
		Help: "Razorpay webhook deliveries seen by Edge.",
	}, []string{"provider", "mode"})

	razorpayWebhookAcceptedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "razorpay_webhook_accepted_total",
		Help: "Razorpay webhooks persisted with a new outbox observation.",
	}, []string{"provider", "mode", "event_type"})

	razorpayWebhookRejectedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "razorpay_webhook_rejected_total",
		Help: "Razorpay webhooks rejected or conflicted before a new observation.",
	}, []string{"provider", "mode", "status"})

	razorpayWebhookDuplicateTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "razorpay_webhook_duplicate_total",
		Help: "Idempotent Razorpay webhook redeliveries (same event_id and body hash).",
	}, []string{"provider", "mode", "event_type"})

	razorpayWebhookPersistFailureTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "razorpay_webhook_persist_failure_total",
		Help: "Failed receipt inserts for Razorpay webhooks.",
	}, []string{"provider", "mode"})

	razorpayWebhookOutboxFailureTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "razorpay_webhook_outbox_failure_total",
		Help: "Failed outbox inserts for Razorpay webhooks (receipt rolled back).",
	}, []string{"provider", "mode"})

	razorpayWebhookProcessingDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "razorpay_webhook_processing_duration_seconds",
		Help:    "Razorpay webhook Receive latency.",
		Buckets: prometheus.DefBuckets,
	}, []string{"provider", "mode", "status"})
)

func metricMode(mode string) string {
	switch mode {
	case "live":
		return "live"
	default:
		return "test"
	}
}

func metricEventType(eventType string) string {
	if eventType == "" {
		return "unknown"
	}
	if len(eventType) > 48 {
		return "other"
	}
	for _, r := range eventType {
		if r == '.' || r == '_' || r == '-' || unicode.IsLower(r) || unicode.IsDigit(r) {
			continue
		}
		return "other"
	}
	return eventType
}

func metricProvider(provider string) string {
	if strings.TrimSpace(provider) == "" {
		return "razorpay"
	}
	return provider
}
