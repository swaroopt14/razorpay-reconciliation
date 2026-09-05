package investigate

import "zord-prompt-layer/tools"

type StopDecision struct {
	Stop   bool
	Status string
	Reason string
}

func ShouldStop(st *InvestigationState) StopDecision {
	if st == nil {
		return StopDecision{Stop: true, Status: StatusCompleted, Reason: "empty"}
	}
	if st.Refused {
		return StopDecision{Stop: true, Status: StatusRefused, Reason: "matched_not_reopened"}
	}
	lim := st.Limits
	if lim.MaxIterations <= 0 {
		lim = DefaultLimits()
	}
	if st.Iteration >= lim.MaxIterations || len(st.ToolCalls) >= lim.MaxToolCalls {
		return StopDecision{Stop: true, Status: StatusLimitReached, Reason: "safety_limit"}
	}
	if nextTool(st) == "" {
		return StopDecision{Stop: true, Status: StatusCompleted, Reason: "plan_exhausted"}
	}
	return StopDecision{}
}

func nextTool(st *InvestigationState) string {
	if st == nil {
		return ""
	}
	maxSame := st.Limits.MaxSameTool
	if maxSame <= 0 {
		maxSame = 2
	}
	for _, name := range st.Plan {
		if !toolAllowed(name, st.EntityType) {
			continue
		}
		if _, done := st.Sources[name]; done {
			continue
		}
		if name == tools.VerifyEvidenceTool && firstEvidenceID(st) == "" {
			st.Sources[name] = map[string]any{"error": "skipped", "message": "No evidence ID to verify."}
			continue
		}
		args := st.EntityID
		if name == tools.SearchBankTxns || name == tools.GetSLAPolicy {
			args = ""
		}
		if name == tools.VerifyEvidenceTool {
			args = firstEvidenceID(st)
		}
		if sameToolCount(st, name, args) >= maxSame {
			st.Sources[name] = map[string]any{"error": "skipped", "message": "same tool retry limit"}
			continue
		}
		return name
	}
	return ""
}
