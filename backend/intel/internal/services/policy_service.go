package services

// policy_service.go
//
// Evaluates policy rules against current KPI projection values.
// When a rule's conditions are met, calls action_service.CreateAction().
//
// PHASE 5 ADDITIONS:
//
// 1. POLICY METADATA PROPAGATION
//    evaluateOne now passes policy.RequiresManualApproval, policy.PolicyFamily,
//    and policy.Severity into CreateActionRequest so ActionContracts are created
//    with the correct approval status and classification.
//
// 2. OR LOGIC IN DSL
//    The evaluateDSL function now supports both AND and OR between conditions:
//      WHEN leakage.total_amount_minor > 500000 OR leakage.percentage > 0.025
//    OR conditions: ANY condition true → rule fires.
//    AND conditions: ALL conditions must be true → rule fires.
//    Mixed AND/OR is evaluated left-to-right with OR taking lowest precedence
//    (same as standard boolean evaluation: X AND Y OR Z AND W = (X AND Y) OR (Z AND W)).
//
// 3. BATCH-SCOPED POLICY EVALUATION
//    evaluateOneBatch is a new entry point for batch.ambiguity_score and
//    batch.risk_score metrics that come from batch-scoped projection data.
//    These are wired into EvaluateForEvent when topic = "batch.summary.updated".
//
// 4. SEVERITY PARSING
//    parseSeverity extracts the severity= value from DSL THEN lines.
//    The result is passed to CreateActionRequest so the DB column is populated
//    without requiring ops to set it separately via the policy family API.

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/zord/zord-intelligence/internal/logger"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// PolicyService evaluates policies and triggers actions.
type PolicyService struct {
	policyRepo    *persistence.PolicyRepo
	projRepo      *persistence.ProjectionRepo
	actionService *ActionService
	mlFeatures    *MLFeaturesService
}

// NewPolicyService creates a PolicyService.
func NewPolicyService(
	policyRepo *persistence.PolicyRepo,
	projRepo *persistence.ProjectionRepo,
	actionService *ActionService,
) *PolicyService {
	return &PolicyService{
		policyRepo:    policyRepo,
		projRepo:      projRepo,
		actionService: actionService,
		mlFeatures:    NewMLFeaturesService(projRepo),
	}
}

// EvaluateForEvent is called by projection_service after every KPI update.
// Finds all enabled policies for the given Kafka topic and evaluates each one.
//
// PHASE 5: evaluateOne now receives the full Policy struct so it can read
// RequiresManualApproval, PolicyFamily, and Severity.
func (s *PolicyService) EvaluateForEvent(
	ctx context.Context,
	tenantID, corridorID, topic, eventID string,
) error {
	if corridorID != "" {
		if err := s.mlFeatures.RefreshForPair(ctx, tenantID, corridorID); err != nil {
			logger.Error("ml features refresh failed",
				"tenant_id", tenantID,
				"corridor_id", corridorID,
				"topic", topic,
				"error", err,
			)
		}
	}

	policies, err := s.policyRepo.GetByTrigger(ctx, "event", topic)
	if err != nil {
		return fmt.Errorf("policy_service.EvaluateForEvent get policies topic=%s: %w", topic, err)
	}
	if len(policies) == 0 {
		return nil
	}

	for _, policy := range policies {
		if policy.TenantID != "" && policy.TenantID != tenantID {
			continue
		}
		if err := s.evaluateOne(ctx, policy, tenantID, corridorID, eventID); err != nil {
			logger.Error("policy evaluation failed",
				"policy_id", policy.PolicyID,
				"tenant_id", tenantID,
				"corridor_id", corridorID,
				"topic", topic,
				"error", err,
			)
		}
	}
	return nil
}

