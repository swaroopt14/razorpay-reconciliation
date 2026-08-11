package services

import (
	"fmt"
	"regexp"
	"strings"
	"zord-prompt-layer/client"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
)

func detectVizKind(q string) vizKind {
	s := strings.ToLower(q)
	switch {
	case strings.Contains(s, "failure") || strings.Contains(s, "error"):
		return vizTopFailures
	case strings.Contains(s, "sla") || strings.Contains(s, "breach"):
		return vizSLABreach
	case strings.Contains(s, "approval") || strings.Contains(s, "severity") || strings.Contains(s, "pending action"):
		return vizApprovalMix
	default:
		return vizCorridorHealth
	}
}
func containsAnyPhrase(s string, phrases []string) bool {
	for _, p := range phrases {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}
func hasTimeScopeSignal(q string) bool {
	s := strings.ToLower(strings.TrimSpace(q))
	timeSignals := []string{
		"today",
		"yesterday",
		"tomorrow",
		"this week",
		"last week",
		"this month",
		"last month",
		"this quarter",
		"last quarter",
		"this year",
		"last year",
		"last 7 days",
		"last seven days",
		"last 24 hours",
		"last hour",
		"recent",
		"recently",
		"current",
		"currently",
		"till now",
		"until now",
		"so far",
		"between",
		"from ",
		"since ",
		"financial year",
		"fy",
		"month-wise",
		"day-wise",
		"week-wise",
	}

	if containsAnyPhrase(s, timeSignals) {
		return true
	}

	dateLike := regexp.MustCompile(`(?i)\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\b`)
	return dateLike.MatchString(s)
}

func mapLLMClass(c string) queryClass {
	switch c {
	case "operational_data_query":
		return classOperational
	case "product_explanation":
		return classProduct
	case "navigation_or_how_to":
		return classNavigation
	case "evidence_or_dispute_query":
		return classEvidence
	case "out_of_scope":
		return classOutOfScope
	default:
		return classProduct
	}
}

func buildGeneralResponse() dto.QueryResponse {
	return dto.QueryResponse{
		Answer:        "**What I can help with**\n- Payout operations, intent flow, delays, failures, and retries.\n- Proof readiness, confirmation gaps, and tenant-scoped trends.\n- Ask a specific business question and I will keep the answer short and clear.",
		Confidence:    "high",
		EntitiesFound: dto.EntitiesFound{},
		Citations:     []dto.Citation{},
		NextActions:   []string{},
	}
}

func buildOutOfScopeResponse() dto.QueryResponse {
	return dto.QueryResponse{
		Answer:        "**That question is outside this workspace scope**\n- I can help with payout operations, intent behavior, callbacks, failures, and readiness insights.\n- Try asking about delays, pending items, confirmations, retries, or manual review.",
		Confidence:    "high",
		EntitiesFound: dto.EntitiesFound{},
		Citations:     []dto.Citation{},
		NextActions:   []string{},
	}
}
func buildClarificationResponse(question string) dto.QueryResponse {
	question = strings.TrimSpace(question)
	if question == "" {
		question = "Can you clarify whether you want tenant-wide status, a specific batch, a payment reference, settlement status, or proof/evidence status?"
	}

	return dto.QueryResponse{
		Answer:        question,
		Confidence:    "medium",
		EntitiesFound: dto.EntitiesFound{},
		Citations:     []dto.Citation{},
		NextActions:   []string{},
	}
}

func shouldAskPlannerClarification(plan QueryPlanDecision, req dto.QueryRequest, memorySummary string, historyContext string, history []ChatTurn) bool {
	if !plan.NeedsClarification {
		return false
	}

	if req.UIContext != nil {
		if strings.TrimSpace(req.UIContext.SelectedTitle) != "" ||
			strings.TrimSpace(req.UIContext.SelectedDescription) != "" ||
			strings.TrimSpace(req.UIContext.BatchID) != "" ||
			len(req.UIContext.SelectedMetrics) > 0 {
			return false
		}
	}

	if isConversationFollowupQuery(req.Query) && hasBusinessRelevantMemory(memorySummary, historyContext, history) {
		return false
	}

	if len(plan.ReferenceCandidates) > 0 && len(plan.RetrievalTargets) > 0 {
		return false
	}

	if plan.NeedsAuditSummary {
		return false
	}

	return true
}
func shouldReturnCitations(class queryClass, chunks []model.RetrievedChunk, confidence string) bool {
	if class != classOperational {
		return false
	}
	if len(chunks) == 0 {
		return false
	}
	return confidence == "high" || confidence == "medium"
}

func buildRCAContextBlock(rca *client.RCAClustersResponse) string {
	if rca == nil {
		return "RCA: unavailable"
	}
	modelVersion := "-"
	if rca.ModelVersion != nil && strings.TrimSpace(*rca.ModelVersion) != "" {
		modelVersion = strings.TrimSpace(*rca.ModelVersion)
	}
	return fmt.Sprintf(
		"RCA tenant summary: data_available=%t model_version=%s cluster_count=%d clustered_points=%d noise_points=%d total_points=%d returned_clusters=%d reason=%s",
		rca.DataAvailable, modelVersion, rca.ClusterCount, rca.ClusteredPoints, rca.NoisePoints, rca.TotalPoints, rca.ReturnedClusters, strings.TrimSpace(rca.Reason),
	)
}
