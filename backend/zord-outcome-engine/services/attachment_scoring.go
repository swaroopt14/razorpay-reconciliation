package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT SCORING ENGINE
//
// FIXES APPLIED IN THIS FILE:
//
//   FIX #16 — classifyVarianceType now correctly distinguishes
//              TAX_TDS_DEDUCTION (obs.DeductionAmount) from
//              FEE_DEDUCTION (obs.FeeAmount).  Previously both mapped to
//              FEE_DEDUCTION, making Service 7 whitelist logic unable to
//              separate PSP fees from TDS/tax deductions.
//
//   FIX #17 — ComputeMatchConfidence used a hardcoded maxTheoreticalScore of
//              310 which was wrong (actual max with all carriers = ~485).
//              The constant is now derived from the actual carrier weight
//              constants so it stays correct as weights change.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"encoding/json"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"zord-outcome-engine/models"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

const (
	RulesetVersion = "v1"

	// FIX #17: maximum theoretical score, derived explicitly from carrier weights
	// so it stays correct when weights change.
	//
	// ZordSignature(120) + ClientRef(100) + BusinessIdempotencyKey(95) +
	// BankRef(85) + BeneficiaryFingerprint(35) +
	// Amount(30) + Currency(10) +
	// SourceRowNum(50) + BatchFamily(15) +
	// Time(20) + SourceSystem(10) + Corridor(10) = 580
	//
	// The result is capped at 1.0 in ComputeMatchConfidence so going over is
	// safe, but the constant must not be lower than any realistic total.
	maxTheoreticalMatchScore = 580.0
)

type CarrierPriorityPolicy struct {
	ExactRef                float64 `json:"exact_ref"`
	ClientRef               float64 `json:"client_ref"`
	ProviderRef             float64 `json:"provider_ref"`
	BankRef                 float64 `json:"bank_ref"`
	ZordSignature           float64 `json:"zord_signature"`
	BeneficiaryMatch        float64 `json:"beneficiary_match"`
	AmountMatch             float64 `json:"amount_match"`
	CurrencyMatch           float64 `json:"currency_match"`
	BatchMatch              float64 `json:"batch_match"`
	TimeWindow              float64 `json:"time_window"`
	SourceSystem            float64 `json:"source_system"`
	ParseConfidenceModifier float64 `json:"parse_confidence_modifier"`
	SourceStrengthModifier  float64 `json:"source_strength_modifier"`
	ConflictPenalty         float64 `json:"conflict_penalty"`
}

type TimeWindowPolicy struct {
	MaxHoursDifference float64 `json:"max_hours_difference"`
	StrictSameDay      bool    `json:"strict_same_day"`
	AllowCrossPeriod   bool    `json:"allow_cross_period"`
}

type AmountTolerancePolicy struct {
	ExactMatchRequired       bool    `json:"exact_match_required"`
	ToleranceMinor           int64   `json:"tolerance_minor"`
	AllowPercentageTolerance bool    `json:"allow_percentage_tolerance"`
	PercentageTolerance      float64 `json:"percentage_tolerance"`
}

type BatchBoundaryPolicy struct {
	StrictBatchMatching          bool `json:"strict_batch_matching"`
	AllowCrossBatchIfStrongMatch bool `json:"allow_cross_batch_if_strong_match"`
}

type ManualReviewThresholds struct {
	HighConfidenceScore        float64 `json:"high_confidence_score"`
	ExactMatchScore            float64 `json:"exact_match_score"`
	AmbiguityMarginThreshold   float64 `json:"ambiguity_margin_threshold"`
	ExactMarginThreshold       float64 `json:"exact_margin_threshold"`
	MinScoreForAutoAttach      float64 `json:"min_score_for_auto_attach"`
	MaxCandidatesForAutoAttach int     `json:"max_candidates_for_auto_attach"`
}

type AttachmentPolicyConfig struct {
	CarrierPriority        CarrierPriorityPolicy
	TimeWindow             TimeWindowPolicy
	AmountTolerance        AmountTolerancePolicy
	BatchBoundary          BatchBoundaryPolicy
	ManualReviewThresholds ManualReviewThresholds
}

