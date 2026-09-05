package investigate

import (
	"fmt"
	"strings"

	"zord-prompt-layer/tools"
)

func BuildReport(st *InvestigationState) Report {
	if st == nil {
		return Report{Status: StatusCompleted, RootCause: RootCause{Category: ClassUnknown, Certainty: CertaintyUnknown}}
	}
	applyCertainty(st)
	recordFindings(st)
	dropFabricatedEvidence(st)
	writeSummary(st)

	if bad := forbiddenProse(st, st.Summary); len(bad) > 0 {
		st.Summary = safeSummary(st)
		st.Limitations = appendUnique(st.Limitations, "Unsupported claim language was replaced with an evidence-only summary.")
	}

	r := Report{
		InvestigationID:        st.InvestigationID,
		TenantID:               st.TenantID,
		EntityType:             st.EntityType,
		EntityID:               st.EntityID,
		ExceptionID:            st.ExceptionID,
		Status:                 st.Status,
		Classification:         st.Classification,
		RootCause:              RootCause{Category: st.RootCause, Certainty: st.Certainty},
		FinancialImpact:        Impact{Amount: st.ImpactMinor, Currency: st.Currency, Type: ImpactUnresolved},
		Findings:               st.Findings,
		Hypotheses:             st.Hypotheses,
		Evidence:               st.Evidence,
		MissingEvidence:        st.Missing,
		Recommendation:         st.Recommendation,
		Limitations:            st.Limitations,
		Summary:                st.Summary,
		Iterations:             st.Iteration,
		ToolCallCount:          len(st.ToolCalls),
		Phase6Result:           st.Phase6Result,
		ProviderStatus:         st.ProviderStatus,
		OutcomeInvestigationID: st.OutcomeID,
		Trace: &Trace{
			Plan:       append([]string{}, st.Plan...),
			ToolCalls:  append([]ToolCall{}, st.ToolCalls...),
			Hypotheses: append([]Hypothesis{}, st.Hypotheses...),
		},
	}
	if r.FinancialImpact.Currency == "" {
		r.FinancialImpact.Currency = "INR"
	}
	if r.Status == "" {
		r.Status = StatusCompleted
	}
	return r
}

func writeSummary(st *InvestigationState) {
	if st.Refused {
		st.Summary = "Nothing to investigate. Phase 6 already MATCHED this record. The agent will not re-open it or rewrite the Razorpay status."
		st.Limitations = appendUnique(st.Limitations, "Failed-with-no-movement / MATCHED records are not investigated.")
		st.Recommendation = "NONE"
		return
	}

	var b strings.Builder
	ent := st.EntityType
	if ent == "" {
		ent = "entity"
	}
	if st.ProviderStatus != "" {
		fmt.Fprintf(&b, "%s %s is marked %s by Razorpay. ", titleEntity(ent), st.EntityID, st.ProviderStatus)
	} else if st.EntityID != "" {
		fmt.Fprintf(&b, "Investigated %s %s. ", ent, st.EntityID)
	}

	bank := st.Sources[tools.SearchBankTxns]
	banks := sliceMaps(bank, "bank_transactions")
	switch {
	case bank == nil:
		// not searched
	case len(banks) == 0:
		b.WriteString("No bank transaction was returned. ")
	case len(banks) > 1:
		b.WriteString("Potential bank transactions were found; ownership is not proven. ")
	default:
		amt := intField(banks[0], "amount_minor", "AmountMinor", "amount")
		if amt == 0 {
			amt = st.ObservedAmount
		}
		if amt == 0 {
			amt = st.ImpactMinor
		}
		if amt != 0 {
			fmt.Fprintf(&b, "A bank movement of %d %s appears in tool JSON. ", amt, st.Currency)
		} else {
			b.WriteString("A bank movement appears in tool JSON. ")
		}
		if !bankUniqueToEntity(banks, st.EntityID) {
			b.WriteString("Ownership of that bank row is not proven. ")
		}
	}

	setl := st.Sources[tools.SearchSettlements]
	if setl == nil {
		setl = st.Sources[tools.GetSettlement]
	}
	if setl != nil && !tools.HasRecords(setl, "settlements") {
		b.WriteString("No corresponding settlement was found. ")
	}
	if ref := st.Sources[tools.GetRefund]; ref != nil && !tools.HasRecords(ref, "settlements") {
		b.WriteString("No corresponding refund was found. ")
	}
	if containsMissing(st, "ledger") {
		b.WriteString("No ledger entry is available in this phase. ")
	}

	if st.ImpactMinor != 0 {
		fmt.Fprintf(&b, "Therefore %d %s remains financially unaccounted for as unresolved exposure. ", st.ImpactMinor, st.Currency)
	}
	b.WriteString("Root cause is not proven from the available evidence. Permanent loss is not proven.")
	if strings.EqualFold(st.ProviderStatus, "processing") {
		b.WriteString(" The payout remains in Razorpay processing status and has exceeded the applicable expected processing window.")
	}
	st.Summary = strings.TrimSpace(b.String())
	st.Limitations = appendUnique(st.Limitations, "Root cause remains UNKNOWN unless evidence policy assigns a higher certainty. Permanent loss is not proven.")
	st.Limitations = appendUnique(st.Limitations, "The agent does not rewrite Razorpay status or force MATCHED.")
}

func safeSummary(st *InvestigationState) string {
	return fmt.Sprintf("Investigation of %s %s completed with certainty %s. Financial impact %d %s is unresolved exposure. Permanent loss is not proven.",
		st.EntityType, st.EntityID, st.Certainty, st.ImpactMinor, st.Currency)
}

func titleEntity(s string) string {
	if s == "" {
		return "Entity"
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func containsMissing(st *InvestigationState, name string) bool {
	for _, m := range st.Missing {
		if m == name {
			return true
		}
	}
	return false
}