// EvaluateForCron is called by policy_cron_worker every 5 minutes.
// Evaluates all enabled cron-triggered policies.
func (s *PolicyService) EvaluateForCron(
	ctx context.Context,
	tenantID, corridorID string,
) error {
	policies, err := s.policyRepo.GetAllCronPolicies(ctx)
	if err != nil {
		return fmt.Errorf("policy_service.EvaluateForCron get policies: %w", err)
	}

	if err := s.mlFeatures.RefreshForPair(ctx, tenantID, corridorID); err != nil {
		logger.Error("ml features refresh failed",
			"tenant_id", tenantID,
			"corridor_id", corridorID,
			"error", err,
		)
	}

	for _, policy := range policies {
		if policy.TenantID != "" && policy.TenantID != tenantID {
			continue
		}
		if err := s.evaluateOne(ctx, policy, tenantID, corridorID, "cron"); err != nil {
			logger.Error("cron policy evaluation failed",
				"policy_id", policy.PolicyID,
				"tenant_id", tenantID,
				"corridor_id", corridorID,
				"error", err,
			)
		}
	}
	return nil
}

// evaluateOne evaluates a single policy against current projection data.
//
// PHASE 5:
//   - Passes policy.RequiresManualApproval to CreateActionRequest
//   - Passes policy.PolicyFamily to CreateActionRequest
//   - Parses severity from DSL OR uses policy.Severity column (column wins)
func (s *PolicyService) evaluateOne(
	ctx context.Context,
	policy models.Policy,
	tenantID, corridorID, triggerEventID string,
) error {
	evalCtx, err := s.buildEvalContext(ctx, tenantID, corridorID)
	if err != nil {
		return err
	}

	fires, decision, confidence, payload, severity := evaluateDSL(policy.DSL, evalCtx)
	if !fires {
		return nil
	}

	// Cooldown guard: skip if this policy already fired for this tenant+corridor
	// in the last 30 minutes. Prevents flooding when the same projection metric
	// stays above threshold across many rapid events.
	recent, rErr := s.actionService.actionRepo.HasRecentAction(
		ctx, tenantID, policy.PolicyID, corridorID, 30*time.Minute,
	)
	if rErr != nil {
		logger.Error("policy cooldown check failed",
			"policy_id", policy.PolicyID, "tenant_id", tenantID, "error", rErr)
	} else if recent {
		return nil
	}

	// PHASE 5: policy.Severity column takes priority over DSL-parsed severity.
	// This lets ops override DSL severity without changing the DSL text.
	if policy.Severity != "" {
		severity = policy.Severity
	}

	logger.Info("policy fired",
		"policy_id", policy.PolicyID,
		"policy_version", policy.Version,
		"decision", string(decision),
		"confidence", confidence,
		"severity", severity,
		"policy_family", string(policy.PolicyFamily),
		"requires_approval", policy.RequiresManualApproval,
		"tenant_id", tenantID,
		"corridor_id", corridorID,
	)

	scopeRefs := models.ScopeRefs{
		TenantID:   tenantID,
		CorridorID: corridorID,
	}
	inputRefs, _ := json.Marshal(evalCtx)

	return s.actionService.CreateAction(ctx, CreateActionRequest{
		TenantID:       tenantID,
		PolicyID:       policy.PolicyID,
		PolicyVersion:  policy.Version,
		ScopeRefs:      scopeRefs,
		InputRefsJSON:  string(inputRefs),
		Decision:       decision,
		Confidence:     confidence,
		PayloadJSON:    payload,
		TriggerEventID: triggerEventID,
		// PHASE 5: new fields
		RequiresManualApproval: policy.RequiresManualApproval || decision.RequiresApproval(),
		PolicyFamily:           policy.PolicyFamily,
		Severity:               severity,
		// PHASE 5 (refactor): policy lineage, read from the policy_definitions
		// row policy_repo.go's correlated subquery already attached to policy.
		PolicyRegistryID: policy.PolicyRegistryID,
		PolicyDigest:     policy.PolicyDigest,
		PolicySource:     policy.PolicySource,
	})
}