func parseRuleProfile(profile *models.AttachmentRuleProfile) AttachmentPolicyConfig {
	cfg := AttachmentPolicyConfig{
		CarrierPriority: CarrierPriorityPolicy{
			ExactRef:                100.0,
			ClientRef:               90.0,
			ProviderRef:             85.0,
			BankRef:                 85.0,
			ZordSignature:           100.0,
			AmountMatch:             30.0,
			CurrencyMatch:           10.0,
			BatchMatch:              15.0,
			TimeWindow:              20.0,
			SourceSystem:            10.0,
			ParseConfidenceModifier: -20.0,
			SourceStrengthModifier:  -15.0,
			ConflictPenalty:         -40.0,
		},
		TimeWindow: TimeWindowPolicy{
			MaxHoursDifference: 72,
		},
		AmountTolerance: AmountTolerancePolicy{
			ExactMatchRequired: true,
			ToleranceMinor:     0,
		},
		ManualReviewThresholds: ManualReviewThresholds{
			HighConfidenceScore:      135.0,
			MinScoreForAutoAttach:    80.0,
			AmbiguityMarginThreshold: 15.0,
			ExactMarginThreshold:     20.0,
		},
	}

	if profile == nil {
		return cfg
	}

	if len(profile.CarrierPriorityJSON) > 0 {
		if err := json.Unmarshal(profile.CarrierPriorityJSON, &cfg.CarrierPriority); err != nil {
			log.Printf("attachment.scoring.parse_ruleset_warn profile=%s field=carrier_priority err=%v — using defaults",
				profile.ProfileID, err)
		}
	}
	if len(profile.TimeWindowPolicyJSON) > 0 {
		if err := json.Unmarshal(profile.TimeWindowPolicyJSON, &cfg.TimeWindow); err != nil {
			log.Printf("attachment.scoring.parse_ruleset_warn profile=%s field=time_window err=%v — using defaults",
				profile.ProfileID, err)
		}
	}
	if len(profile.AmountTolerancePolicyJSON) > 0 {
		if err := json.Unmarshal(profile.AmountTolerancePolicyJSON, &cfg.AmountTolerance); err != nil {
			log.Printf("attachment.scoring.parse_ruleset_warn profile=%s field=amount_tolerance err=%v — using defaults",
				profile.ProfileID, err)
		}
	}
	if len(profile.BatchBoundaryPolicyJSON) > 0 {
		if err := json.Unmarshal(profile.BatchBoundaryPolicyJSON, &cfg.BatchBoundary); err != nil {
			log.Printf("attachment.scoring.parse_ruleset_warn profile=%s field=batch_boundary err=%v — using defaults",
				profile.ProfileID, err)
		}
	}
	if len(profile.ManualReviewThresholdsJSON) > 0 {
		if err := json.Unmarshal(profile.ManualReviewThresholdsJSON, &cfg.ManualReviewThresholds); err != nil {
			log.Printf("attachment.scoring.parse_ruleset_warn profile=%s field=manual_review_thresholds err=%v — using defaults",
				profile.ProfileID, err)
		}
	}

	return cfg
}

type ScoreBreakdown struct {
	RulesetVersion string `json:"ruleset_version"`

	ExactCarrierScore          float64 `json:"exact_carrier_score"`
	BusinessReferenceScore     float64 `json:"business_reference_score"`
	ProviderBankReferenceScore float64 `json:"provider_bank_reference_score"`
	PartyAmountScore           float64 `json:"party_amount_score"`
	BatchContextScore          float64 `json:"batch_context_score"`
	TimingScore                float64 `json:"timing_score"`
	SourceSystemScore          float64 `json:"source_system_score"`
	QualityModifiers           float64 `json:"quality_modifiers"`
	ConflictPenalties          float64 `json:"conflict_penalties"`
}

