package services

import (
	"encoding/json"
	"testing"

	"zord-intent-engine/internal/models"
)

func TestPolicyResultForGovernanceState(t *testing.T) {
	cases := map[string]string{
		"VALID":           models.PolicyResultAllow,
		"FLAGGED":         models.PolicyResultAllowWithWarn,
		"REQUIRES_REVIEW": models.PolicyResultHoldForReview,
		"WEBHOOK":         models.PolicyResultAllowWithWarn,
	}
	for state, want := range cases {
		if got := policyResultForGovernanceState(state); got != want {
			t.Errorf("policyResultForGovernanceState(%q) = %q, want %q", state, got, want)
		}
	}
}

// TestBuildIntentPolicyDecision_HashesAreStableAndFactsSensitive is a Phase 4
// regression test for ledger item #17: policy_hash identifies the enforced
// ruleset (stable across intents), while input_facts_hash is a real
// fingerprint of what was actually evaluated (changes when facts change).
func TestBuildIntentPolicyDecision_HashesAreStableAndFactsSensitive(t *testing.T) {
	factsA := map[string]any{"amount": "100.00", "currency": "INR"}
	factsB := map[string]any{"amount": "200.00", "currency": "INR"}

	d1 := buildIntentPolicyDecision("tenant-1", "intent-1", "VALID", nil, factsA)
	d2 := buildIntentPolicyDecision("tenant-2", "intent-2", "FLAGGED", []string{"SOME_FLAG"}, factsA)
	d3 := buildIntentPolicyDecision("tenant-1", "intent-3", "VALID", nil, factsB)

	if d1.PolicyHash != d2.PolicyHash || d1.PolicyHash != d3.PolicyHash {
		t.Fatal("expected policy_hash to be identical across intents evaluated under the same ruleset")
	}
	if d1.InputFactsHash != d2.InputFactsHash {
		t.Fatal("expected identical input facts to hash identically")
	}
	if d1.InputFactsHash == d3.InputFactsHash {
		t.Fatal("expected different input facts (amount) to hash differently")
	}
	if d1.PolicyResult != models.PolicyResultAllow {
		t.Fatalf("expected ALLOW for VALID state, got %q", d1.PolicyResult)
	}
	if d2.PolicyResult != models.PolicyResultAllowWithWarn {
		t.Fatalf("expected ALLOW_WITH_WARNING for FLAGGED state, got %q", d2.PolicyResult)
	}

	var reasonCodes []string
	if err := json.Unmarshal(d2.ReasonCodesJSON, &reasonCodes); err != nil {
		t.Fatalf("failed to unmarshal reason_codes_json: %v", err)
	}
	if len(reasonCodes) != 1 || reasonCodes[0] != "SOME_FLAG" {
		t.Fatalf("expected reason_codes_json to contain [SOME_FLAG], got %v", reasonCodes)
	}
}
