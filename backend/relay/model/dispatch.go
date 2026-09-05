package model

import (
	"encoding/json"
	"time"
)

// DispatchStatus represents the lifecycle state of a single dispatch attempt.
type DispatchStatus string

const (
	// PENDING — dispatch work created, governance not yet evaluated.
	DispatchStatusPending DispatchStatus = "PENDING"

	// HELD — governance blocked execution (execution window, tenant policy, etc).
	DispatchStatusHeld DispatchStatus = "HELD"

	// SENT — AttemptSent written, PSP call in-flight or completed.
	// An external side effect may have occurred. Never assume failure from this state alone.
	DispatchStatusSent DispatchStatus = "SENT"

	// PROVIDER_ACKED — PSP returned 2xx with payout_id. Not final — UTR arrives later via Service 5.
	DispatchStatusProviderAcked DispatchStatus = "PROVIDER_ACKED"

	// AWAITING_PROVIDER_SIGNAL — PSP call timed out or returned uncertain response.
	// Do NOT retry without querying the PSP first — money may have already moved.
	DispatchStatusAwaitingProviderSignal DispatchStatus = "AWAITING_PROVIDER_SIGNAL"

	// FAILED_RETRYABLE — transient failure. Service 4 will retry after backoff.
	DispatchStatusFailedRetryable DispatchStatus = "FAILED_RETRYABLE"

	// FAILED_TERMINAL — permanent failure. No more retries. Service 5 will handle finality.
	DispatchStatusFailedTerminal DispatchStatus = "FAILED_TERMINAL"

	// REQUIRES_MANUAL_REVIEW — human intervention required before any retry.
	DispatchStatusRequiresManualReview DispatchStatus = "REQUIRES_MANUAL_REVIEW"
)

// GovernanceDecision is the output of the dispatch governance evaluation (Step 1.5).
type GovernanceDecision string

const (
	GovernanceAllow             GovernanceDecision = "ALLOW_DISPATCH"
	GovernanceHold              GovernanceDecision = "HOLD_DISPATCH"
	GovernanceRetryLater        GovernanceDecision = "RETRY_LATER"
	GovernanceTerminalFail      GovernanceDecision = "TERMINAL_FAIL"
	GovernanceManualReview      GovernanceDecision = "REQUIRE_MANUAL_REVIEW"
)

// RetryClass classifies what kind of retry or recovery action should be taken.
type RetryClass string

const (
	RetryClassRetryableTechnical    RetryClass = "RETRYABLE_TECHNICAL"
	RetryClassRetryableAfterBackoff RetryClass = "RETRYABLE_AFTER_BACKOFF"
	RetryClassWaitForSignal         RetryClass = "WAIT_FOR_SIGNAL"
	RetryClassNeverRetry            RetryClass = "NEVER_RETRY"
	RetryClassManualReview          RetryClass = "MANUAL_REVIEW_REQUIRED"
	RetryClassCircuitOpenHold       RetryClass = "CIRCUIT_OPEN_HOLD"
)

// Dispatch tracks a single PSP dispatch attempt for a contract.
// One contract may have multiple Dispatch rows (one per attempt_count).
// dispatch_id is minted by Service 4 and sent to the PSP as both
// the idempotency key and the reference_id for outcome correlation.
type Dispatch struct {
	DispatchID  string         `db:"dispatch_id"`
	ContractID  string         `db:"contract_id"`
	IntentID    string         `db:"intent_id"`
	TenantID    string         `db:"tenant_id"`
	TraceID     string         `db:"trace_id"`
	ConnectorID string         `db:"connector_id"`
	CorridorID  string         `db:"corridor_id"`
	AttemptCount int           `db:"attempt_count"`
	Status      DispatchStatus `db:"status"`

	// Provider idempotency key sent in the PSP request.
	// Currently equals dispatch_id but modelled separately for future connector flexibility.
	ProviderIdempotencyKey string `db:"provider_idempotency_key"`

	// CorrelationCarriersJSON is the JSON-encoded carriers embedded in the PSP request.
	// Stored so Service 4 can reconstruct what was sent without re-computing.
	CorrelationCarriersJSON json.RawMessage `db:"correlation_carriers_json"`

	// Governance fields
	DispatchGovernanceDecision     *string         `db:"dispatch_governance_decision"`
	DispatchGovernanceReasonCodes  json.RawMessage `db:"dispatch_governance_reason_codes"`

	// Execution retry fields
	RetryClass            *string    `db:"retry_class"`
	NextDispatchAttemptAt *time.Time `db:"next_dispatch_attempt_at"`

	// Provider response fields (non-authoritative — Service 5 owns final truth)
	ProviderAttemptID       *string `db:"provider_attempt_id"`
	ProviderResponseStatus  *string `db:"provider_response_status"`
	ProviderReferenceLast   *string `db:"provider_reference_last_seen"`
	ProviderRequestFingerprint *string `db:"provider_request_fingerprint"`

	// PayloadJSON stores the original OutboxPayload (from the Kafka message) at Step 1.
	// Required by the retry sweeper so it can re-run Steps 2–5 (detokenize + PSP)
	// without the original Kafka message, which is no longer available post-commit.
	// No PII — contains only token IDs, never plaintext values.
	PayloadJSON json.RawMessage `db:"payload_json"`

	// Timestamps
	CreatedAt time.Time  `db:"created_at"`
	UpdatedAt time.Time  `db:"updated_at"`
	SentAt    *time.Time `db:"sent_at"`
	AckedAt   *time.Time `db:"acked_at"`
}