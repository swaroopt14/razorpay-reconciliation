package razorpay

import "strings"

// NormalizePaymentStatus maps Razorpay status strings onto the existing
// recon vocabulary (lowercase). Unknown values become "unknown".
const (
	PayoutPending    = "pending"
	PayoutScheduled  = "scheduled"
	PayoutQueued     = "queued"
	PayoutProcessing = "processing"
	PayoutProcessed  = "processed"
	PayoutReversed   = "reversed"
	PayoutCancelled  = "cancelled"
	PayoutRejected   = "rejected"
	PayoutFailed     = "failed"
)

// NormalizePayoutStatus keeps Razorpay payout lifecycle names exactly (lowercase).
func NormalizePayoutStatus(status string) string {
	s := strings.ToLower(strings.TrimSpace(status))
	switch s {
	case PayoutPending, PayoutScheduled, PayoutQueued, PayoutProcessing,
		PayoutProcessed, PayoutReversed, PayoutCancelled, PayoutRejected, PayoutFailed:
		return s
	case "canceled":
		return PayoutCancelled
	default:
		return s
	}
}

func PayoutRank(status string) int {
	switch NormalizePayoutStatus(status) {
	case PayoutPending:
		return 1
	case PayoutScheduled:
		return 2
	case PayoutQueued:
		return 3
	case PayoutProcessing, PayoutCancelled, PayoutRejected, PayoutFailed:
		return 4
	case PayoutProcessed:
		return 5
	case PayoutReversed:
		return 6
	default:
		return 0
	}
}

func IsPayoutOpen(status string) bool {
	switch NormalizePayoutStatus(status) {
	case PayoutPending, PayoutScheduled, PayoutQueued, PayoutProcessing:
		return true
	default:
		return false
	}
}

func IsPayoutFailedLike(status string) bool {
	switch NormalizePayoutStatus(status) {
	case PayoutFailed, PayoutCancelled, PayoutRejected:
		return true
	default:
		return false
	}
}

func IsPayoutProcessed(status string) bool {
	return NormalizePayoutStatus(status) == PayoutProcessed
}

func NormalizePaymentStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "created":
		return "created"
	case "authorized":
		return "authorized"
	case "captured":
		return "captured"
	case "failed":
		return "failed"
	case "refunded":
		return "refunded"
	case "partially_refunded", "partial_refund":
		return "partially_refunded"
	default:
		return "unknown"
	}
}
