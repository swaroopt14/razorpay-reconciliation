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
// event_source (INTEL-05: the envelope's real source_service field, e.g.
// zord-outcome-engine) is required for every supported-event topic — see the
// required-field gate in kafka/consumer.go, which routes a missing value to
// the DLQ rather than defaulting it. The DefaultEventSource fallback below
// only still applies to the handful of flat, non-RelayEvent-enveloped topics
// that carry no source_service field at all (dlq.event, corridor.health.tick,
// sla.timer.tick) and are exempt from that gate — for those, ZPI must never
// block, so a missing value there is defaulted, not rejected.
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
	EventSource  string // domain producer (INTEL-05: envelope's source_service, e.g. zord-outcome-engine) — never the transport hop; "" only for the 3 topics exempt from the required-field gate, defaulted to DefaultEventSource downstream
	SourceTopic  string // Kafka topic name — transport identity, always known
	EventType    string // domain event type from the envelope payload; falls back to SourceTopic when absent
	EventVersion string // envelope schema_version; "legacy" until upstream sends one
	PayloadHash  string // sha256 hex over the raw Kafka message value
	TraceID      string // required event-contract field (clarification doc §13); "" when upstream omits it, no synthetic fallback
	TenantID     string // required event-contract field (INTEL-03); "" when upstream omits it, no synthetic fallback — never the Kafka partition key, which is not reliably tenant_id (see buildDLQRecord in kafka/consumer.go)
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

// IsKnownSchemaVersion reports whether v is a recognized *shape* — it does
// NOT by itself decide whether v is acceptable on a given topic from a given
// source. Empty and DefaultEventVersion ("legacy") both pass this check
// unconditionally (they're recognized values, not garbage), and anything in
// SupportedSchemaVersions passes; an unrecognized value (a genuinely new
// major version this build doesn't understand) fails, so the caller can
// route the event to the DLQ instead of silently mis-processing it
// (corrective-action-report P1-01).
//
// INTEL-06: passing this check is necessary but not sufficient for
// empty/"legacy" values on a live (non-exempt) topic — the caller in
// kafka/consumer.go additionally requires source_service to be on an
// explicit backfill allow-list before accepting them there. This function
// stays permissive by design; the topic/source-scoped strictness lives at
// the call site, not here.
func IsKnownSchemaVersion(v string) bool {
	return v == "" || v == DefaultEventVersion || SupportedSchemaVersions[v]
}

type envelopeMetaCtxKey struct{}

// DefaultEventSource is the fallback EventSource for the 3 topics with no
// source_service field at all (dlq.event, corridor.health.tick,
// sla.timer.tick — see requiredFieldExemptTopics in kafka/consumer.go).
// Every other topic's real source_service is required (INTEL-05) and never
// falls back to this constant.
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
