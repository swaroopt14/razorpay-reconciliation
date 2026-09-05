package models

// Event receipt processing_status values (OUT-04).
const (
	EventReceiptProcessed  = "PROCESSED"
	EventReceiptConflicted = "CONFLICTED"
)

// Conflict reasons recorded on event_receipts. Original canonical_intents
// rows are never mutated when these fire.
const (
	EventConflictPayloadHashMismatch = "EVENT_PAYLOAD_HASH_MISMATCH"
	EventConflictIntentMutation      = "INTENT_MUTATION_REJECTED"
)