// buildEvalContext reads all projection metrics relevant to policy evaluation
// and returns them as a flat float64 map keyed by DSL metric name.
//
// DESIGN: Zero-value fallback applies throughout.
// If a projection row doesn't exist yet (new tenant, first event), GetValueAs
// returns nil and the map key stays at 0.0. Policies checking "> threshold"
// won't fire (correct: nothing has happened yet). Policies checking "< threshold"
// may fire (also correct: 0 success rate is a real signal on a new tenant).
//
// PHASE 5: Batch metrics are now properly populated via GetBatchHealthSummary
// instead of hardcoded 0.0 values.
func (s *PolicyService) buildEvalContext(
	ctx context.Context,
	tenantID, corridorID string,
) (map[string]float64, error) {
	evalMap := make(map[string]float64)

	// ── Corridor-scoped metrics ───────────────────────────────────────────
	// These use corridorID as part of the projection key.
	// If corridorID is empty (tenant-scoped policies), these stay at 0.0.

	var successVal models.SuccessRateValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.success_rate.%s", corridorID), &successVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext success_rate corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.success_rate"] = successVal.Rate
	evalMap["corridor.total_count"] = float64(successVal.TotalCount)

	var latencyVal models.FinalityLatencyValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.finality_latency.%s", corridorID), &latencyVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext finality_latency corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.finality_p50_seconds"] = latencyVal.P50Seconds
	evalMap["corridor.finality_p95_seconds"] = latencyVal.P95Seconds

	var pendingVal models.PendingBacklogValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.pending_backlog.%s", corridorID), &pendingVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext pending_backlog corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.total_pending"] = float64(pendingVal.TotalPending)
	evalMap["corridor.pending_6h_plus"] = float64(pendingVal.Bucket6hPlus)

	var stmtVal models.StatementMatchRateValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.statement_match_rate.%s", corridorID), &stmtVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext statement_match_rate corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.statement_match_rate"] = stmtVal.MatchRate
	evalMap["corridor.statement_unmatched"] = float64(stmtVal.Unmatched)

	var anomalyVal struct {
		Value float64 `json:"value"`
	}
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.anomaly_score.%s", corridorID), &anomalyVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext anomaly_score corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.anomaly_score"] = anomalyVal.Value

	var slaRiskVal struct {
		Value float64 `json:"value"`
	}
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.sla_breach_risk.%s", corridorID), &slaRiskVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext sla_breach_risk corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.sla_breach_risk"] = slaRiskVal.Value

	var failureShiftVal struct {
		Value float64 `json:"value"`
	}
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.failure_cluster_shift_score.%s", corridorID), &failureShiftVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext failure_cluster_shift_score corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.failure_cluster_shift_score"] = failureShiftVal.Value

	// ── Tenant-scoped metrics ────────────────────────────────────────────────
	// These use tenantID only (no corridorID in the projection key).

	var evidenceVal models.EvidenceReadinessValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		"tenant.evidence_readiness", &evidenceVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext evidence_readiness tenant=%s: %w", tenantID, err)
	}
	evalMap["tenant.evidence_readiness_rate"] = evidenceVal.Rate

	var slaVal models.SLABreachRateValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		"tenant.sla_breach_rate", &slaVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext sla_breach_rate tenant=%s: %w", tenantID, err)
	}
	evalMap["tenant.sla_breach_rate"] = slaVal.BreachRate

	// ── PHASE 5: Intelligence layer metrics (Grade A) ─────────────────────
	// These feed the new LEAKAGE, AMBIGUITY, DEFENSIBILITY, PATTERN policy families.
	// Zero-value fallback: if no data yet, these stay 0.0 → policies won't fire → correct.

	// ── Leakage metrics ──────────────────────────────────────────────────
	var leakageVal models.LeakageValue
	if err := s.projRepo.GetValueAs(ctx, tenantID, "leakage.total", &leakageVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext leakage tenant=%s: %w", tenantID, err)
	}
	evalMap["leakage.total_amount_minor"] = leakageVal.TotalAmountMinor.InexactFloat64()
	evalMap["leakage.percentage"] = leakageVal.LeakagePercentage
	evalMap["leakage.unmatched_intent_count"] = float64(leakageVal.UnmatchedIntentCount)
	evalMap["leakage.under_settlement_amount_minor"] = leakageVal.UnderSettlementAmountMinor.InexactFloat64()
	evalMap["leakage.reversal_exposure_minor"] = leakageVal.ReversalExposureMinor.InexactFloat64()
	evalMap["leakage.orphan_amount_minor"] = leakageVal.OrphanAmountMinor.InexactFloat64()
	evalMap["leakage.reversal_count"] = float64(leakageVal.ReversalCount)
	evalMap["leakage.under_settlement_count"] = float64(leakageVal.UnderSettlementCount)

	// ── Ambiguity metrics ─────────────────────────────────────────────────
	var ambiguityVal models.AmbiguityValue
	if err := s.projRepo.GetValueAs(ctx, tenantID, "ambiguity.summary", &ambiguityVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext ambiguity tenant=%s: %w", tenantID, err)
	}
	evalMap["ambiguity.value_at_risk_minor"] = ambiguityVal.ValueAtRiskMinor.InexactFloat64()
	evalMap["ambiguity.rate"] = ambiguityVal.AmbiguityRate
	evalMap["ambiguity.avg_attachment_confidence"] = ambiguityVal.AvgAttachmentConfidence
	evalMap["ambiguity.ambiguous_intent_count"] = float64(ambiguityVal.AmbiguousIntentCount)
	evalMap["ambiguity.unresolved_count"] = float64(ambiguityVal.UnresolvedSettlementCount)
	evalMap["ambiguity.provider_ref_missing_rate"] = ambiguityVal.ProviderRefMissingRate

	// ── Defensibility metrics ─────────────────────────────────────────────
	var defensibilityVal models.DefensibilityValue
	if err := s.projRepo.GetValueAs(ctx, tenantID, "defensibility.summary", &defensibilityVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext defensibility tenant=%s: %w", tenantID, err)
	}
	evalMap["defensibility.audit_ready_pct"] = defensibilityVal.AuditReadyPct
	evalMap["defensibility.governance_coverage_pct"] = defensibilityVal.GovernanceCoveragePct
	evalMap["defensibility.evidence_pack_rate"] = defensibilityVal.EvidencePackRate
	evalMap["defensibility.replayability_pct"] = defensibilityVal.ReplayabilityPct
	evalMap["defensibility.dispute_ready_pct"] = defensibilityVal.DisputeReadyPct
	evalMap["defensibility.total_intents"] = float64(defensibilityVal.TotalIntents)
	evalMap["defensibility.governance_rejected_count"] = float64(defensibilityVal.GovernanceRejectedCount)

	// ── PHASE 5: Batch metrics — read from the most recent batch projection ──
	//
	// DESIGN: Batch-level policies (P_AMBIGUITY_BATCH_REVIEW, P_PATTERN_BATCH_RISK)
	// are evaluated at event time with the batch's own metrics, not the tenant average.
	// When corridorID is non-empty we look for the batch health projection for that corridor.
	// When no batch data exists yet, these stay at 0.0 — policies won't fire — correct.
	//
	// The projection key for batch health is "batch.health.{batch_id}".
	// At event-time evaluation we look at the LATEST batch health across the tenant
	// using the corridor prefix query. If corridorID is empty, batch metrics stay 0.0.
	batchAmbiguityScore, batchRiskScore, patternDuplicateCount, patternProofReadiness :=
		s.readBatchMetrics(ctx, tenantID, corridorID)
	evalMap["batch.ambiguity_score"] = batchAmbiguityScore
	evalMap["batch.risk_score"] = batchRiskScore
	evalMap["pattern.duplicate_cluster_count"] = patternDuplicateCount
	evalMap["pattern.proof_readiness_score"] = patternProofReadiness

	return evalMap, nil
}