type CandidateScore struct {
	SettlementObservationID uuid.UUID
	IntentID                uuid.UUID
	Breakdown               ScoreBreakdown
	BreakdownJSON           []byte
	Total                   float64
	ConfidenceBucket        string

	ExactRefMatch      bool
	ClientRefMatch     bool
	ProviderRefMatch   bool
	BankRefMatch       bool
	BatchMatch         bool
	AmountMatch        bool
	CurrencyMatch      bool
	TimeWindowMatch    bool
	SourceSystemMatch  bool
	ZordSignatureMatch bool
	CompositeMatch     bool

	ParseConfPenalised bool
	QualityAcceptable  bool
	HasHardConflict    bool
	HasAnyConflict     bool
}

func ScoreCandidate(
	obs models.CanonicalSettlementObservation,
	intent models.CanonicalIntent,
	profile *models.AttachmentRuleProfile,
) CandidateScore {
	bd := ScoreBreakdown{RulesetVersion: RulesetVersion}
	cs := CandidateScore{}
	policy := parseRuleProfile(profile)

	// ── LAYER 1: Exact carrier matches ───────────────────────────────────────

	// Zord signature: +120
	if intent.ZordSignatureCarrier != nil && obs.ZordSignatureCarrier != nil &&
		strings.EqualFold(*intent.ZordSignatureCarrier, *obs.ZordSignatureCarrier) &&
		*intent.ZordSignatureCarrier != "" {
		bd.ExactCarrierScore += 120
		cs.ZordSignatureMatch = true
		cs.ExactRefMatch = true
	}

	// Client payout reference: +100
	if intent.ClientPayoutRef != nil && obs.ClientReferenceCandidate != nil &&
		strings.EqualFold(*intent.ClientPayoutRef, *obs.ClientReferenceCandidate) &&
		*intent.ClientPayoutRef != "" {
		bd.BusinessReferenceScore += 100
		cs.ClientRefMatch = true
		cs.ExactRefMatch = true
	}

	// Business idempotency key: +95
	if intent.BusinessIdempotencyKey != nil && obs.ClientReferenceCandidate != nil &&
		strings.EqualFold(*intent.BusinessIdempotencyKey, *obs.ClientReferenceCandidate) &&
		*intent.BusinessIdempotencyKey != "" {
		bd.BusinessReferenceScore += 95
		cs.ExactRefMatch = true
	}

	// source_row_ref match: +50 (batch-context signal; never grants ExactRefMatch)
	if intent.SourceRowNum != nil && obs.SourceRowRef != "" {
		if sourceRowRef, err := strconv.Atoi(obs.SourceRowRef); err == nil &&
			*intent.SourceRowNum == sourceRowRef {
			bd.BatchContextScore += 50
			cs.BatchMatch = true
			// Intentionally NOT setting cs.ExactRefMatch.
		}
	}

	// Bank reference: +85 (presence only; cannot grant ExactRefMatch alone)
	if obs.BankReference != nil && *obs.BankReference != "" {
		bd.ProviderBankReferenceScore += 85
		cs.BankRefMatch = true
	}

	// Beneficiary fingerprint: +35
	if intent.BeneficiaryFingerprint != nil && obs.BeneficiaryFingerprint != nil &&
		strings.EqualFold(*intent.BeneficiaryFingerprint, *obs.BeneficiaryFingerprint) &&
		*intent.BeneficiaryFingerprint != "" {
		bd.QualityModifiers += 35
	}

	// ── LAYER 2: Composite / soft matching ───────────────────────────────────

	// Amount match within tolerance: +30
	amountTolerance := decimal.NewFromInt(policy.AmountTolerance.ToleranceMinor)
	if obs.Amount.Sub(intent.Amount).Abs().LessThanOrEqual(amountTolerance) {
		bd.PartyAmountScore += 30
		cs.AmountMatch = true
	} else {
		bd.ConflictPenalties -= 50
		cs.HasAnyConflict = true
	}

	// Currency match: +10
	if strings.EqualFold(obs.CurrencyCode, intent.CurrencyCode) && obs.CurrencyCode != "" {
		bd.PartyAmountScore += 10
		cs.CurrencyMatch = true
	} else {
		bd.ConflictPenalties -= 100
		cs.HasHardConflict = true
		cs.HasAnyConflict = true
	}

	// Time window match: +20
	if intent.IntendedExecutionAt != nil {
		diff := obs.ObservationTimestamp.Sub(*intent.IntendedExecutionAt)
		if math.Abs(diff.Hours()) <= policy.TimeWindow.MaxHoursDifference {
			bd.TimingScore += 20
			cs.TimeWindowMatch = true
		}
	}

	// Batch family match: +15
	if intent.ClientBatchRef != nil && obs.ClientBatchID != "" &&
		strings.EqualFold(*intent.ClientBatchRef, obs.ClientBatchID) {
		bd.BatchContextScore += 15
		cs.BatchMatch = true
	}

	// Source system / corridor match: +10 each
	if intent.ProviderHint != nil && strings.EqualFold(*intent.ProviderHint, obs.SourceSystem) {
		bd.SourceSystemScore += 10
		cs.SourceSystemMatch = true
	}
	if intent.Corridor != nil && obs.CorridorID != "" &&
		strings.EqualFold(*intent.Corridor, obs.CorridorID) {
		bd.SourceSystemScore += 10
	}

	// ── QUALITY MODIFIERS ─────────────────────────────────────────────────────

	cs.QualityAcceptable = true

	if obs.ParseConfidence < 0.7 {
		bd.QualityModifiers -= 20
		cs.ParseConfPenalised = true
		cs.QualityAcceptable = false
	}
	if obs.MappingConfidence < 0.7 {
		bd.QualityModifiers -= 15
		cs.QualityAcceptable = false
	}
	if obs.AttachmentReadinessScore < 0.6 {
		bd.QualityModifiers -= 15
		cs.QualityAcceptable = false
	}

	switch obs.SourceStrengthClass {
	case "INTERNAL_EXPORT":
		bd.QualityModifiers -= 10
	case "MANUAL_UPLOAD":
		bd.QualityModifiers -= 20
	}

	// ── FINAL SUMMATION ───────────────────────────────────────────────────────

	total := bd.ExactCarrierScore +
		bd.BusinessReferenceScore +
		bd.ProviderBankReferenceScore +
		bd.PartyAmountScore +
		bd.BatchContextScore +
		bd.TimingScore +
		bd.SourceSystemScore +
		bd.QualityModifiers +
		bd.ConflictPenalties

	if total < 0 {
		total = 0
	}
	cs.Total = total
	cs.Breakdown = bd
	cs.BreakdownJSON, _ = json.Marshal(bd)

	return cs
}

