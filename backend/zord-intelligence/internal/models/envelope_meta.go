package models

// envelope_meta.go — Kafka envelope metadata carried via context (refactor Phase 1).
//
// kafka/consumer.go computes this once per message (payload hash + topic) and
// attaches it to the per-message context before calling the handler.
// internal/services reads it back via EnvelopeMetaFromContext and folds it
// into a persistence.EventMeta for the event_receipts idempotency gate.
//
// WHY HERE AND NOT internal/persistence?
// kafka/consumer.go is intentionally decoupled from internal/persistence (see
// the package doc in kafka/consumer.go) — it only knows about internal/models.
// Keeping this context carrier in models preserves that boundary.
//
// WHY DEFAULTS INSTEAD OF ERRORS?
// event_source/event_version do not exist on the upstream envelope yet
// (team decision, 2026-07-13): ZPI must never block on their absence. Missing
// values default to "unknown-source"/"legacy" so the idempotency ledger still
// functions correctly — it just carries less lineage until upstream ships the
// real fields.

import "context"

// EnvelopeMeta is the subset of Kafka message identity known before the
// typed event body is decoded.
type EnvelopeMeta struct {
	EventSource  string // origin service; "unknown-source" until upstream sends one
	EventType    string // Kafka topic name
	EventVersion string // envelope schema version; "legacy" until upstream sends one
	PayloadHash  string // sha256 hex over the raw Kafka message value
}

type envelopeMetaCtxKey struct{}

// DefaultEventSource is used until the upstream envelope carries a real
// origin-service field. All ZPI Grade A/B topics are currently published by
// zord-relay, so this is accurate today — swap for envelope-derived values
// once upstream ships them.
const DefaultEventSource = "zord-relay"

// DefaultEventVersion is used until the upstream envelope carries a real
// schema/event version field.
const DefaultEventVersion = "legacy"

// ContextWithEnvelopeMeta attaches Kafka envelope metadata to ctx. Call once
// per message, before invoking the topic handler.
func ContextWithEnvelopeMeta(ctx context.Context, meta EnvelopeMeta) context.Context {
	return context.WithValue(ctx, envelopeMetaCtxKey{}, meta)
}

// EnvelopeMetaFromContext returns the envelope metadata attached to ctx, or
// safe defaults if none was attached (e.g. in tests that call handlers directly).
func EnvelopeMetaFromContext(ctx context.Context) EnvelopeMeta {
	if m, ok := ctx.Value(envelopeMetaCtxKey{}).(EnvelopeMeta); ok {
		if m.EventSource == "" {
			m.EventSource = DefaultEventSource
		}
		if m.EventVersion == "" {
			m.EventVersion = DefaultEventVersion
		}
		return m
	}
	return EnvelopeMeta{EventSource: DefaultEventSource, EventVersion: DefaultEventVersion}
}
