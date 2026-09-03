package investigate

import (
	"strings"

	"zord-prompt-layer/tools"
)

func Investigate(c *tools.OutcomeClient, req Request) Report {
	st := Run(c, req)
	return persistIfRequested(c, req, BuildReport(st), st)
}

func Run(c *tools.OutcomeClient, req Request) *InvestigationState {
	st := newState(req)
	if c == nil {
		st.Status = StatusCompleted
		st.Limitations = append(st.Limitations, "No finance tool client was configured.")
		st.Certainty = CertaintyUnknown
		return st
	}
	if !loadSeed(c, st) {
		st.Status = StatusCompleted
		return st
	}
	if st.Refused {
		st.Status = StatusRefused
		return st
	}
	st.Plan = BuildPlan(st.EntityType, st.ExceptionReason)
	st.Hypotheses = GenerateHypotheses(st.ExceptionReason, st.EntityType)
	st.Status = StatusRunning
	runLoop(c, st)
	copyImpact(st)
	EvaluateHypotheses(st)
	return st
}

func newState(req Request) *InvestigationState {
	lim := req.Limits
	if lim.MaxIterations == 0 {
		lim = DefaultLimits()
	}
	et := req.EntityType
	if et == "" {
		if strings.HasPrefix(strings.ToLower(req.EntityID), "pout_") {
			et = "payout"
		} else if req.EntityID != "" {
			et = "payment"
		}
	}
	return &InvestigationState{
		InvestigationID: newInvestigationID(),
		TenantID:        req.TenantID,
		ConnectorID:     req.ConnectorID,
		EntityType:      et,
		EntityID:        req.EntityID,
		ExceptionID:     req.ExceptionID,
		Sources:         map[string]map[string]any{},
		Currency:        "INR",
		Limits:          lim,
		Status:          StatusRunning,
	}
}

func loadSeed(c *tools.OutcomeClient, st *InvestigationState) bool {
	var body map[string]any
	if st.ExceptionID != "" {
		body, _ = c.GetException(st.TenantID, st.ConnectorID, st.ExceptionID)
	} else {
		body, _ = c.GetException(st.TenantID, st.ConnectorID, "")
	}
	if body != nil {
		recordCall(st, tools.GetException, st.ExceptionID, body, nil)
		if ex := pickException(body, st.ExceptionID, st.EntityID); ex != nil {
			applyException(st, ex)
		}
	}

	if st.EntityID != "" {
		var primary map[string]any
		var err error
		name := tools.GetPayment
		if strings.EqualFold(st.EntityType, "payout") {
			name = tools.GetPayout
			primary, err = c.GetPayout(st.TenantID, st.ConnectorID, st.EntityID)
		} else {
			primary, err = c.GetPayment(st.TenantID, st.ConnectorID, st.EntityID)
		}
		recordCall(st, name, st.EntityID, primary, err)
		applyPrimary(st, primary)
	}

	if st.EntityID == "" && st.ExceptionID == "" {
		st.Limitations = append(st.Limitations, "exception_id or entity_id is required.")
		st.Certainty = CertaintyUnknown
		return false
	}
	if isMatchedReason(st.Phase6Result, st.ExceptionReason) {
		st.Refused = true
		return true
	}
	return true
}

func pickException(body map[string]any, exceptionID, entityID string) map[string]any {
	list := exceptionList(body)
	for _, ex := range list {
		if exceptionID != "" && (stringField(ex, "id", "ID") == exceptionID) {
			return ex
		}
		if entityID != "" && stringField(ex, "entity_id", "EntityID") == entityID {
			return ex
		}
	}
	if exceptionID != "" {
		if data := unwrapData(body); data != nil && stringField(data, "reason", "Reason") != "" {
			return data
		}
	}
	if len(list) == 1 && entityID == "" {
		return list[0]
	}
	return nil
}

func applyException(st *InvestigationState, ex map[string]any) {
	if id := stringField(ex, "id", "ID"); id != "" {
		st.ExceptionID = id
	}
	if et := stringField(ex, "entity_type", "EntityType"); et != "" {
		st.EntityType = et
	}
	if eid := stringField(ex, "entity_id", "EntityID"); eid != "" && st.EntityID == "" {
		st.EntityID = eid
	}
	st.ExceptionReason = stringField(ex, "reason", "Reason")
	if r := stringField(ex, "reconciliation_result", "ReconciliationResult"); r != "" {
		st.Phase6Result = r
	}
	if v := intField(ex, "variance_amount", "VarianceAmount"); v != 0 {
		st.ImpactMinor = v
	}
	if v := intField(ex, "expected_amount", "ExpectedAmount"); v != 0 {
		st.ExpectedAmount = v
	}
	if v := intField(ex, "observed_amount", "ObservedAmount"); v != 0 {
		st.ObservedAmount = v
	}
}

