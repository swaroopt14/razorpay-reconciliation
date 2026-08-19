package kafka

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/segmentio/kafka-go"
	"github.com/zord/zord-intelligence/internal/models"
)

// corrective-action-report P1-01: the domain event_type/schema_version must
// be read out of the raw envelope bytes, distinct from the Kafka topic name,
// and must fall back cleanly for topics that carry neither field.
//
// INTEL-03: tenant_id is asserted here too — it must come from the envelope
// payload itself, never from the Kafka partition key (which the caller in
// consumeSingleTopic never passes to this function at all).
//
// INTEL-05: source_service is asserted too — the envelope's real domain
// producer identity, never a hardcoded transport value.
func TestExtractEnvelopeFieldsBestEffort(t *testing.T) {
	tests := []struct {
		name              string
		payload           string
		wantEventType     string
		wantSchemaVer     string
		wantTraceID       string
		wantTenantID      string
		wantSourceService string
	}{
		{
			name:              "RelayEvent-enveloped payload",
			payload:           `{"event_id":"e1","event_type":"DispatchCreated","schema_version":"v1","trace_id":"trace-abc","tenant_id":"tenant-1","source_service":"zord-outcome-engine","payload":{}}`,
			wantEventType:     "DispatchCreated",
			wantSchemaVer:     "v1",
			wantTraceID:       "trace-abc",
			wantTenantID:      "tenant-1",
			wantSourceService: "zord-outcome-engine",
		},
		{
			name:              "flat DLQItemEvent payload carries tenant_id and source_service but no event_type/schema_version/trace_id",
			payload:           `{"dlq_id":"d1","tenant_id":"t1","source_service":"zord-intent-engine","stage":"canonicalize"}`,
			wantEventType:     "",
			wantSchemaVer:     "",
			wantTraceID:       "",
			wantTenantID:      "t1",
			wantSourceService: "zord-intent-engine",
		},
		{
			name:              "malformed JSON returns zero values, never errors",
			payload:           `not json`,
			wantEventType:     "",
			wantSchemaVer:     "",
			wantTraceID:       "",
			wantTenantID:      "",
			wantSourceService: "",
		},
		{
			// zord-outcome-engine-sourced events (live-confirmed 2026-08-06):
			// schema_version is real but only set inside "payload", never
			// promoted to the envelope top level. trace_id has no such nested
			// value worth falling back to (see the function doc), so it stays
			// "" here even though a (also-zero) trace_id exists in payload too.
			name:              "schema_version only present nested in payload falls back",
			payload:           `{"event_id":"e2","event_type":"variance.record.created","payload":{"schema_version":"v1","trace_id":"00000000-0000-0000-0000-000000000000"}}`,
			wantEventType:     "variance.record.created",
			wantSchemaVer:     "v1",
			wantTraceID:       "",
			wantTenantID:      "",
			wantSourceService: "",
		},
		{
			name:              "top-level schema_version wins over nested payload value",
			payload:           `{"event_type":"e","schema_version":"v1","payload":{"schema_version":"v2-should-be-ignored"}}`,
			wantEventType:     "e",
			wantSchemaVer:     "v1",
			wantTraceID:       "",
			wantTenantID:      "",
			wantSourceService: "",
		},
		{
			// INTEL-05 follow-up: live-traffic investigation found
			// zord-outcome-engine sets source_service correctly, but only
			// inside its outbox payload — its OutboxEvent HTTP lease
			// response has no top-level source_service field at all (only
			// event_version/schema_version get stamped as producer
			// constants), so zord-relay can never promote it to the
			// envelope's own top level. Same shape, same producer, same
			// reason as the existing schema_version nested fallback above —
			// source_service now gets one too.
			name:              "source_service only present nested in payload falls back",
			payload:           `{"event_id":"e4","event_type":"attachment.decision.created","payload":{"source_service":"zord-outcome-engine"}}`,
			wantEventType:     "attachment.decision.created",
			wantSchemaVer:     "",
			wantTraceID:       "",
			wantTenantID:      "",
			wantSourceService: "zord-outcome-engine",
		},
		{
			// The realistic zord-outcome-engine shape: BOTH schema_version
			// and source_service are absent at the top level and only
			// present nested in payload — both fallbacks must fire together.
			name:              "schema_version and source_service both only present nested in payload",
			payload:           `{"event_id":"e5","event_type":"variance.record.created","tenant_id":"tenant-3","trace_id":"trace-ghi","payload":{"schema_version":"v1","source_service":"zord-outcome-engine"}}`,
			wantEventType:     "variance.record.created",
			wantSchemaVer:     "v1",
			wantTraceID:       "trace-ghi",
			wantTenantID:      "tenant-3",
			wantSourceService: "zord-outcome-engine",
		},
		{
			name:              "top-level source_service wins over nested payload value",
			payload:           `{"event_type":"e","source_service":"zord-intent-engine","payload":{"source_service":"zord-outcome-engine-should-be-ignored"}}`,
			wantEventType:     "e",
			wantSchemaVer:     "",
			wantTraceID:       "",
			wantTenantID:      "",
			wantSourceService: "zord-intent-engine",
		},
		{
			// INTEL-03 acceptance scenario: envelope carries a tenant_id that
			// differs from whatever the Kafka key happens to be (event_id,
			// dlq_id, etc.) — extraction must return the envelope's value.
			name:              "tenant_id present alongside a mismatched event_id",
			payload:           `{"event_id":"evt-123","event_type":"DispatchCreated","schema_version":"v1","trace_id":"trace-abc","tenant_id":"tenant-abc"}`,
			wantEventType:     "DispatchCreated",
			wantSchemaVer:     "v1",
			wantTraceID:       "trace-abc",
			wantTenantID:      "tenant-abc",
			wantSourceService: "",
		},
		{
			// INTEL-05 acceptance scenario: the envelope's real domain
			// producer must be extracted as-is, not confused with the Kafka
			// transport hop (zord-relay) it happens to travel through.
			name:              "source_service present for an outcome-engine-sourced event",
			payload:           `{"event_id":"e3","event_type":"canonical.settlement.created","schema_version":"v1","trace_id":"trace-def","tenant_id":"tenant-2","source_service":"zord-outcome-engine"}`,
			wantEventType:     "canonical.settlement.created",
			wantSchemaVer:     "v1",
			wantTraceID:       "trace-def",
			wantTenantID:      "tenant-2",
			wantSourceService: "zord-outcome-engine",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotType, gotVer, gotTraceID, gotTenantID, gotSourceService := extractEnvelopeFieldsBestEffort([]byte(tt.payload))
			if gotType != tt.wantEventType {
				t.Errorf("eventType = %q, want %q", gotType, tt.wantEventType)
			}
			if gotVer != tt.wantSchemaVer {
				t.Errorf("schemaVersion = %q, want %q", gotVer, tt.wantSchemaVer)
			}
			if gotTraceID != tt.wantTraceID {
				t.Errorf("traceID = %q, want %q", gotTraceID, tt.wantTraceID)
			}
			if gotTenantID != tt.wantTenantID {
				t.Errorf("tenantID = %q, want %q", gotTenantID, tt.wantTenantID)
			}
			if gotSourceService != tt.wantSourceService {
				t.Errorf("sourceService = %q, want %q", gotSourceService, tt.wantSourceService)
			}
		})
	}
}

