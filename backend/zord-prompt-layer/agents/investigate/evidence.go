package investigate

import (
	"strings"

	"zord-prompt-layer/tools"
)

func collectEvidence(st *InvestigationState, body map[string]any) {
	if st == nil || body == nil {
		return
	}
	for _, id := range tools.CollectFinanceEvidenceIDs(body) {
		if !validEvidenceID(id) {
			continue
		}
		st.Evidence = appendUnique(st.Evidence, id)
	}
	if refs := mapField(body, "evidence_refs"); refs != nil {
		for _, key := range []string{"bank_observation_id", "settlement_line_id", "canonical_payment_id"} {
			if id := stringField(refs, key); id != "" && !strings.HasPrefix(id, "ev_") {
				// Phase 6 source IDs are not finance evidence IDs.
				continue
			}
		}
	}
}

func validEvidenceID(id string) bool {
	return strings.HasPrefix(id, "ev_") && !strings.Contains(id, " ")
}

func dropFabricatedEvidence(st *InvestigationState) {
	if st == nil {
		return
	}
	allowed := map[string]struct{}{}
	for _, body := range st.Sources {
		for _, id := range tools.CollectFinanceEvidenceIDs(body) {
			if validEvidenceID(id) {
				allowed[id] = struct{}{}
			}
		}
	}
	var kept []string
	for _, id := range st.Evidence {
		if _, ok := allowed[id]; ok {
			kept = append(kept, id)
		}
	}
	st.Evidence = kept
}