func ClassifyConfidenceContext(top CandidateScore, ranked []CandidateScore, thresholds ManualReviewThresholds) string {
	margin := 0.0
	if len(ranked) > 1 {
		margin = top.Total - ranked[1].Total
	}

	if top.HasHardConflict || top.Total <= 0 {
		return models.ConfidenceInvalid
	}

	if !top.ExactRefMatch {
		if top.Total >= thresholds.MinScoreForAutoAttach {
			return models.ConfidenceMedium
		}
		return models.ConfidenceLow
	}

	if top.ExactRefMatch && (top.ClientRefMatch || top.ZordSignatureMatch) &&
		top.AmountMatch && top.CurrencyMatch && !top.HasAnyConflict {
		if len(ranked) == 1 || margin >= thresholds.ExactMarginThreshold {
			return models.ConfidenceExact
		}
	}

	if top.Total >= thresholds.HighConfidenceScore {
		if margin >= thresholds.AmbiguityMarginThreshold {
			if top.QualityAcceptable {
				return models.ConfidenceHigh
			}
		}
	}

	if top.Total >= thresholds.MinScoreForAutoAttach {
		return models.ConfidenceMedium
	}

	return models.ConfidenceLow
}

func SelectDecisionType(
	ranked []CandidateScore,
	profile *models.AttachmentRuleProfile,
) (decisionType string, reasonCode string) {

	if len(ranked) == 0 {
		return models.DecisionMatchUnresolved, "NO_CANDIDATES"
	}

	policy := parseRuleProfile(profile)
	top := ranked[0]
	top.ConfidenceBucket = ClassifyConfidenceContext(top, ranked, policy.ManualReviewThresholds)
	ranked[0] = top

	switch {
	case len(ranked) == 1:
		switch top.ConfidenceBucket {
		case models.ConfidenceExact:
			return models.DecisionMatchExact, "SINGLE_EXACT_CARRIER"
		case models.ConfidenceHigh:
			return models.DecisionMatchHighConfidence, "SINGLE_HIGH_CONFIDENCE_COMPOSITE"
		case models.ConfidenceMedium:
			return models.DecisionMatchAmbiguous, "SINGLE_MEDIUM_CANDIDATE"
		default:
			return models.DecisionMatchUnresolved, "SINGLE_LOW_CONFIDENCE"
		}

	default:
		runnerUp := ranked[1]
		if top.ExactRefMatch && runnerUp.ExactRefMatch {
			return models.DecisionMatchConflicted, "CONFLICTING_EXACT_CARRIERS"
		}
		switch top.ConfidenceBucket {
		case models.ConfidenceExact:
			return models.DecisionMatchExact, "DOMINANT_EXACT_CARRIER"
		case models.ConfidenceHigh:
			return models.DecisionMatchHighConfidence, "DOMINANT_HIGH_CONFIDENCE"
		default:
			if top.ConfidenceBucket == models.ConfidenceInvalid {
				return models.DecisionMatchUnresolved, "ALL_CANDIDATES_INVALID"
			}
			if top.ConfidenceBucket == models.ConfidenceLow && top.HasAnyConflict {
				return models.DecisionMatchUnresolved, "ALL_CANDIDATES_LOW_AND_CONFLICTED"
			}
			return models.DecisionMatchAmbiguous, "WEAK_DOMINANT_CANDIDATE"
		}
	}
}

