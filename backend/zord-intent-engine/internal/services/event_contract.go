package services

import "fmt"

// EventTypeCanonicalIntentCreatedV1 is the one outbox event type/version this
// producer is currently allowed to publish. Every canonical-intent producer
// call site (file-originated, webhook-originated) must use this constant
// instead of a hand-rolled literal, so a future accidental type/version drift
// (e.g. a copy-pasted "v2") is caught here instead of silently reaching
// Relay/Outcome as if it were v1.
const EventTypeCanonicalIntentCreatedV1 = "intent.created.v1"

// supportedOutboxEventTypes is the allow-list of event_type/version
// combinations this producer may publish to the Service 2 outbox. There is
// no separate minor-version axis today: the full string (including its
// trailing "vN") is the compatibility unit, so any change to it — including
// a "v1.1" or "v2" — is treated as a new, unsupported combination until it
// is explicitly added here alongside a corresponding Relay/Outcome contract
// change.
var supportedOutboxEventTypes = map[string]bool{
	EventTypeCanonicalIntentCreatedV1: true,
}

// ErrUnsupportedEventType is returned when a producer call site attempts to
// build an outbox event with an eventType that is not allow-listed. Callers
// must not publish the event; per the cross-service event contract, unknown
// major versions are rejected rather than decoded as the latest known
// version.
type ErrUnsupportedEventType struct {
	EventType string
}

func (e *ErrUnsupportedEventType) Error() string {
	return fmt.Sprintf("unsupported outbox event type/version: %q", e.EventType)
}

// IsSupportedOutboxEventType reports whether eventType is allow-listed for
// publication by this producer.
func IsSupportedOutboxEventType(eventType string) bool {
	return supportedOutboxEventTypes[eventType]
}