func copyImpact(st *InvestigationState) {
	if st == nil {
		return
	}
	if st.Currency == "" {
		st.Currency = "INR"
	}
	if calc := st.Sources[tools.GetCalculationTrace]; calc != nil {
		if v, ok := tools.StructuredCalcVariance(calc); ok {
			st.ImpactMinor = v
			return
		}
	}
	if rec := reconOf(st.Sources[tools.GetPayment]); rec != nil {
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
	if rec := reconOf(st.Sources[tools.GetPayout]); rec != nil {
		if v := intField(rec, "variance_amount", "VarianceAmount"); v != 0 && st.ImpactMinor == 0 {
			st.ImpactMinor = v
		}
	}
	if ex := firstExceptionMap(st); ex != nil {
		if v := intField(ex, "variance_amount", "VarianceAmount"); v != 0 && st.ImpactMinor == 0 {
			st.ImpactMinor = v
		}
		if v := intField(ex, "expected_amount", "ExpectedAmount"); v != 0 {
			st.ExpectedAmount = v
		}
		if v := intField(ex, "observed_amount", "ObservedAmount"); v != 0 {
			st.ObservedAmount = v
		}
	}
}

func firstExceptionMap(st *InvestigationState) map[string]any {
	if st == nil {
		return nil
	}
	if body := st.Sources[tools.GetException]; body != nil {
		list := exceptionList(body)
		for _, ex := range list {
			if stringField(ex, "entity_id", "EntityID") == st.EntityID || st.EntityID == "" {
				return ex
			}
			if stringField(ex, "id", "ID") == st.ExceptionID && st.ExceptionID != "" {
				return ex
			}
		}
		if data := unwrapData(body); data != nil && stringField(data, "reason", "Reason") != "" {
			return data
		}
	}
	return nil
}

func recordFindings(st *InvestigationState) {
	if st == nil {
		return
	}
	st.Findings = nil
	st.Missing = nil
	keptLimits := append([]string{}, st.Limitations...)
	st.Limitations = nil

	if st.ProviderStatus != "" {
		st.Findings = append(st.Findings, Finding{
			Finding: "Provider status remains " + st.ProviderStatus + ".",
		})
	}
	if st.Phase6Result != "" {
		st.Findings = append(st.Findings, Finding{
			Finding: "Phase 6 reconciliation result is " + st.Phase6Result + ".",
		})
	}

	setl := st.Sources[tools.SearchSettlements]
	if setl == nil {
		setl = st.Sources[tools.GetSettlement]
	}
	if setl != nil {
		if tools.HasRecords(setl, "settlements") {
			st.Findings = append(st.Findings, Finding{Finding: "Settlement line(s) were returned."})
		} else {
			st.Findings = append(st.Findings, Finding{Finding: "No settlement line was returned for this entity."})
		}
	}

	refund := st.Sources[tools.GetRefund]
	if refund != nil {
		if tools.HasRecords(refund, "settlements") {
			st.Findings = append(st.Findings, Finding{Finding: "Refund settlement line(s) were returned."})
		} else {
			st.Findings = append(st.Findings, Finding{Finding: "No refund line was returned."})
		}
	}

	bank := st.Sources[tools.SearchBankTxns]
	if bank == nil {
		bank = st.Sources[tools.GetBankTransaction]
	}
	if bank != nil {
		rows := sliceMaps(bank, "bank_transactions")
		if len(rows) == 0 && !isNone(bank) && tools.HasRecords(bank, "id", "bank_transactions") {
			rows = []map[string]any{bank}
		}
		if len(rows) == 0 {
			st.Findings = append(st.Findings, Finding{Finding: "No bank transaction was returned."})
		} else if len(rows) == 1 {
			amt := intField(rows[0], "amount_minor", "AmountMinor", "amount")
			f := Finding{Finding: "Potential bank transaction found; ownership is not proven."}
			if amt != 0 {
				f.Value = amt
				f.Currency = st.Currency
			}
			if bankUniqueToEntity(rows, st.EntityID) {
				f.Finding = "A bank movement exists in tool JSON; relationship is still not a proven root cause."
			}
			st.Findings = append(st.Findings, f)
		} else {
			st.Findings = append(st.Findings, Finding{
				Finding: "Multiple bank candidates were returned; ownership is not proven.",
			})
		}
	}

	if led := st.Sources[tools.GetLedgerEntry]; led != nil {
		if tools.LedgerEmpty(led) || isNone(led) {
			st.Missing = appendUnique(st.Missing, "ledger")
			st.Limitations = appendUnique(st.Limitations, "No derived ledger lines were returned. Do not invent a ledger entry.")
		}
	}
	if refund := st.Sources[tools.GetRefund]; refund != nil && !tools.HasRecords(refund, "settlements") {
		st.Missing = appendUnique(st.Missing, "refund_api")
	}

	if st.ImpactMinor != 0 {
		st.Findings = append(st.Findings, Finding{
			Finding:  "Financial impact copied from structured variance.",
			Value:    st.ImpactMinor,
			Currency: st.Currency,
		})
	}
	for _, l := range keptLimits {
		st.Limitations = appendUnique(st.Limitations, l)
	}
}

func forbiddenProse(st *InvestigationState, text string) []string {
	low := strings.ToLower(text)
	var bad []string
	if strings.Contains(low, "stuck") && !strings.EqualFold(st.ProviderStatus, "stuck") {
		bad = append(bad, "STUCK")
	}
	if strings.Contains(low, "sla_breach") {
		bad = append(bad, "SLA_BREACH")
	}
	if strings.Contains(low, "incorrectly processed") || strings.Contains(low, "incorrectly settled") {
		bad = append(bad, "unsupported_provider_fault")
	}
	if strings.Contains(low, "was lost") || strings.Contains(low, "permanent loss") && !strings.Contains(low, "not proven") {
		bad = append(bad, "unsupported_loss")
	}
	if strings.Contains(low, "fully reconciled") && !strings.Contains(low, "not fully") {
		bad = append(bad, "fully_reconciled")
	}
	hasBank := false
	if b := st.Sources[tools.SearchBankTxns]; b != nil {
		hasBank = len(sliceMaps(b, "bank_transactions")) > 0
	}
	if !hasBank && (strings.Contains(low, "bank received") || strings.Contains(low, "bank credit exists")) {
		bad = append(bad, "invented_bank")
	}
	hasSetl := false
	if s := st.Sources[tools.SearchSettlements]; s != nil {
		hasSetl = tools.HasRecords(s, "settlements")
	}
	if s := st.Sources[tools.GetSettlement]; s != nil {
		hasSetl = hasSetl || tools.HasRecords(s, "settlements")
	}
	if !hasSetl && strings.Contains(low, "was settled") {
		bad = append(bad, "invented_settlement")
	}
	return bad
}
