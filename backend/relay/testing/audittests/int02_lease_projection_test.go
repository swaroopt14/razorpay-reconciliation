package audittests

// INT-02: "Fix outbox lease projection to include schema_version,
// payload_hash and commercial lineage fields." See
// zord-intent-engine/testing/int02_lease_projection_test.go for the full
// background. This is the "...and Relay" half of the acceptance test:
// loads the same shared fixture (backend/shared/outbox-lease-fixture/
// lease_fixture.json) and confirms Relay's own model.IntentOutboxEvent
// struct genuinely decodes real values for all 30 required v1 fields, not
// just that its Go fields happen to compile.
//
// Run with: go test ./testing/... -run TestINT02 -v

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"zord-relay/model"
)

// int02RequiredV1Fields mirrors zord-intent-engine's list of the same name
// -- the exact 30 columns INT-02 adds to the lease projection. Duplicated
// here (not imported) because the two repos are separate Go modules with
// no shared import path.
var int02RequiredV1Fields = []string{
	"schema_version", "payload_hash", "source_row_ref", "source_system",
	"client_batch_ref", "salient_hash", "canonical_row_hash", "input_facts_hash",
	"raw_row_hash", "idempotency_key", "intent_type", "canonical_version",
	"intended_execution_at", "constraints", "beneficiary_type", "pii_tokens",
	"beneficiary", "intent_status", "confidence_score", "canonical_snapshot_ref",
	"nir_snapshot_ref", "governance_snapshot_ref", "provider_hint",
	"request_fingerprint", "routing_hints_json", "business_state",
	"duplicate_risk_flag", "mapping_profile_version", "beneficiary_fingerprint",
	"aggregate_confidence_score",
}

// int02FindBlankFields mirrors zord-intent-engine's helper of the same
// name -- reflects over v's `json`-tagged fields and returns the tag name
// of every field in fieldsToCheck whose value is the zero value for its
// type.
func int02FindBlankFields(v interface{}, fieldsToCheck []string) []string {
	check := make(map[string]bool, len(fieldsToCheck))
	for _, f := range fieldsToCheck {
		check[f] = true
	}

	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Ptr {
		rv = rv.Elem()
	}
	rt := rv.Type()

	var blank []string
	for i := 0; i < rt.NumField(); i++ {
		tag := rt.Field(i).Tag.Get("json")
		name := strings.Split(tag, ",")[0]
		if name == "" || name == "-" || !check[name] {
			continue
		}
		fv := rv.Field(i)
		if fv.Kind() == reflect.Ptr {
			if fv.IsNil() {
				blank = append(blank, name)
				continue
			}
			fv = fv.Elem()
		}
		if fv.IsZero() {
			blank = append(blank, name)
		}
	}
	return blank
}

// TestINT02_RelayDecodesAllFrozenV1Fields loads the shared fixture and
// unmarshals it directly into the real model.IntentOutboxEvent -- proving
// Relay's consumer-side struct, which was already provisioned with all 30
// fields before this fix landed on the intent-engine side, genuinely
// decodes real values rather than just compiling with matching field
// names.
func TestINT02_RelayDecodesAllFrozenV1Fields(t *testing.T) {
	data, err := os.ReadFile("../../../shared/outbox-lease-fixture/lease_fixture.json")
	if err != nil {
		t.Fatalf("failed to read shared fixture: %v", err)
	}

	var evt model.IntentOutboxEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("failed to unmarshal shared fixture into model.IntentOutboxEvent: %v", err)
	}

	blank := int02FindBlankFields(&evt, int02RequiredV1Fields)
	if len(blank) > 0 {
		t.Fatalf("Relay's IntentOutboxEvent came back with %d blank required v1 field(s) after decoding the shared fixture: %v",
			len(blank), blank)
	}
	t.Logf("CONFIRMED: Relay's IntentOutboxEvent correctly decodes all %d required v1 fields from the shared lease-JSON fixture.", len(int02RequiredV1Fields))
}