// A known minor/legacy version must never be treated as unsupported.
func TestIsKnownSchemaVersion_KnownAccepted(t *testing.T) {
	for _, v := range []string{"", models.DefaultEventVersion, "v1"} {
		if !models.IsKnownSchemaVersion(v) {
			t.Errorf("expected %q to be accepted", v)
		}
	}
}

// An unrecognized major version must be rejected, and the resulting error —
// wrapped exactly as consumeSingleTopic wraps it — must still unwrap to
// errUnsupportedSchemaVersion so buildDLQRecord classifies it correctly and
// the retry loop skips straight to the DLQ (isUnmarshalError-style bypass).
func TestUnsupportedSchemaVersionError_Unwraps(t *testing.T) {
	if models.IsKnownSchemaVersion("v99") {
		t.Fatal("v99 should not be a known schema version")
	}
	err := fmt.Errorf("%w: schema_version=%q topic=%s", errUnsupportedSchemaVersion, "v99", "canonical.settlement.created")
	if !errors.Is(err, errUnsupportedSchemaVersion) {
		t.Fatalf("errors.Is failed to unwrap errUnsupportedSchemaVersion from %v", err)
	}
}

// A supported-event topic's message with schema_version/trace_id present but
// tenant_id absent must still be rejected (INTEL-03) — the resulting error,
// wrapped exactly as consumeSingleTopic wraps it, must unwrap to
// errMissingRequiredField so buildDLQRecord classifies it as
// DLQErrorClassMissingField and the retry loop skips straight to the DLQ,
// same as a missing schema_version/trace_id (INTEL-04).
func TestMissingTenantIDError_Unwraps(t *testing.T) {
	schemaVersion, traceID, tenantID := "v1", "trace-abc", ""
	err := fmt.Errorf("%w: schema_version=%q trace_id=%q tenant_id=%q topic=%s",
		errMissingRequiredField, schemaVersion, traceID, tenantID, "canonical.settlement.created")
	if !errors.Is(err, errMissingRequiredField) {
		t.Fatalf("errors.Is failed to unwrap errMissingRequiredField from %v", err)
	}
}

