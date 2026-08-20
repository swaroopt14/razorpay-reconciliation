package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
	"time"

	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// OUT-11 golden corpus: fixed matching scenarios. If ScoreCandidate /
// SelectDecisionType / classifyVarianceType change, go test fails with a
// before/after decision diff against testdata/attachment_golden/corpus.json.
//
// Regenerate only after intentional rule changes:
//
//	OUT11_UPDATE_GOLDEN=1 go test ./services -run TestAttachmentGoldenCorpus -count=1

type goldenCase struct {
	Name             string   `json:"name"`
	DecisionType     string   `json:"decision_type"`
	ReasonCode       string   `json:"reason_code"`
	ConfidenceBucket string   `json:"confidence_bucket,omitempty"`
	TopTotal         float64  `json:"top_total"`
	CandidateCount   int      `json:"candidate_count"`
	VarianceType     string   `json:"variance_type,omitempty"`
	VarianceSeverity string   `json:"variance_severity,omitempty"`
	Notes            string   `json:"notes,omitempty"`
}

type goldenCorpus struct {
	Scenarios []goldenCase `json:"scenarios"`
}

func TestAttachmentGoldenCorpus(t *testing.T) {
	got := runGoldenScenarios(t)

	path := goldenCorpusPath(t)
	update := os.Getenv("OUT11_UPDATE_GOLDEN") == "1"

	if update {
		raw, err := json.MarshalIndent(goldenCorpus{Scenarios: got}, "", "  ")
		if err != nil {
			t.Fatalf("marshal golden: %v", err)
		}
		if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		t.Logf("updated golden corpus at %s (%d scenarios)", path, len(got))
		return
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden corpus %s: %v (run with OUT11_UPDATE_GOLDEN=1 to create)", path, err)
	}
	var want goldenCorpus
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatalf("parse golden corpus: %v", err)
	}

	wantByName := make(map[string]goldenCase, len(want.Scenarios))
	for _, c := range want.Scenarios {
		wantByName[c.Name] = c
	}

	var missing []string
	for _, g := range got {
		w, ok := wantByName[g.Name]
		if !ok {
			missing = append(missing, g.Name)
			continue
		}
		delete(wantByName, g.Name)
		if g.DecisionType != w.DecisionType ||
			g.ReasonCode != w.ReasonCode ||
			g.ConfidenceBucket != w.ConfidenceBucket ||
			g.TopTotal != w.TopTotal ||
			g.CandidateCount != w.CandidateCount ||
			g.VarianceType != w.VarianceType ||
			g.VarianceSeverity != w.VarianceSeverity {
			t.Errorf("golden diff name=%s\n  before: %+v\n  after:  %+v", g.Name, w, g)
		}
	}
	for name := range wantByName {
		t.Errorf("golden scenario missing from run: %s", name)
	}
	for _, name := range missing {
		t.Errorf("new scenario not in golden corpus: %s (run OUT11_UPDATE_GOLDEN=1 after review)", name)
	}
}