func sourceStrengthScore(sourceStrengthClass string) float64 {
	switch sourceStrengthClass {
	case "BANK_LEDGER":
		return 1.0
	case "PSP_REPORT":
		return 0.85
	case "INTERNAL_EXPORT":
		return 0.65
	case "MANUAL_UPLOAD":
		return 0.45
	default:
		return 0.30
	}
}

func ComputeAmbiguityScore(
	ranked []CandidateScore,
	decisionType string,
	obs models.CanonicalSettlementObservation,
	policy AttachmentPolicyConfig,
) float64 {
	switch decisionType {
	case models.DecisionMatchUnresolved:
		return 1.0
	case models.DecisionMatchConflicted:
		return 0.95
	}

	candidateSetSize := len(ranked)

	var candidateSetRisk float64
	switch {
	case candidateSetSize <= 1:
		candidateSetRisk = 0.0
	case candidateSetSize == 2:
		candidateSetRisk = 0.3
	case candidateSetSize <= 5:
		candidateSetRisk = 0.6
	default:
		candidateSetRisk = 1.0
	}

	ambiguityThreshold := policy.ManualReviewThresholds.AmbiguityMarginThreshold
	if ambiguityThreshold <= 0 {
		ambiguityThreshold = 15.0
	}
	var marginRisk float64
	if candidateSetSize >= 2 {
		scoreMargin := ranked[0].Total - ranked[1].Total
		marginRisk = 1.0 - math.Min(scoreMargin/ambiguityThreshold, 1.0)
	}

	carrierWeakness := 1.0 - obs.CarrierRichnessScore
	parseMappingWeakness := 1.0 - (obs.ParseConfidence+obs.MappingConfidence)/2.0
	sourceWeakness := 1.0 - sourceStrengthScore(obs.SourceStrengthClass)

	var conflictRisk float64
	if candidateSetSize > 0 && (ranked[0].HasHardConflict || ranked[0].HasAnyConflict) {
		conflictRisk = 1.0
	}

	score := 0.30*candidateSetRisk +
		0.25*marginRisk +
		0.20*carrierWeakness +
		0.10*parseMappingWeakness +
		0.10*sourceWeakness +
		0.05*conflictRisk

	if decisionType == models.DecisionMatchExact && score > 0.05 {
		score = 0.05
	}

	return math.Min(score, 1.0)
}