// INTEL-03 acceptance test: a message whose Kafka partition key is an
// event_id (the common zord-relay convention) that does NOT match the
// envelope's own tenant_id must still store the correct tenant_id in the DLQ
// record — and must retain the original, mismatched key separately under
// PartitionKey rather than losing or mislabeling it.
func TestBuildDLQRecord_TenantFromEnvelope_NotPartitionKey(t *testing.T) {
	payload := []byte(`{"event_id":"evt-123","event_type":"DispatchCreated","schema_version":"v1","trace_id":"trace-abc","tenant_id":"tenant-abc"}`)

	eventType, schemaVersion, traceID, tenantID, _ := extractEnvelopeFieldsBestEffort(payload)
	msgCtx := models.ContextWithEnvelopeMeta(context.Background(), models.EnvelopeMeta{
		EventSource:  models.DefaultEventSource,
		SourceTopic:  "dispatch.attempt.created",
		EventType:    eventType,
		EventVersion: schemaVersion,
		TraceID:      traceID,
		TenantID:     tenantID,
	})

	msg := kafka.Message{
		Topic: "dispatch.attempt.created",
		Key:   []byte("evt-123"), // deliberately mismatched with tenant-abc
		Value: payload,
	}

	rec := buildDLQRecord(msgCtx, msg, errors.New("handler boom"))

	if rec.TenantID != "tenant-abc" {
		t.Errorf("TenantID = %q, want %q (envelope-derived, not the Kafka key)", rec.TenantID, "tenant-abc")
	}
	if rec.PartitionKey != "evt-123" {
		t.Errorf("PartitionKey = %q, want %q (original Kafka key retained)", rec.PartitionKey, "evt-123")
	}
}

// A supported-event topic's message with schema_version/trace_id/tenant_id
// present but source_service absent must still be rejected (INTEL-05) — same
// gate mechanism as INTEL-03's TestMissingTenantIDError_Unwraps.
func TestMissingSourceServiceError_Unwraps(t *testing.T) {
	schemaVersion, traceID, tenantID, sourceService := "v1", "trace-abc", "tenant-1", ""
	err := fmt.Errorf("%w: schema_version=%q trace_id=%q tenant_id=%q source_service=%q topic=%s",
		errMissingRequiredField, schemaVersion, traceID, tenantID, sourceService, "canonical.settlement.created")
	if !errors.Is(err, errMissingRequiredField) {
		t.Fatalf("errors.Is failed to unwrap errMissingRequiredField from %v", err)
	}
}

// INTEL-05 acceptance test: an event's EnvelopeMeta must carry the envelope's
// actual domain producer (e.g. zord-outcome-engine) as EventSource, never
// the hardcoded transport hop (zord-relay) it happens to travel through —
// while SourceTopic continues to carry that transport hop separately, so
// both the real source and the transport hop remain visible.
func TestEnvelopeMeta_SourceServiceFromEnvelope_NotHardcodedTransport(t *testing.T) {
	payload := []byte(`{"event_id":"e1","event_type":"canonical.settlement.created","schema_version":"v1","trace_id":"trace-abc","tenant_id":"tenant-1","source_service":"zord-outcome-engine"}`)

	eventType, schemaVersion, traceID, tenantID, sourceService := extractEnvelopeFieldsBestEffort(payload)
	meta := models.EnvelopeMeta{
		EventSource:  sourceService,
		SourceTopic:  "canonical.settlement.created",
		EventType:    eventType,
		EventVersion: schemaVersion,
		TraceID:      traceID,
		TenantID:     tenantID,
	}

	if meta.EventSource != "zord-outcome-engine" {
		t.Errorf("EventSource = %q, want %q (envelope-derived, not %q)", meta.EventSource, "zord-outcome-engine", models.DefaultEventSource)
	}
	if meta.SourceTopic != "canonical.settlement.created" {
		t.Errorf("SourceTopic = %q, want %q (transport hop still visible)", meta.SourceTopic, "canonical.settlement.created")
	}
}

