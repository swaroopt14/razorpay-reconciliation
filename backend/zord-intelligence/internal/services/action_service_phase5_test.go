package services

// action_service_phase5_test.go — Phase 5 (refactor) unit tests for the pure
// helper functions in action_service.go: deriveScope, buildIdempotencyKey,
// buildSignaturePayloadHash. No DB required — these are pure functions over
// their inputs, package-internal (white-box) so the private functions are
// directly reachable.

import (
	"testing"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
)

func TestDeriveScope_Precedence(t *testing.T) {
	tests := []struct {
		name     string
		refs     models.ScopeRefs
		wantType string
		wantRef  string
	}{
		{
			name:     "batch wins over everything",
			refs:     models.ScopeRefs{BatchID: "b1", IntentID: "i1", ContractID: "c1", CorridorID: "cor1"},
			wantType: "BATCH",
			wantRef:  "b1",
		},
		{
			name:     "intent wins over contract and corridor",
			refs:     models.ScopeRefs{IntentID: "i1", ContractID: "c1", CorridorID: "cor1"},
			wantType: "INTENT",
			wantRef:  "i1",
		},
		{
			name:     "contract wins over corridor",
			refs:     models.ScopeRefs{ContractID: "c1", CorridorID: "cor1"},
			wantType: "CONTRACT",
			wantRef:  "c1",
		},
		{
			name:     "corridor alone",
			refs:     models.ScopeRefs{CorridorID: "cor1"},
			wantType: "CORRIDOR",
			wantRef:  "cor1",
		},
		{
			name:     "nothing set falls back to tenant",
			refs:     models.ScopeRefs{},
			wantType: "TENANT",
			wantRef:  "tnt_A",
		},
		{
			name:     "sla-breach shape: intent + corridor set, no batch/contract — classifies as INTENT",
			refs:     models.ScopeRefs{TenantID: "tnt_A", IntentID: "int_1", CorridorID: "razorpay_UPI"},
			wantType: "INTENT",
			wantRef:  "int_1",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotType, gotRef := deriveScope(tt.refs, "tnt_A")
			if gotType != tt.wantType || gotRef != tt.wantRef {
				t.Errorf("deriveScope(%+v) = (%q, %q), want (%q, %q)",
					tt.refs, gotType, gotRef, tt.wantType, tt.wantRef)
			}
		})
	}
}

func TestBuildIdempotencyKey_Deterministic(t *testing.T) {
	key1 := buildIdempotencyKey("tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", "INTENT", "int_1", "trig_1", "legacy", "hashABC")
	key2 := buildIdempotencyKey("tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", "INTENT", "int_1", "trig_1", "legacy", "hashABC")
	if key1 != key2 {
		t.Fatalf("buildIdempotencyKey not deterministic: %q != %q", key1, key2)
	}
	if len(key1) != 64 { // sha256 hex
		t.Fatalf("buildIdempotencyKey length = %d, want 64 (sha256 hex)", len(key1))
	}
}

func TestBuildIdempotencyKey_DifferingInputsDifferentKeys(t *testing.T) {
	base := func() string {
		return buildIdempotencyKey("tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", "INTENT", "int_1", "trig_1", "legacy", "hashABC")
	}
	baseline := base()

	variants := map[string]string{
		"different tenant":       buildIdempotencyKey("tnt_B", "P_SLA_BREACH", 1, "zpi_seed", "digest123", "INTENT", "int_1", "trig_1", "legacy", "hashABC"),
		"different policy":       buildIdempotencyKey("tnt_A", "P_OTHER", 1, "zpi_seed", "digest123", "INTENT", "int_1", "trig_1", "legacy", "hashABC"),
		"different version":      buildIdempotencyKey("tnt_A", "P_SLA_BREACH", 2, "zpi_seed", "digest123", "INTENT", "int_1", "trig_1", "legacy", "hashABC"),
		"different scope_ref":    buildIdempotencyKey("tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", "INTENT", "int_2", "trig_1", "legacy", "hashABC"),
		"different trigger":      buildIdempotencyKey("tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", "INTENT", "int_1", "trig_2", "legacy", "hashABC"),
		"different payload_hash": buildIdempotencyKey("tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", "INTENT", "int_1", "trig_1", "legacy", "hashXYZ"),
	}
	for name, v := range variants {
		if v == baseline {
			t.Errorf("%s: expected a different key, got the same as baseline", name)
		}
	}
}

func TestBuildSignaturePayloadHash_Deterministic(t *testing.T) {
	created := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	ac := models.ActionContract{
		TenantID: "tnt_A", ActionID: "act_1", PolicyID: "P_X", PolicyVersion: 1,
		PolicySource: "zpi_seed", PolicyDigest: "digestABC",
		ScopeType: "INTENT", ScopeRef: "int_1",
		InputFactsHash: "inputHash", PayloadHash: "payloadHash",
		Decision: models.DecisionEscalate, Confidence: 0.75,
		CreatedAt: created,
	}
	h1 := buildSignaturePayloadHash(ac)
	h2 := buildSignaturePayloadHash(ac)
	if h1 != h2 {
		t.Fatalf("buildSignaturePayloadHash not deterministic: %q != %q", h1, h2)
	}

	// Changing any signed field must change the hash — this is what makes
	// the signature tamper-evident.
	tampered := ac
	tampered.Confidence = 0.99
	if buildSignaturePayloadHash(tampered) == h1 {
		t.Errorf("buildSignaturePayloadHash did not change after tampering with Confidence")
	}
}