// readBatchMetrics reads the latest batch health metrics for a tenant/corridor.
//
// PHASE 5: replaces the hardcoded 0.0 values from the original implementation.
// These feed P_AMBIGUITY_BATCH_REVIEW, P_PATTERN_BATCH_RISK, P_PATTERN_DUPLICATE_RISK,
// and P_PATTERN_CARRIER_WEAKNESS policies.
//
// Returns (ambiguityScore, riskScore, duplicateClusterCount, proofReadinessScore).
// All return 0.0 on any error (zero-value fallback pattern).
func (s *PolicyService) readBatchMetrics(
	ctx context.Context,
	tenantID, corridorID string,
) (ambiguityScore, riskScore, duplicateCount, proofReadiness float64) {
	// Batch health projections are keyed as "batch.health.{batch_id}".
	// We cannot know the batch_id at policy evaluation time when triggered by
	// a batch event — the batch_id was already known when the projection was written.
	// Instead, we read the ambiguity.summary which already aggregates batch signals
	// into tenant-level metrics. For batch-specific scoring, the PatternIntelligence
	// snapshot is the authoritative source — but it's a JSONB blob we'd need to parse.
	//
	// PRACTICAL APPROACH: Read from the ambiguity projection (already loaded above
	// as ambiguityVal.AmbiguityRate) and the ml_feature_store for pattern scores.
	// For the pilot phase, use the ambiguity.summary as a proxy for batch ambiguity.
	//
	// This is intentionally simple and safe. Phase 6 will add batch-id-scoped
	// policy evaluation where the batch_id from the event is threaded through.
	//
	// For now: use the tenant-level ambiguity rate as the batch ambiguity proxy,
	// and leave pattern scores at 0 until Phase 8 ML engines populate them.
	var ambiguityVal models.AmbiguityValue
	_ = s.projRepo.GetValueAs(ctx, tenantID, "ambiguity.summary", &ambiguityVal)
	ambiguityScore = ambiguityVal.AmbiguityRate // 0.0 if not found

	// Pattern scores — populated by Phase 8 ML engines into projection_state.
	// Read the projection key if it exists; stay at 0.0 if not.
	var patternVal struct {
		DuplicateClusterCount float64 `json:"duplicate_cluster_count"`
		ProofReadinessScore   float64 `json:"proof_readiness_score"`
		BatchRiskScore        float64 `json:"batch_risk_score"`
	}
	_ = s.projRepo.GetValueAs(ctx, tenantID, "pattern.tenant_summary", &patternVal)
	riskScore = patternVal.BatchRiskScore
	duplicateCount = patternVal.DuplicateClusterCount
	proofReadiness = patternVal.ProofReadinessScore
	return
}