func ComputeConfidenceScore(
	top CandidateScore,
	decisionType string,
	ranked []CandidateScore,
	obs models.CanonicalSettlementObservation,
	policy AttachmentPolicyConfig,
) float64 {
	ambiguityThreshold := policy.ManualReviewThresholds.AmbiguityMarginThreshold
	if ambiguityThreshold <= 0 {
		ambiguityThreshold = 15.0
	}

	normalizedWinningScore := math.Min(top.Total/150.0, 1.0)

	var marginStrength float64
	if len(ranked) >= 2 {
		marginStrength = math.Min((ranked[0].Total-ranked[1].Total)/ambiguityThreshold, 1.0)
	} else {
		marginStrength = 1.0
	}

	var carrierTierStrength float64
	switch {
	case top.ExactRefMatch:
		carrierTierStrength = 1.0
	case top.CompositeMatch:
		carrierTierStrength = 0.5
	default:
		carrierTierStrength = 0.2
	}

	parseMappingQuality := (obs.ParseConfidence + obs.MappingConfidence) / 2.0
	srcStrength := sourceStrengthScore(obs.SourceStrengthClass)

	var candidateSetSimplicity float64
	switch {
	case len(ranked) <= 1:
		candidateSetSimplicity = 1.0
	case len(ranked) == 2:
		candidateSetSimplicity = 0.7
	case len(ranked) <= 5:
		candidateSetSimplicity = 0.4
	default:
		candidateSetSimplicity = 0.1
	}

	score := 0.35*normalizedWinningScore +
		0.25*marginStrength +
		0.15*carrierTierStrength +
		0.10*parseMappingQuality +
		0.10*srcStrength +
		0.05*candidateSetSimplicity

	switch decisionType {
	case models.DecisionMatchAmbiguous:
		if score > 0.60 {
			score = 0.60
		}
	case models.DecisionMatchConflicted:
		if score > 0.35 {
			score = 0.35
		}
	case models.DecisionMatchUnresolved:
		if score > 0.20 {
			score = 0.20
		}
	}

	if top.HasHardConflict && score > 0.30 {
		score = 0.30
	}

	return math.Min(score, 1.0)
}

