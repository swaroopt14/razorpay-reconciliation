package services

// action_service_phase5_test.go — Phase 5 (refactor) unit tests for the pure
// helper functions in action_service.go: deriveScope, buildIdempotencyKey,
// buildSignaturePayloadHash. No DB required — these are pure functions over
// their inputs, package-internal (white-box) so the private functions are
// directly reachable.
//
// P1-05/P1-06 (corrective-action-report): buildIdempotencyKey and
// buildSignaturePayloadHash now hash a canonical JSON struct instead of a
// pipe-delimited string, take scopeRefsHash (the full scope) instead of
// scope_type/scope_ref, and return an error alongside the hash.

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

// baseScopeHash is a stand-in scope_refs_hash for tests that don't care
// about scope content itself, only that the key changes when it does.
const baseScopeHash = "scopeHashINTENTint1"

func mustBuildIdempotencyKey(t *testing.T, tenantID, policyID string, policyVersion int, policySource, policyDigest,
	scopeRefsHash, triggerEventID, triggerEventVersion, inputFactsHash, payloadHash string) string {
	t.Helper()
	key, err := buildIdempotencyKey(tenantID, policyID, policyVersion, policySource, policyDigest,
		scopeRefsHash, triggerEventID, triggerEventVersion, inputFactsHash, payloadHash)
	if err != nil {
		t.Fatalf("buildIdempotencyKey: %v", err)
	}
	return key
}

func TestBuildIdempotencyKey_Deterministic(t *testing.T) {
	key1 := mustBuildIdempotencyKey(t, "tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", baseScopeHash, "trig_1", "legacy", "inputHashABC", "hashABC")
	key2 := mustBuildIdempotencyKey(t, "tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", baseScopeHash, "trig_1", "legacy", "inputHashABC", "hashABC")
	if key1 != key2 {
		t.Fatalf("buildIdempotencyKey not deterministic: %q != %q", key1, key2)
	}
	if len(key1) != 64 { // sha256 hex
		t.Fatalf("buildIdempotencyKey length = %d, want 64 (sha256 hex)", len(key1))
	}
}

func TestBuildIdempotencyKey_DifferingInputsDifferentKeys(t *testing.T) {
	baseline := mustBuildIdempotencyKey(t, "tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", baseScopeHash, "trig_1", "legacy", "inputHashABC", "hashABC")

	variants := map[string]string{
		"different tenant":            mustBuildIdempotencyKey(t, "tnt_B", "P_SLA_BREACH", 1, "zpi_seed", "digest123", baseScopeHash, "trig_1", "legacy", "inputHashABC", "hashABC"),
		"different policy":            mustBuildIdempotencyKey(t, "tnt_A", "P_OTHER", 1, "zpi_seed", "digest123", baseScopeHash, "trig_1", "legacy", "inputHashABC", "hashABC"),
		"different version":           mustBuildIdempotencyKey(t, "tnt_A", "P_SLA_BREACH", 2, "zpi_seed", "digest123", baseScopeHash, "trig_1", "legacy", "inputHashABC", "hashABC"),
		"different scope_refs_hash":   mustBuildIdempotencyKey(t, "tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", "scopeHashINTENTint2", "trig_1", "legacy", "inputHashABC", "hashABC"),
		"different trigger":           mustBuildIdempotencyKey(t, "tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", baseScopeHash, "trig_2", "legacy", "inputHashABC", "hashABC"),
		"different input_facts_hash":  mustBuildIdempotencyKey(t, "tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", baseScopeHash, "trig_1", "legacy", "inputHashXYZ", "hashABC"),
		"different payload_hash":      mustBuildIdempotencyKey(t, "tnt_A", "P_SLA_BREACH", 1, "zpi_seed", "digest123", baseScopeHash, "trig_1", "legacy", "inputHashABC", "hashXYZ"),
	}
	for name, v := range variants {
		if v == baseline {
			t.Errorf("%s: expected a different key, got the same as baseline", name)
		}
	}
}

// Delimiter characters embedded in a value must never make two distinct
// inputs collide — the exact failure mode pipe-delimited concatenation had
// and canonical JSON fixes (corrective-action-report P1-05 acceptance test).
func TestBuildIdempotencyKey_DelimiterCharactersDoNotCollide(t *testing.T) {
	// "a|b" as one scope hash vs "a" and "b" split across two fields — with
	// naive pipe concatenation these could produce the same raw string.
	key1 := mustBuildIdempotencyKey(t, "tnt_A", "P_X", 1, "src", "dig", "a|b", "trig", "legacy", "inputs", "payload")
	key2 := mustBuildIdempotencyKey(t, "tnt_A", "P_X", 1, "src", "dig", "a", "b|trig", "legacy", "inputs", "payload")
	if key1 == key2 {
		t.Fatalf("buildIdempotencyKey collided across a delimiter boundary: %q", key1)
	}
}

func TestBuildSignaturePayloadHash_Deterministic(t *testing.T) {
	created := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	ac := models.ActionContract{
		TenantID: "tnt_A", ActionID: "act_1", PolicyID: "P_X", PolicyVersion: 1,
		PolicySource: "zpi_seed", PolicyDigest: "digestABC",
		ScopeRefsHash:  baseScopeHash,
		InputFactsHash: "inputHash", PayloadHash: "payloadHash",
		Decision: models.DecisionEscalate, Confidence: 0.75,
		CreatedAt: created,
	}
	h1, err := buildSignaturePayloadHash(ac)
	if err != nil {
		t.Fatalf("buildSignaturePayloadHash: %v", err)
	}
	h2, err := buildSignaturePayloadHash(ac)
	if err != nil {
		t.Fatalf("buildSignaturePayloadHash: %v", err)
	}
	if h1 != h2 {
		t.Fatalf("buildSignaturePayloadHash not deterministic: %q != %q", h1, h2)
	}

	// Changing any signed field must change the hash — this is what makes
	// the signature tamper-evident.
	tampered := ac
	tampered.Confidence = 0.99
	h3, err := buildSignaturePayloadHash(tampered)
	if err != nil {
		t.Fatalf("buildSignaturePayloadHash: %v", err)
	}
	if h3 == h1 {
		t.Errorf("buildSignaturePayloadHash did not change after tampering with Confidence")
	}

	// Changing the scope (a different secondary scope ref, same primary
	// scope type/ref) must also change the hash — this is the exact gap
	// P1-06 closes.
	scopeChanged := ac
	scopeChanged.ScopeRefsHash = "scopeHashINTENTint2"
	h4, err := buildSignaturePayloadHash(scopeChanged)
	if err != nil {
		t.Fatalf("buildSignaturePayloadHash: %v", err)
	}
	if h4 == h1 {
		t.Errorf("buildSignaturePayloadHash did not change after changing ScopeRefsHash")
	}
}