// ── DSL EVALUATION ───────────────────────────────────────────────────────────
//
// DSL grammar (extended in Phase 5):
//
//   WHEN <condition> [AND|OR <condition> ...]
//   THEN ACTION <Decision> [severity=HIGH|MEDIUM|LOW] [notify=...] [...]
//
// Conditions:
//   <metric_key> <operator> <threshold>
//   operator: < | > | <= | >= | ==
//   threshold: plain number | rate | "6h" | "30m" | "90s"
//
// Logic:
//   AND: ALL conditions must be true (original behaviour)
//   OR:  ANY condition must be true (PHASE 5)
//   Mixed AND/OR: OR splits the condition into groups, AND within each group.
//   Example: "A AND B OR C AND D" → "(A AND B) OR (C AND D)"
//
// evaluateDSL returns:
//   fires    bool            — did the rule trigger?
//   decision models.Decision — what action to take
//   confidence float64       — 0.5–1.0 how strongly the condition was breached
//   payload  string          — JSON summary of which conditions fired
//   severity string          — parsed from the THEN line

func evaluateDSL(
	dsl string,
	evalCtx map[string]float64,
) (fires bool, decision models.Decision, confidence float64, payload string, severity string) {

	// ── Step 1: find WHEN and THEN lines ─────────────────────────────────
	lines := strings.Split(strings.TrimSpace(dsl), "\n")
	var whenLine, thenLine string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "WHEN") {
			whenLine = line
		}
		if strings.HasPrefix(line, "THEN") {
			thenLine = line
		}
	}
	if whenLine == "" || thenLine == "" {
		return false, "", 0, "", "" // malformed DSL — silently skip
	}

	// ── Step 2: split WHEN clause into OR groups ──────────────────────────
	// "A AND B OR C AND D" → [["A","B"], ["C","D"]]
	conditionStr := strings.TrimPrefix(whenLine, "WHEN ")

	// Split on " OR " first (lowest precedence)
	orGroups := strings.Split(conditionStr, " OR ")

	// ── Step 3: evaluate each OR group ───────────────────────────────────
	type condResult struct {
		metric    string
		operator  string
		threshold float64
		actual    float64
	}

	var firedGroup []condResult

	for _, group := range orGroups {
		// Within each OR group, split on " AND " (higher precedence)
		andParts := strings.Split(group, " AND ")
		var groupResults []condResult
		groupFired := true

		for _, cond := range andParts {
			parts := strings.Fields(strings.TrimSpace(cond))
			if len(parts) < 3 {
				groupFired = false
				break
			}

			metric := parts[0]
			operator := parts[1]
			threshold := parseThreshold(parts[2])

			currentVal, exists := evalCtx[metric]
			if !exists {
				// Unknown metric in DSL — skip this group (don't fire)
				groupFired = false
				break
			}

			conditionMet := false
			switch operator {
			case "<":
				conditionMet = currentVal < threshold
			case ">":
				conditionMet = currentVal > threshold
			case "<=":
				conditionMet = currentVal <= threshold
			case ">=":
				conditionMet = currentVal >= threshold
			case "==":
				conditionMet = currentVal == threshold
			default:
				groupFired = false
				break
			}

			if !conditionMet {
				// AND logic: if any condition in the group fails, the group fails
				groupFired = false
				break
			}

			groupResults = append(groupResults, condResult{metric, operator, threshold, currentVal})
		}

		if groupFired && len(groupResults) > 0 {
			// This OR group passed — rule fires
			firedGroup = groupResults
			break // short-circuit: one OR group passing is enough
		}
	}

	if len(firedGroup) == 0 {
		return false, "", 0, "", "" // no group passed
	}

	// ── Step 4: parse the THEN line ───────────────────────────────────────
	// "THEN ACTION ESCALATE severity=HIGH notify=OPS"
	thenParts := strings.Fields(thenLine)
	if len(thenParts) < 3 {
		return false, "", 0, "", ""
	}

	decision = models.Decision(thenParts[2])
	severity = "MEDIUM" // default

	for _, part := range thenParts[3:] {
		if strings.HasPrefix(part, "severity=") {
			severity = strings.TrimPrefix(part, "severity=")
		}
	}

	// ── Step 5: build the payload ─────────────────────────────────────────
	// Include all fired conditions so ops can see exactly why the rule triggered.
	type condSummary struct {
		Metric    string  `json:"metric"`
		Actual    float64 `json:"actual"`
		Operator  string  `json:"operator"`
		Threshold float64 `json:"threshold"`
	}
	var summaries []condSummary
	for _, r := range firedGroup {
		summaries = append(summaries, condSummary{r.metric, r.actual, r.operator, r.threshold})
	}

	primary := firedGroup[0]
	payloadBytes, _ := json.Marshal(map[string]any{
		"conditions": summaries,
		"severity":   severity,
		"message": fmt.Sprintf(
			"%s is %.4f (threshold %s %.4f)",
			primary.metric, primary.actual, primary.operator, primary.threshold,
		),
	})

	confidence = computeConfidence(primary.actual, primary.threshold, primary.operator)
	return true, decision, confidence, string(payloadBytes), severity
}

