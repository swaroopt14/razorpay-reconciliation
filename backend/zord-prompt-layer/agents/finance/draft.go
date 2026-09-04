package finance

import (
	"fmt"
	"strings"
)

func Draft(st *FinanceInvestigationState) string {
	var b strings.Builder
	if st.Batch {
		return draftBatch(st)
	}
	for _, f := range st.Findings {
		b.WriteString(f)
		if !strings.HasSuffix(f, " ") && !strings.HasSuffix(f, ".") {
			b.WriteString(".")
		}
		if !strings.HasSuffix(strings.TrimSpace(b.String()), " ") {
			b.WriteString(" ")
		}
	}
	if st.Status != "" {
		fmt.Fprintf(&b, "Razorpay status remains %s. ", st.Status)
	}
	if st.ReconResult != "" {
		fmt.Fprintf(&b, "Reconciliation result is %s. ", st.ReconResult)
		if st.ReconResult == "AMBIGUOUS" {
			b.WriteString("Candidates stay AMBIGUOUS; the agent cannot force MATCHED. ")
		}
	}
	if st.ExceptionReason != "" {
		fmt.Fprintf(&b, "Structured exception reason: %s. ", st.ExceptionReason)
	}
	if rec := recommendation(st); rec != "" {
		fmt.Fprintf(&b, "Recommendation: %s. ", rec)
	}
	fmt.Fprintf(&b, "Financial impact is %d (copied from structured variance_amount). ", st.VarianceAmount)
	if len(st.EvidenceIDs) > 0 {
		b.WriteString("Cited evidence IDs: " + strings.Join(st.EvidenceIDs, ", ") + ".")
	} else {
		b.WriteString("No evidence IDs were returned; do not invent a bank row.")
	}
	return strings.TrimSpace(b.String())
}

func draftBatch(st *FinanceInvestigationState) string {
	groups := map[string]struct {
		count  int
		impact int64
	}{}
	total := int64(0)
	for _, ex := range st.Exceptions {
		reason := stringField(ex, "reason")
		if reason == "" {
			reason = "unspecified"
		}
		g := groups[reason]
		g.count++
		impact := intField(ex, "variance_amount")
		g.impact += impact
		total += impact
		groups[reason] = g
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Failed Razorpay payouts are investigated from exceptions only (MATCHED failed-with-no-movement is omitted). ")
	fmt.Fprintf(&b, "%d payout exception(s) grouped by structured reason. ", len(st.Exceptions))
	for reason, g := range groups {
		fmt.Fprintf(&b, "%s: count=%d impact=%d. ", reason, g.count, g.impact)
	}
	fmt.Fprintf(&b, "Financial impact is %d (copied from structured variance_amount). ", total)
	b.WriteString("Razorpay statuses are unchanged. Derived ledger lines are omitted when evidence is missing.")
	return strings.TrimSpace(b.String())
}

func recommendation(st *FinanceInvestigationState) string {
	if st.Recommendation != "" {
		return st.Recommendation
	}
	switch st.ExceptionReason {
	case "payout_open_past_sla":
		return "MONITOR"
	case "payout_failed_with_bank_movement":
		return "ESCALATE"
	case "payout_missing_bank":
		return "MONITOR"
	case "payout_reversed_unexplained":
		return "REQUEST_REVIEW"
	case "captured_missing_settlement", "open_status_no_downstream":
		return "WAIT"
	case "settlement_without_bank":
		return "MONITOR"
	default:
		if st.ReconResult == "UNRESOLVED" || st.ReconResult == "VARIANCE" || st.ReconResult == "CONFLICTED" {
			return "REQUEST_REVIEW"
		}
		return ""
	}
}

func exceptionMaps(body map[string]any) []map[string]any {
	if body == nil {
		return nil
	}
	raw, ok := body["exceptions"].([]any)
	if !ok {
		return nil
	}
	var out []map[string]any
	for _, v := range raw {
		if m, ok := v.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func stringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func intField(m map[string]any, key string) int64 {
	if m == nil {
		return 0
	}
	switch n := m[key].(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	default:
		return 0
	}
}

func stringSlice(m map[string]any, key string) []string {
	if m == nil {
		return nil
	}
	raw, ok := m[key].([]any)
	if !ok {
		return nil
	}
	var out []string
	for _, v := range raw {
		if s, ok := v.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

func appendUnique(in []string, v string) []string {
	for _, x := range in {
		if x == v {
			return in
		}
	}
	return append(in, v)
}

func errCode(m map[string]any) string {
	if m == nil {
		return ""
	}
	s, _ := m["error"].(string)
	return s
}
