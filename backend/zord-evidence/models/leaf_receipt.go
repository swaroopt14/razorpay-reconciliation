package models

import (
	"time"

	"github.com/shopspring/decimal"
)

// LeafReceiptOutcome describes what happened when a leaf event arrived.
//
//	ACCEPTED        — first time this (tenant, intent/batch, leaf_type, source_event_id)
//	                  has been seen. Written to pending_leaf_candidates.
//	DUPLICATE       — identical source_event_id already recorded for this
//	                  (tenant, intent/batch, leaf_type). Kafka at-least-once
//	                  re-delivery. Pending leaf unchanged.
//	CONFLICT        — same (tenant, intent/batch, leaf_type) but a DIFFERENT
//	                  source_event_id. A second upstream event tried to overwrite
//	                  an already-accepted leaf. The pending leaf was updated
//	                  (upsert wins latest) but the conflict is recorded here so
//	                  auditors can investigate the discrepancy.
type LeafReceiptOutcome = string

const (
	LeafReceiptAccepted  LeafReceiptOutcome = "ACCEPTED"
	LeafReceiptDuplicate LeafReceiptOutcome = "DUPLICATE"
	LeafReceiptConflict  LeafReceiptOutcome = "CONFLICT"
)

// LeafReceipt is one immutable row in evidence_leaf_receipts.
//
// Every Kafka leaf delivery writes exactly one receipt row, regardless of
// whether the leaf was new, a duplicate, or a conflict. The table is
// append-only — rows are never updated or deleted.
type LeafReceipt struct {
	ReceiptID       string           `json:"receipt_id" db:"receipt_id"`
	TenantID        string           `json:"tenant_id" db:"tenant_id"`
	ScopeType       string           `json:"scope_type" db:"scope_type"`
	ScopeRef        string           `json:"scope_ref" db:"scope_ref"`
	LeafType        string           `json:"leaf_type" db:"leaf_type"`
	LeafHash        string           `json:"leaf_hash" db:"leaf_hash"`
	SourceTopic     string           `json:"source_topic" db:"source_topic"`
	SourceEventID   *string          `json:"source_event_id" db:"source_event_id"`
	// TraceID / SchemaVersion / EventVersion preserve the causation/source
	// metadata from the upstream event that produced this leaf delivery, so
	// RCA/audit can trace a receipt back to the exact originating operation
	// and version — not just the leaf hash.
	TraceID       *string          `json:"trace_id,omitempty" db:"trace_id"`
	SchemaVersion string           `json:"schema_version,omitempty" db:"schema_version"`
	EventVersion  string           `json:"event_version,omitempty" db:"event_version"`
	AmountMinor     *decimal.Decimal `json:"amount_minor" db:"amount_minor"`
	Currency        *string          `json:"currency" db:"currency"`
	ClientReference *string          `json:"client_reference" db:"client_reference"`
	BankReference   *string          `json:"bank_reference" db:"bank_reference"`
	ReceiptStatus   string           `json:"receipt_status" db:"receipt_status"`
	DiscardReason   *string          `json:"discard_reason" db:"discard_reason"`
	ReceivedAt      time.Time        `json:"received_at" db:"received_at"`
}
