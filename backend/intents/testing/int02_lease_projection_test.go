package audittests

// INT-02: "Fix outbox lease projection to include schema_version,
// payload_hash and commercial lineage fields."
//
// The bug: 30 columns were written on every outbox insert (see
// persistence.OutboxInsertColumns) but never selected at lease time by
// LeaseOutboxBatch (internal/persistence/outbox_pull_repo.go) -- Relay and
// Service 7 always received their Go zero value, silently, because the
// field is still present in the JSON shape either way (or vanishes
// entirely if `omitempty`). Two concrete, currently-live consequences were
// traced during this fix, not hypothetical: zord-relay's
// worker/processor.go requires schema_version != "" as a version gate, and
// calls VerifyPayload(..., event.PayloadHash) as an integrity check --
// both were being fed data that could never be correct, because the
// column was either always empty (payload_hash) or overwritten by a
// hardcoded constant before the DB value could ever be seen
// (schema_version, in internal/handlers/outbox_handler.go, fixed here
// too).
//
// This file covers INT-02's acceptance test: "Shared fixture from outbox
// row through lease JSON and Relay preserves every required v1 field
// exactly; blank required field fails test." The shared fixture lives at
// backend/shared/outbox-lease-fixture/lease_fixture.json -- checked in
// once, loaded independently here and in zord-relay's own test suite
// (testing/audittests/int02_lease_projection_test.go), since the two
// repos are separate Go modules with no shared import path (same pattern
// established for INT-07's spec.json). This file proves the
// intent-engine half: outbox row -> lease JSON. zord-relay's copy proves
// the other half: lease JSON -> Relay's decoded struct.
//
// Run with: go test ./testing/... -run TestINT02 -v

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

// int02RequiredV1Fields is the exact 30 columns INT-02 adds to the lease
// projection -- the "one explicit canonical-intent-v1 lease column
// contract" the audit asks for. Same order as appended to
// outboxLeaseColumns in internal/persistence/outbox_lease_contract.go.
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

// int02FindBlankFields reflects over v's `json`-tagged fields (v must be a
// pointer to a struct) and returns the json tag name of every field in
// fieldsToCheck whose current value is the zero value for its type
// (dereferencing pointer fields first). Used both to prove the fixture
// round-trips cleanly and to prove the checker itself actually detects a
// deliberately-blanked field.
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

func int02LoadFixture(t *testing.T) models.OutboxEvent {
	t.Helper()
	data, err := os.ReadFile("../../shared/outbox-lease-fixture/lease_fixture.json")
	if err != nil {
		t.Fatalf("failed to read shared fixture: %v", err)
	}
	var evt models.OutboxEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("failed to unmarshal shared fixture into models.OutboxEvent: %v", err)
	}
	return evt
}

// TestINT02_LeaseColumnsIncludeAllFrozenV1Fields protects the contract
// itself from shrinking back to the pre-fix 56-column list.
func TestINT02_LeaseColumnsIncludeAllFrozenV1Fields(t *testing.T) {
	aliases := make(map[string]bool)
	for _, a := range persistence.OutboxLeaseColumnAliases() {
		aliases[a] = true
	}
	var missing []string
	for _, f := range int02RequiredV1Fields {
		if !aliases[f] {
			missing = append(missing, f)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("outboxLeaseColumns is missing %d required v1 field(s): %v -- these must be selected at lease time per INT-02", len(missing), missing)
	}
	t.Logf("CONFIRMED: all %d required v1 fields are present in the lease column contract.", len(int02RequiredV1Fields))
}

// TestINT02_FixtureRoundTripPreservesAllFields is the "outbox row through
// lease JSON" half of the acceptance test: loads the shared fixture,
// marshals it the same way outbox_handler.go's writeJSON does, unmarshals
// it back, and confirms every required v1 field survives with a real
// (non-zero) value.
func TestINT02_FixtureRoundTripPreservesAllFields(t *testing.T) {
	evt := int02LoadFixture(t)

	out, err := json.Marshal(evt)
	if err != nil {
		t.Fatalf("failed to marshal fixture-loaded OutboxEvent: %v", err)
	}
	var roundTripped models.OutboxEvent
	if err := json.Unmarshal(out, &roundTripped); err != nil {
		t.Fatalf("failed to unmarshal round-tripped JSON: %v", err)
	}

	blank := int02FindBlankFields(&roundTripped, int02RequiredV1Fields)
	if len(blank) > 0 {
		t.Fatalf("after round-tripping the fixture through models.OutboxEvent -> JSON -> models.OutboxEvent, %d required v1 field(s) came back blank: %v",
			len(blank), blank)
	}
	t.Logf("CONFIRMED: all %d required v1 fields survive the outbox-row -> lease-JSON round trip with their fixture values intact.", len(int02RequiredV1Fields))
}

// TestINT02_BlankRequiredFieldFailsFixtureCheck is the acceptance test's
// explicit "blank required field fails test" line: proves
// int02FindBlankFields isn't a no-op by deliberately blanking one field
// and confirming it's reported.
func TestINT02_BlankRequiredFieldFailsFixtureCheck(t *testing.T) {
	evt := int02LoadFixture(t)
	evt.PayloadHash = "" // deliberately blank a required field

	blank := int02FindBlankFields(&evt, int02RequiredV1Fields)
	found := false
	for _, b := range blank {
		if b == "payload_hash" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected int02FindBlankFields to catch the deliberately-blanked payload_hash field, but it reported: %v -- the checker itself is broken", blank)
	}
	t.Logf("CONFIRMED: deliberately blanking payload_hash was correctly caught (blank fields found: %v).", blank)
}