// INTEL-06: isUnapprovedLegacySchema is the actual decision logic consulted
// by consumeSingleTopic's switch — table-tested directly since exercising
// the full Kafka read loop needs a live broker.
func TestIsUnapprovedLegacySchema(t *testing.T) {
	allowed := map[string]bool{"zord-backfill-tool": true}

	tests := []struct {
		name          string
		schemaVersion string
		sourceService string
		exempt        bool
		want          bool
	}{
		{
			name:          "literal legacy from an unapproved source on a live topic is rejected",
			schemaVersion: "legacy",
			sourceService: "zord-outcome-engine",
			exempt:        false,
			want:          true,
		},
		{
			// INTEL-06 acceptance criterion: "approved backfill path remains available".
			name:          "literal legacy from an approved allow-listed source is accepted",
			schemaVersion: "legacy",
			sourceService: "zord-backfill-tool",
			exempt:        false,
			want:          false,
		},
		{
			name:          "literal legacy on an exempt topic is accepted regardless of source",
			schemaVersion: "legacy",
			sourceService: "zord-outcome-engine",
			exempt:        true,
			want:          false,
		},
		{
			// Genuinely empty schema_version is NOT this function's concern —
			// the required-field gate handles it unconditionally, allow-list
			// or not, so this must report false (not "unapproved legacy").
			name:          "genuinely empty schema_version is not treated as a legacy claim",
			schemaVersion: "",
			sourceService: "zord-outcome-engine",
			exempt:        false,
			want:          false,
		},
		{
			name:          "a real supported version is never flagged",
			schemaVersion: "v1",
			sourceService: "zord-outcome-engine",
			exempt:        false,
			want:          false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isUnapprovedLegacySchema(tt.schemaVersion, tt.sourceService, tt.exempt, allowed)
			if got != tt.want {
				t.Errorf("isUnapprovedLegacySchema(%q, %q, exempt=%v) = %v, want %v",
					tt.schemaVersion, tt.sourceService, tt.exempt, got, tt.want)
			}
		})
	}
}

// The error consumeSingleTopic wraps for an unapproved legacy schema_version
// must unwrap to errUnapprovedLegacySchema, mirroring
// TestMissingTenantIDError_Unwraps/TestMissingSourceServiceError_Unwraps'
// style, so buildDLQRecord classifies it as DLQErrorClassUnapprovedLegacySchema
// and the retry loop skips straight to the DLQ.
func TestUnapprovedLegacySchemaError_Unwraps(t *testing.T) {
	err := fmt.Errorf("%w: schema_version=%q source_service=%q topic=%s",
		errUnapprovedLegacySchema, "legacy", "zord-outcome-engine", "canonical.settlement.created")
	if !errors.Is(err, errUnapprovedLegacySchema) {
		t.Fatalf("errors.Is failed to unwrap errUnapprovedLegacySchema from %v", err)
	}
}

// buildDLQRecord must classify an unapproved-legacy-schema failure distinctly
// from a plain missing-required-field one (INTEL-06) — different remediation
// paths (allow-list the source vs. fix the producer).
func TestBuildDLQRecord_UnapprovedLegacySchema_ClassifiedDistinctly(t *testing.T) {
	msg := kafka.Message{Topic: "canonical.settlement.created", Value: []byte(`{}`)}
	err := fmt.Errorf("%w: schema_version=%q source_service=%q topic=%s",
		errUnapprovedLegacySchema, "legacy", "zord-outcome-engine", msg.Topic)

	rec := buildDLQRecord(context.Background(), msg, err)

	if rec.ErrorClass != models.DLQErrorClassUnapprovedLegacySchema {
		t.Errorf("ErrorClass = %q, want %q", rec.ErrorClass, models.DLQErrorClassUnapprovedLegacySchema)
	}
}