func applyPrimary(st *InvestigationState, primary map[string]any) {
	if primary == nil || isNone(primary) {
		if errCode(primary) == "unavailable" || errCode(primary) == "tenant_isolation" {
			st.Limitations = appendUnique(st.Limitations, "Primary record was not returned for this tenant. Do not invent one.")
		}
		return
	}
	if st.ProviderStatus == "" {
		st.ProviderStatus = stringField(primary, "status", "provider_status", "provider_status")
	}
	if rec := reconOf(primary); rec != nil {
		if r := stringField(rec, "result", "Result"); r != "" {
			st.Phase6Result = r
		}
		if reason := stringField(rec, "reason", "Reason"); reason != "" && st.ExceptionReason == "" {
			st.ExceptionReason = reason
		}
		if v := intField(rec, "variance_amount", "VarianceAmount"); v != 0 && st.ImpactMinor == 0 {
			st.ImpactMinor = v
		}
		if v := intField(rec, "expected_amount", "ExpectedAmount"); v != 0 {
			st.ExpectedAmount = v
		}
		if v := intField(rec, "observed_amount", "ObservedAmount"); v != 0 {
			st.ObservedAmount = v
		}
	}
	if cur := stringField(primary, "currency", "Currency"); cur != "" {
		st.Currency = cur
	}
}

func applySourceFacts(st *InvestigationState, name string, body map[string]any) {
	switch name {
	case tools.GetPayment, tools.GetPayout, tools.GetPaymentEvents, tools.GetPayoutEvents, tools.GetReconciliation:
		applyPrimary(st, body)
	case tools.GetException:
		if ex := pickException(body, st.ExceptionID, st.EntityID); ex != nil {
			applyException(st, ex)
		}
	}
	if errCode(body) == "source_not_in_this_phase" || (name == tools.GetLedgerEntry && tools.LedgerEmpty(body)) {
		if name == tools.GetLedgerEntry {
			st.Missing = appendUnique(st.Missing, "ledger")
		}
	}
}

func toolSummary(name string, body map[string]any) string {
	if isNone(body) {
		if msg := stringField(body, "message"); msg != "" {
			return msg
		}
		return "none"
	}
	if tools.HasRecords(body, "settlements") {
		return "settlements_found"
	}
	if tools.HasRecords(body, "bank_transactions") {
		return "bank_rows_found"
	}
	if stringField(body, "status", "provider_status") != "" {
		return "status=" + stringField(body, "status", "provider_status")
	}
	return name + "_ok"
}

func persistIfRequested(c *tools.OutcomeClient, req Request, report Report, st *InvestigationState) Report {
	if !req.Persist || c == nil {
		return report
	}
	body, err := c.CreateInvestigation(st.TenantID, st.ConnectorID, st.ExceptionID, st.EntityID)
	if err != nil || body == nil {
		report.Limitations = appendUnique(report.Limitations, "Outcome investigation persist was skipped or failed; report is still valid.")
		return report
	}
	data := unwrapData(body)
	if id := stringField(data, "id", "ID"); id != "" {
		report.OutcomeInvestigationID = id
		st.OutcomeID = id
	}
	return report
}

func Resume(c *tools.OutcomeClient, st *InvestigationState, persist bool) Report {
	if st == nil {
		return Report{Status: StatusCompleted, RootCause: RootCause{Category: ClassUnknown, Certainty: CertaintyUnknown}}
	}
	if st.Status == StatusCompleted || st.Status == StatusRefused {
		return BuildReport(st)
	}
	req := Request{TenantID: st.TenantID, ConnectorID: st.ConnectorID, ExceptionID: st.ExceptionID, EntityType: st.EntityType, EntityID: st.EntityID, Limits: st.Limits, Persist: persist}
	st.Status = StatusRunning
	runLoop(c, st)
	return persistIfRequested(c, req, BuildReport(st), st)
}

func runLoop(c *tools.OutcomeClient, st *InvestigationState) {
	for {
		name := nextTool(st)
		dec := ShouldStop(st)
		if dec.Stop && name == "" {
			st.Status = dec.Status
			if dec.Status == StatusLimitReached {
				st.Limitations = appendUnique(st.Limitations, "INVESTIGATION_LIMIT_REACHED. Certainty stays UNKNOWN.")
				st.Certainty = CertaintyUnknown
			}
			if st.Status == "" {
				st.Status = StatusCompleted
			}
			return
		}
		if name == "" {
			st.Status = StatusCompleted
			return
		}
		if st.Iteration >= st.Limits.MaxIterations || len(st.ToolCalls) >= st.Limits.MaxToolCalls {
			st.Status = StatusLimitReached
			st.Limitations = appendUnique(st.Limitations, "INVESTIGATION_LIMIT_REACHED. Certainty stays UNKNOWN.")
			st.Certainty = CertaintyUnknown
			return
		}
		st.Iteration++
		body, args, err := executeTool(c, st, name)
		recordCall(st, name, args, body, err)
		collectEvidence(st, body)
		applySourceFacts(st, name, body)
		EvaluateHypotheses(st)
		copyImpact(st)
	}
}

func recordCall(st *InvestigationState, name, args string, body map[string]any, err error) {
	if body == nil && err != nil {
		body = map[string]any{"error": "unavailable", "message": err.Error()}
	}
	if body == nil {
		body = map[string]any{"error": "none", "message": "No record was returned. Do not invent one."}
	}
	st.Sources[name] = body
	st.ToolCalls = append(st.ToolCalls, ToolCall{
		Name:    name,
		Args:    args,
		OK:      err == nil && !isNone(body),
		Error:   errCode(body),
		Summary: toolSummary(name, body),
	})
}
