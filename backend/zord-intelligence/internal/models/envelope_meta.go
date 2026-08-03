package models

// envelope_meta.go — Kafka envelope metadata carried via context (refactor Phase 1).
//
// kafka/consumer.go computes this once per message (payload hash + topic +
// a best-effort peek at the envelope's own event_type/schema_version fields)
// and attaches it to the per-message context before calling the handler.
// internal/services reads it back via EnvelopeMetaFromContext and folds it
// into a persistence.EventMeta for the event_receipts idempotency gate.
//
// WHY HERE AND NOT internal/persistence?
// kafka/consumer.go is intentionally decoupled from internal/persistence (see
// the package doc in kafka/consumer.go) — it only knows about internal/models.
// Keeping this context carrier in models preserves that boundary.
//
// WHY DEFAULTS INSTEAD OF ERRORS?
// event_source does not exist on the upstream envelope yet (team decision,
// 2026-07-13): ZPI must never block on their absence. Missing values default
// to "unknown-source" so the idempotency ledger still functions correctly —
// it just carries less lineage until upstream ships the real field.
//
// TRANSPORT vs DOMAIN IDENTITY (corrective-action-report P1-01):
// EventType and SourceTopic are deliberately separate fields. zord-relay's
// OutboxEvent already carries a real domain event_type (e.g. "DispatchCreated",
// "AttemptSent" — see zord-relay/model/event.go) distinct from the Kafka topic
// it's published on; a single topic can carry more than one domain event type
// over time. SourceTopic is always the Kafka topic name (transport routing);
// EventType is the domain type read out of the envelope payload, falling back
// to the topic name only for the two flat, non-RelayEvent-enveloped topics
// (dlq.event, payments.intent.dlq) that carry no event_type field at all.

import "context"

// EnvelopeMeta is the subset of Kafka message identity known before the
// typed event body is decoded.
type EnvelopeMeta struct {
	EventSource  string // origin service; "unknown-source" until upstream sends one
	SourceTopic  string // Kafka topic name — transport identity, always known
	EventType    string // domain event type from the envelope payload; falls back to SourceTopic when absent
	EventVersion string // envelope schema_version; "legacy" until upstream sends one
	PayloadHash  string // sha256 hex over the raw Kafka message value
}

// SupportedSchemaVersions lists the schema_version values this build knows
// how to process. Every live producer in this system sends "v1" today (see
// zord-relay/services/*.go, zord-outcome-engine, zord-intent-engine —
// SchemaVersion: "v1" at every OutboxEvent construction site). Bump this
// allowlist deliberately when a new major version is intentionally rolled
// out; never widen it to silently accept an unrecognized version.
var SupportedSchemaVersions = map[string]bool{
	"v1": true,
}

// IsKnownSchemaVersion reports whether v is safe to process. Empty and
// DefaultEventVersion ("legacy") are always accepted — they mean the
// producer doesn't send schema_version yet, which is expected and not a
// version mismatch. Anything else must be in SupportedSchemaVersions;
// unrecognized values (a genuinely new major version this build doesn't
// understand) are rejected so the caller can route the event to the DLQ
// instead of silently mis-processing it (corrective-action-report P1-01).
func IsKnownSchemaVersion(v string) bool {
	return v == "" || v == DefaultEventVersion || SupportedSchemaVersions[v]
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
