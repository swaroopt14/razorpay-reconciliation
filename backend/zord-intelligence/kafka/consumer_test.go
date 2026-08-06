package kafka

import (
	"errors"
	"fmt"
	"testing"

	"github.com/zord/zord-intelligence/internal/models"
)

// corrective-action-report P1-01: the domain event_type/schema_version must
// be read out of the raw envelope bytes, distinct from the Kafka topic name,
// and must fall back cleanly for topics that carry neither field.
func TestExtractEnvelopeFieldsBestEffort(t *testing.T) {
	tests := []struct {
		name          string
		payload       string
		wantEventType string
		wantSchemaVer string
	}{
		{
			name:          "RelayEvent-enveloped payload",
			payload:       `{"event_id":"e1","event_type":"DispatchCreated","schema_version":"v1","payload":{}}`,
			wantEventType: "DispatchCreated",
			wantSchemaVer: "v1",
		},
		{
			name:          "flat DLQItemEvent payload carries neither field",
			payload:       `{"dlq_id":"d1","tenant_id":"t1","stage":"canonicalize"}`,
			wantEventType: "",
			wantSchemaVer: "",
		},
		{
			name:          "malformed JSON returns zero values, never errors",
			payload:       `not json`,
			wantEventType: "",
			wantSchemaVer: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotType, gotVer := extractEnvelopeFieldsBestEffort([]byte(tt.payload))
			if gotType != tt.wantEventType {
				t.Errorf("eventType = %q, want %q", gotType, tt.wantEventType)
			}
			if gotVer != tt.wantSchemaVer {
				t.Errorf("schemaVersion = %q, want %q", gotVer, tt.wantSchemaVer)
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
