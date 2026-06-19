package models

import "encoding/json"

// ClassifyDLQ returns the correct DLQStatus for a given reason code or stage.
//
// NEEDS_MANUAL_REVIEW — the tenant's file has bad or inconsistent data.
//                       The tenant must fix their file and resubmit.
//
// DLQ_TERMINAL        — a system, infrastructure, or security failure.
//                       The tenant cannot fix this by changing their file.
//
// Note on EMPTY_PAYLOAD: fires when event.Payload has zero bytes (vault returned
// empty ciphertext or Kafka message was corrupt). A CSV row with missing fields
// still produces non-zero JSON bytes and fails at STRUCTURAL_VALIDATION instead.
// So EMPTY_PAYLOAD is always DLQ_TERMINAL.
func ClassifyDLQ(reasonCode string) string {
    switch reasonCode {

    // ── NEEDS_MANUAL_REVIEW ──────────────────────────────────────────────────
    // Policy / semantic failures — wrong values in the tenant's file

    case "INVALID_EXECUTION_AT_FORMAT",
        "EXECUTION_WINDOW_EXPIRED",
        "NEGATIVE_AMOUNT_NOT_ALLOWED",
        "BANK_REQUIRES_IFSC",
        "UPI_REQUIRES_VPA",
        "BANK_WITH_VPA_INVALID",
        "UPI_WITH_IFSC_INVALID",
        "ROUTING_INCONSISTENT_UPI",
        "ROUTING_INCONSISTENT_BANK",
        "SEMANTIC_INVALID":
        return DLQStatusManualReview

    // Validator stage names — structural or semantic validation failure
    // means missing or malformed fields in the tenant's CSV
    case "STRUCTURAL_VALIDATION",
        "SEMANTIC_VALIDATION":
        return DLQStatusManualReview

    // Pre-guard failures — business rule violations from intent content
    case "TENANT_CORRIDOR_NOT_ALLOWED", // tenant sent non-INR currency
        "DEADLINE_EXPIRED",             // deadline in tenant's constraints has passed
        "PAYMENT_WINDOW_CLOSED":        // NEFT cutoff — tenant submitted too late
        return DLQStatusManualReview

    // ── DLQ_TERMINAL ─────────────────────────────────────────────────────────
    // Transport / identity guard failures — our infrastructure missing metadata

    case "EMPTY_PAYLOAD",          // zero bytes in Kafka message — vault or broker issue
        "MISSING_TRACE_ID",        // our system must always set this
        "MISSING_ENVELOPE_ID",     // our system must always set this
        "MISSING_TENANT_ID",       // our system must always set this
        "MISSING_OBJECT_REF":      // our system must always set this
        return DLQStatusTerminal

    // Security / integrity failures — our vault or hashing layer failed
    case "PAYLOAD_DECRYPTION_FAILED",
        "MISSING_RAW_PAYLOAD_HASH",
        "INVALID_RAW_PAYLOAD_HASH_LENGTH",
        "RAW_PAYLOAD_INTEGRITY_FAILED":
        return DLQStatusTerminal

    // JSON parse failure — zord-edge produced malformed JSON from the CSV shape
    case "INVALID_JSON_PAYLOAD":
        return DLQStatusTerminal

    // Unknown reason code — default to terminal so ops investigates
    default:
        return DLQStatusTerminal
    }
}

// DLQIntentContext is the JSON shape stored in intent_context column.
type DLQIntentContext struct {
    BeneficiaryName string `json:"beneficiary_name"`
    Amount          string `json:"amount"`         // "value currency" e.g. "1000.00 INR"
    Currency        string `json:"currency"`
    IdempotencyKey  string `json:"idempotency_key"`
    IntentID        string `json:"intent_id,omitempty"`
    SourceSystem    string `json:"source_system,omitempty"`
}

// BuildIntentContext builds the intent_context JSON from a ParsedIncomingIntent.
// Returns nil if the status is DLQ_TERMINAL — context is only stored for manual review.
func BuildIntentContext(status string, parsed ParsedIncomingIntent) json.RawMessage {
    if status != DLQStatusManualReview {
        return nil
    }
    ctx := DLQIntentContext{
        BeneficiaryName: parsed.Beneficiary.Name,
        Amount:          parsed.Amount.Value,
        Currency:        parsed.Amount.Currency,
        IdempotencyKey:  parsed.IdempotencyKey,
        IntentID:        parsed.IntentID,
        SourceSystem:    parsed.SourceSystem,
    }
    b, _ := json.Marshal(ctx)
    return b
}

