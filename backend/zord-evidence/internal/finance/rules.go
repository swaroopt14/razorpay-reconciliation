package finance

func RulesFromDecision(ev DecisionEvent) []RuleEval {
	reason := ev.Reason
	refs := ev.EvidenceRefs
	hasSettlement := refs.SettlementLineID != ""
	hasBank := refs.BankObservationID != "" || ev.ObservedAmount != 0
	hasRefund := reason == "failed_refund_no_bank_movement"
	rules := []RuleEval{
		{Rule: "SETTLEMENT_FOUND", Evaluated: true, Result: hasSettlement},
		{Rule: "BANK_MOVEMENT", Evaluated: true, Result: hasBank},
		{Rule: "REFUND_LINE_FOUND", Evaluated: true, Result: hasRefund},
	}
	switch reason {
	case "failed_with_bank_movement", "payout_failed_with_bank_movement":
		rules = append(rules, RuleEval{Rule: "FAILED_LIKE", Evaluated: true, Result: true})
	case "failed_no_money_movement", "failed_refund_no_bank_movement":
		rules = append(rules, RuleEval{Rule: "FAILED_LIKE", Evaluated: true, Result: true})
	case "captured_missing_settlement", "processed_exact_debit":
		rules = append(rules, RuleEval{Rule: "TERMINAL_SUCCESS", Evaluated: true, Result: true})
	case "payout_missing_bank":
		rules = append(rules, RuleEval{Rule: "PAYOUT_PROCESSED", Evaluated: true, Result: true})
	case "payout_open_past_sla", "open_status_no_downstream":
		rules = append(rules, RuleEval{Rule: "OPEN_PAST_SLA", Evaluated: true, Result: true})
	case "ambiguous_bank_candidates", "shared_utr_or_bank_candidates":
		rules = append(rules, RuleEval{Rule: "AMBIGUOUS_CANDIDATES", Evaluated: true, Result: true})
	}
	return rules
}

func CandidatesFromDecision(ev DecisionEvent) []Candidate {
	selected := ev.EvidenceRefs.BankObservationID
	if selected == "" {
		selected = ev.EvidenceRefs.SettlementLineID
	}
	seen := map[string]struct{}{}
	var out []Candidate
	if selected != "" {
		out = append(out, Candidate{Candidate: selected, Score: 1, Selected: true, Method: "EXACT"})
		seen[selected] = struct{}{}
	}
	for _, id := range ev.CandidateIDs {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		out = append(out, Candidate{Candidate: id, Score: 0.74, Selected: false, Method: "REJECTED"})
		seen[id] = struct{}{}
	}
	return out
}

func FindingCertainty(ev DecisionEvent) string {
	if ev.FindingCertainty != "" {
		return ev.FindingCertainty
	}
	switch ev.Result {
	case "MATCHED":
		return CertaintyProven
	case "AMBIGUOUS":
		return CertaintyPossible
	case "UNRESOLVED", "CONFLICTED", "VARIANCE", "ORPHAN":
		if ev.Reason == "failed_with_bank_movement" || ev.Reason == "payout_failed_with_bank_movement" {
			return CertaintyUnknown
		}
		return CertaintyLikely
	default:
		return CertaintyUnknown
	}
}

func ConfidenceBasis(ev DecisionEvent) []string {
	var basis []string
	if ev.EvidenceRefs.CanonicalPaymentID != "" || ev.EntityID != "" {
		basis = append(basis, "entity_record")
	}
	if ev.EvidenceRefs.BankObservationID != "" {
		basis = append(basis, "bank_movement_found")
	} else {
		basis = append(basis, "bank_missing")
	}
	if ev.EvidenceRefs.SettlementLineID != "" {
		basis = append(basis, "matching_settlement")
	} else {
		basis = append(basis, "settlement_missing")
	}
	return basis
}