func runGoldenScenarios(t *testing.T) []goldenCase {
	t.Helper()
	ts := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	execAt := ts

	ref := "PAYOUT-001"
	sig := "ZORD-SIG-001"
	bank := "UTR-999"
	batch := "BATCH-A"
	provider := "RAZORPAY"
	corridor := "IN-NEFT"
	fee := decimal.NewFromInt(10)
	settledPartial := decimal.NewFromInt(900)

	baseObs := func() models.CanonicalSettlementObservation {
		return models.CanonicalSettlementObservation{
			SettlementObservationID:  uuid.MustParse("11111111-1111-1111-1111-111111111111"),
			Amount:                   decimal.NewFromInt(1000),
			CurrencyCode:             "INR",
			ClientReferenceCandidate: &ref,
			BankReference:            &bank,
			ClientBatchID:            batch,
			SourceSystem:             provider,
			CorridorID:               corridor,
			ObservationTimestamp:     ts,
			ParseConfidence:          0.95,
			MappingConfidence:        0.95,
			AttachmentReadinessScore: 0.9,
			CarrierRichnessScore:     0.9,
			SourceStrengthClass:      "PSP_REPORT",
			SettlementStatus:         "SUCCESS",
			SourceRowRef:             "1",
		}
	}
	baseIntent := func() models.CanonicalIntent {
		return models.CanonicalIntent{
			IntentID:            uuid.MustParse("22222222-2222-2222-2222-222222222222"),
			Amount:              decimal.NewFromInt(1000),
			CurrencyCode:        "INR",
			ClientPayoutRef:     &ref,
			ClientBatchRef:      &batch,
			ProviderHint:        &provider,
			Corridor:            &corridor,
			IntendedExecutionAt: &execAt,
			GovernanceState:     "VALID",
			CanonicalHash:       "hash-1",
		}
	}

	decide := func(name string, obs models.CanonicalSettlementObservation, intents []models.CanonicalIntent, withVariance bool) goldenCase {
		ranked := make([]CandidateScore, 0, len(intents))
		for _, in := range intents {
			cs := ScoreCandidate(obs, in, nil)
			cs.SettlementObservationID = obs.SettlementObservationID
			cs.IntentID = in.IntentID
			ranked = append(ranked, cs)
		}
		sort.Slice(ranked, func(i, j int) bool {
			if ranked[i].Total == ranked[j].Total {
				return ranked[i].IntentID.String() < ranked[j].IntentID.String()
			}
			return ranked[i].Total > ranked[j].Total
		})

		dt, rc := SelectDecisionType(ranked, nil)
		gc := goldenCase{
			Name:           name,
			DecisionType:   dt,
			ReasonCode:     rc,
			CandidateCount: len(ranked),
		}
		if len(ranked) > 0 {
			gc.TopTotal = ranked[0].Total
			gc.ConfidenceBucket = ranked[0].ConfidenceBucket
		}
		if withVariance && len(intents) > 0 {
			amtVar, _, _, sev, flags, _ := ComputeVariance(VarianceInputs{
				Intent:      intents[0],
				Observation: obs,
			})
			gc.VarianceType = classifyVarianceType(amtVar, flags, obs)
			gc.VarianceSeverity = sev
		}
		return gc
	}

	out := make([]goldenCase, 0, 16)

	// exact — single strong client-ref + amount + currency
	out = append(out, decide("exact", baseObs(), []models.CanonicalIntent{baseIntent()}, false))

	// high — exact client-ref present but amount conflict blocks EXACT;
	// runner-up keeps margin above HIGH threshold (15).
	highObs := baseObs()
	highObs.Amount = decimal.NewFromInt(1005) // triggers amount conflict penalty
	highTop := baseIntent()
	highRunner := baseIntent()
	highRunner.IntentID = uuid.MustParse("33333333-3333-3333-3333-333333333333")
	highRunner.ClientPayoutRef = nil
	out = append(out, decide("high", highObs, []models.CanonicalIntent{highTop, highRunner}, false))

	// ambiguous — amount/currency only, no exact carrier
	ambObs := baseObs()
	ambObs.ClientReferenceCandidate = nil
	ambObs.BankReference = nil
	ambIntent := baseIntent()
	ambIntent.ClientPayoutRef = nil
	out = append(out, decide("ambiguous", ambObs, []models.CanonicalIntent{ambIntent}, false))

	// conflict — two intents share the same exact client ref
	c1 := baseIntent()
	c2 := baseIntent()
	c2.IntentID = uuid.MustParse("44444444-4444-4444-4444-444444444444")
	out = append(out, decide("conflict", baseObs(), []models.CanonicalIntent{c1, c2}, false))

	// orphan — observation with no candidate intents
	out = append(out, decide("orphan", baseObs(), nil, false))

	// one-to-many — one observation, multiple intents; weak runner-up → ambiguous/high path
	otmTop := baseIntent()
	otmWeak := baseIntent()
	otmWeak.IntentID = uuid.MustParse("55555555-5555-5555-5555-555555555555")
	otmWeak.ClientPayoutRef = strPtr("OTHER-REF")
	otmWeak.Amount = decimal.NewFromInt(1000)
	out = append(out, decide("one_to_many", baseObs(), []models.CanonicalIntent{otmTop, otmWeak}, false))

	// many-to-one — same intent scored against a second observation (pair decision)
	mtoObs := baseObs()
	mtoObs.SettlementObservationID = uuid.MustParse("66666666-6666-6666-6666-666666666666")
	mtoObs.SourceRowRef = "2"
	out = append(out, decide("many_to_one", mtoObs, []models.CanonicalIntent{baseIntent()}, false))

	// partial — settled amount less than intended
	partObs := baseObs()
	partObs.SettledAmount = &settledPartial
	partObs.Amount = settledPartial
	partIntent := baseIntent()
	out = append(out, decide("partial", partObs, []models.CanonicalIntent{partIntent}, true))

	// reversal — reversed settlement status
	revObs := baseObs()
	revObs.SettlementStatus = "REVERSED"
	revObs.ReversalFlag = true
	out = append(out, decide("reversal", revObs, []models.CanonicalIntent{baseIntent()}, true))

	// fees — fee amount present with amount variance
	feeObs := baseObs()
	feeObs.FeeAmount = &fee
	feeObs.SettledAmount = decPtr(990)
	feeObs.Amount = decimal.NewFromInt(990)
	out = append(out, decide("fees", feeObs, []models.CanonicalIntent{baseIntent()}, true))

	// duplicates — identical exact carriers on two intents (same as conflict, named for corpus)
	d1 := baseIntent()
	d2 := baseIntent()
	d2.IntentID = uuid.MustParse("77777777-7777-7777-7777-777777777777")
	out = append(out, decide("duplicates", baseObs(), []models.CanonicalIntent{d1, d2}, false))

	// currency_mismatch — hard conflict
	ccObs := baseObs()
	ccObs.CurrencyCode = "USD"
	out = append(out, decide("currency_mismatch", ccObs, []models.CanonicalIntent{baseIntent()}, true))

	// reprocess — same bytes twice must be deterministic (recorded twice, compared equal below)
	r1 := decide("reprocess_a", baseObs(), []models.CanonicalIntent{baseIntent()}, false)
	r2 := decide("reprocess_b", baseObs(), []models.CanonicalIntent{baseIntent()}, false)
	if r1.DecisionType != r2.DecisionType || r1.TopTotal != r2.TopTotal || r1.ReasonCode != r2.ReasonCode {
		t.Fatalf("reprocess non-deterministic: a=%+v b=%+v", r1, r2)
	}
	r1.Name = "reprocess"
	r1.Notes = "same input twice yields identical decision"
	out = append(out, r1)

	// zord signature exact path
	sigObs := baseObs()
	sigObs.ZordSignatureCarrier = &sig
	sigObs.ClientReferenceCandidate = nil
	sigIntent := baseIntent()
	sigIntent.ClientPayoutRef = nil
	sigIntent.ZordSignatureCarrier = &sig
	out = append(out, decide("exact_zord_signature", sigObs, []models.CanonicalIntent{sigIntent}, false))

	return out
}

func goldenCorpusPath(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Join(filepath.Dir(file), "testdata", "attachment_golden", "corpus.json")
}

func decPtr(v int64) *decimal.Decimal {
	d := decimal.NewFromInt(v)
	return &d
}