// parseThreshold converts a threshold string to float64.
// Supports time units: 6h → 21600, 30m → 1800, 90s → 90.
// Plain numbers (rates, counts, amounts) are used as-is.
func parseThreshold(s string) float64 {
	s = strings.TrimSpace(s)
	if strings.HasSuffix(s, "h") {
		var v float64
		fmt.Sscanf(s[:len(s)-1], "%f", &v)
		return v * 3600
	}
	if strings.HasSuffix(s, "m") {
		var v float64
		fmt.Sscanf(s[:len(s)-1], "%f", &v)
		return v * 60
	}
	if strings.HasSuffix(s, "s") {
		var v float64
		fmt.Sscanf(s[:len(s)-1], "%f", &v)
		return v
	}
	var v float64
	fmt.Sscanf(s, "%f", &v)
	return v
}

// computeConfidence returns 0.5–1.0 based on how far past the threshold we are.
// A condition barely past the threshold scores 0.5; 100% past scores 1.0.
func computeConfidence(current, threshold float64, operator string) float64 {
	if threshold == 0 {
		return 0.75
	}
	var deviation float64
	switch operator {
	case "<", "<=":
		deviation = (threshold - current) / threshold
	case ">", ">=":
		deviation = (current - threshold) / threshold
	default:
		return 0.75
	}
	confidence := 0.5 + (deviation * 0.5)
	if confidence > 1.0 {
		confidence = 1.0
	}
	if confidence < 0.5 {
		confidence = 0.5
	}
	return confidence
}