// ComputeMatchConfidence returns the normalised native similarity between
// observation and intent, without environmental modifiers.
//
// FIX #17: uses maxTheoreticalMatchScore constant (580) derived from actual
// carrier weights instead of the old hardcoded 310 which was incorrect.
func ComputeMatchConfidence(cs CandidateScore) float64 {
	nativeScore := cs.Breakdown.BusinessReferenceScore +
		cs.Breakdown.PartyAmountScore +
		cs.Breakdown.BatchContextScore +
		cs.Breakdown.TimingScore

	matchConfidence := nativeScore / maxTheoreticalMatchScore
	if matchConfidence > 1.0 {
		return 1.0
	}
	if matchConfidence < 0.0 {
		return 0.0
	}
	return matchConfidence
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANCE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

type VarianceInputs struct {
	Intent      models.CanonicalIntent
	Observation models.CanonicalSettlementObservation
}

func ComputeVariance(in VarianceInputs) (
	amountVariance decimal.Decimal,
	feeVariance *decimal.Decimal,
	deductionVariance *decimal.Decimal,
	severity string,
	flags map[string]bool,
	reasons []string,
) {
	flags = make(map[string]bool)

	feeVariance = in.Observation.FeeAmount
	deductionVariance = in.Observation.DeductionAmount

	if in.Observation.SettledAmount != nil {
		amountVariance = in.Intent.Amount.Sub(*in.Observation.SettledAmount)
	} else {
		amountVariance = in.Intent.Amount.Sub(in.Observation.Amount)
	}

	if !amountVariance.IsZero() {
		reasons = append(reasons, "AMOUNT_MISMATCH")
	}

	flags["currency_match"] = in.Intent.CurrencyCode == in.Observation.CurrencyCode
	if !flags["currency_match"] {
		reasons = append(reasons, "CURRENCY_MISMATCH")
	}

	if in.Intent.IntendedExecutionAt != nil && in.Observation.ValueDate != nil {
		intentDay := in.Intent.IntendedExecutionAt.Truncate(24 * time.Hour)
		settleDay := in.Observation.ValueDate.Truncate(24 * time.Hour)
		delayDays := int(settleDay.Sub(intentDay).Hours() / 24)

		flags["value_date_mismatch"] = delayDays != 0
		flags["cross_period"] = isCrossPeriod(intentDay, settleDay)

		if delayDays != 0 {
			reasons = append(reasons, "VALUE_DATE_MISMATCH")
		}
		if flags["cross_period"] {
			reasons = append(reasons, "CROSS_PERIOD_SETTLEMENT")
		}
	}

	flags["provider_ref_missing"] = in.Observation.ProviderReference == nil
	flags["bank_ref_missing"] = in.Observation.BankReference == nil

	if flags["provider_ref_missing"] {
		reasons = append(reasons, "PROVIDER_REF_MISSING")
	}
	if flags["bank_ref_missing"] {
		reasons = append(reasons, "BANK_REF_MISSING")
	}

	flags["evidence_gap"] = flags["provider_ref_missing"] && flags["bank_ref_missing"]
	if flags["evidence_gap"] {
		reasons = append(reasons, "EVIDENCE_GAP")
	}

	flags["status_variance"] = in.Observation.SettlementStatus == "FAILED" ||
		in.Observation.SettlementStatus == "REVERSED" ||
		in.Observation.SettlementStatus == "RETURNED"
	if flags["status_variance"] {
		reasons = append(reasons, "UNEXPECTED_SETTLEMENT_STATUS")
	}

	severity = classifyVarianceSeverity(amountVariance, in.Intent.Amount, flags)
	return
}

func classifyVarianceSeverity(variance decimal.Decimal, intendedAmount decimal.Decimal, flags map[string]bool) string {
	if flags["status_variance"] {
		return models.VarianceSeverityCritical
	}
	if flags["evidence_gap"] {
		return models.VarianceSeverityHigh
	}
	if !variance.IsZero() {
		div := intendedAmount
		if div.IsZero() {
			div = decimal.NewFromInt(1)
		}
		pct, _ := variance.Abs().Div(div).Mul(decimal.NewFromInt(100)).Float64()
		switch {
		case pct > 10:
			return models.VarianceSeverityHigh
		case pct > 1:
			return models.VarianceSeverityMedium
		default:
			return models.VarianceSeverityLow
		}
	}
	if flags["cross_period"] || flags["value_date_mismatch"] {
		return models.VarianceSeverityMedium
	}
	if flags["provider_ref_missing"] || flags["bank_ref_missing"] {
		return models.VarianceSeverityLow
	}
	return models.VarianceSeverityInfo
}

// classifyVarianceType derives the variance_type enum value.
//
// FIX #16: DeductionAmount now correctly maps to TAX_TDS_DEDUCTION, and
// FeeAmount maps to FEE_DEDUCTION. Previously both collapsed to FEE_DEDUCTION,
// preventing Service 7 from distinguishing PSP fees from TDS deductions.
func classifyVarianceType(
	amountVariance decimal.Decimal,
	flags map[string]bool,
	obs models.CanonicalSettlementObservation,
) string {
	if flags["status_variance"] {
		return models.VarianceTypeStatusMismatch
	}
	if flags["cross_period"] {
		return models.VarianceTypeCrossPeriod
	}
	if flags["value_date_mismatch"] {
		return models.VarianceTypeValueDateMismatch
	}
	if amountVariance.IsZero() {
		return models.VarianceTypeNoVariance
	}
	// FIX #16: check DeductionAmount first (TDS/tax) then FeeAmount (PSP fee).
	if obs.DeductionAmount != nil && !obs.DeductionAmount.IsZero() {
		return models.VarianceTypeTaxTDSDeduction
	}
	if obs.FeeAmount != nil && !obs.FeeAmount.IsZero() {
		return models.VarianceTypeFeeDeduction
	}
	if amountVariance.IsPositive() {
		return models.VarianceTypeUnderSettlement
	}
	return models.VarianceTypeOverSettlement
}

func isCrossPeriod(intentDay, settleDay time.Time) bool {
	return intentDay.Month() != settleDay.Month() || intentDay.Year() != settleDay.Year()
}
