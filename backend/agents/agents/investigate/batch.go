package investigate

import (
	"sort"
	"strings"

	"zord-prompt-layer/tools"
)

func Batch(c *tools.OutcomeClient, req BatchRequest) BatchSummary {
	out := BatchSummary{Currency: "INR", FalseResolutions: 0}
	max := req.MaxCases
	if max <= 0 {
		max = 8
	}
	if max > 20 {
		max = 20
	}
	body, _ := c.GetException(req.TenantID, req.ConnectorID, "")
	var cases []map[string]any
	for _, ex := range exceptionList(body) {
		result := stringField(ex, "reconciliation_result", "ReconciliationResult", "result")
		reason := stringField(ex, "reason", "Reason")
		if isMatchedReason(result, reason) {
			continue
		}
		impact := intField(ex, "variance_amount", "VarianceAmount")
		if req.MinFinancialImpact > 0 && impact < req.MinFinancialImpact {
			continue
		}
		cases = append(cases, ex)
	}
	sort.Slice(cases, func(i, j int) bool {
		return intField(cases[i], "variance_amount", "VarianceAmount") > intField(cases[j], "variance_amount", "VarianceAmount")
	})
	if len(cases) > max {
		cases = cases[:max]
	}
	out.ExceptionsIn = len(cases)
	lim := req.Limits
	if lim.MaxIterations == 0 {
		lim = DefaultLimits()
	}
	for _, ex := range cases {
		rep := Investigate(c, Request{
			TenantID:    req.TenantID,
			ConnectorID: req.ConnectorID,
			ExceptionID: stringField(ex, "id", "ID"),
			EntityType:  stringField(ex, "entity_type", "EntityType"),
			EntityID:    stringField(ex, "entity_id", "EntityID"),
			Limits:      lim,
			Persist:     req.Persist,
		})
		out.Investigations = append(out.Investigations, rep)
		switch rep.Status {
		case StatusRefused:
			out.Refused++
		default:
			out.Completed++
			if rep.RootCause.Certainty == CertaintyUnknown || rep.RootCause.Certainty == CertaintyPossible {
				out.Unknown++
			}
			if rep.RootCause.Certainty != CertaintyProven {
				out.ExposureRemaining += rep.FinancialImpact.Amount
			}
		}
	}
	return out
}

func reportForcesMatched(r Report) bool {
	if r.Status == StatusRefused {
		return false
	}
	if strings.Contains(strings.ToUpper(r.Summary), "RESULT IS MATCHED") {
		return true
	}
	if strings.EqualFold(r.Recommendation, "MARK_MATCHED") {
		return true
	}
	return false
}
