package investigate

import (
	"strings"

	"zord-prompt-layer/tools"
)

func GenerateHypotheses(reason, entityType string) []Hypothesis {
	reason = strings.ToLower(strings.TrimSpace(reason))
	switch {
	case reason == "failed_with_bank_movement" || reason == "payout_failed_with_bank_movement":
		return []Hypothesis{
			{ID: "H1", Statement: "Settled despite provider failure", Status: HypPossible, RequiredEvidence: []string{"settlement_record"}},
			{ID: "H2", Statement: "Refunded after failure", Status: HypPossible, RequiredEvidence: []string{"refund_record"}},
			{ID: "H3", Statement: "Bank transaction belongs to another payment", Status: HypPossible, RequiredEvidence: []string{"unique_payment_id_on_bank"}},
			{ID: "H4", Statement: "Unexplained financial movement", Status: HypPossible, RequiredEvidence: []string{"bank_row"}},
			{ID: "H5", Statement: "Bank candidate is unrelated / false candidate", Status: HypPossible, RequiredEvidence: []string{"utr_or_unique_match"}},
			{ID: "H6", Statement: "Evidence is insufficient to determine root cause", Status: HypPossible},
		}
	case reason == "captured_missing_settlement":
		return []Hypothesis{
			{ID: "H1", Statement: "Settlement line is missing for a captured payment", Status: HypPossible, RequiredEvidence: []string{"settlement_record"}},
			{ID: "H2", Statement: "Bank movement exists without settlement", Status: HypPossible, RequiredEvidence: []string{"bank_row"}},
			{ID: "H6", Statement: "Evidence is insufficient to determine root cause", Status: HypPossible},
		}
	case reason == "amount_mismatch":
		return []Hypothesis{
			{ID: "H1", Statement: "Fee/tax/adjustment explains the amount difference", Status: HypPossible, RequiredEvidence: []string{"calculation_trace"}},
			{ID: "H2", Statement: "Bank amount differs from expected net", Status: HypPossible, RequiredEvidence: []string{"bank_row"}},
			{ID: "H6", Statement: "Evidence is insufficient to determine root cause", Status: HypPossible},
		}
	case reason == "ambiguous_bank_candidates" || reason == "shared_utr_or_bank_candidates":
		return []Hypothesis{
			{ID: "H3", Statement: "More than one bank candidate; ownership is not proven", Status: HypPossible},
			{ID: "H5", Statement: "Bank candidate is unrelated / false candidate", Status: HypPossible},
			{ID: "H6", Statement: "Evidence is insufficient to determine root cause", Status: HypPossible},
		}
	case reason == "payout_missing_bank" || reason == "settlement_without_bank":
		return []Hypothesis{
			{ID: "H1", Statement: "Authoritative record exists without a matching bank movement", Status: HypPossible, RequiredEvidence: []string{"bank_row"}},
			{ID: "H6", Statement: "Evidence is insufficient to determine root cause", Status: HypPossible},
		}
	case reason == "payout_open_past_sla":
		return []Hypothesis{
			{ID: "H1", Statement: "Payout remains in an open Razorpay status past the expected window", Status: HypPossible, RequiredEvidence: []string{"sla_policy"}},
			{ID: "H6", Statement: "Evidence is insufficient to determine root cause", Status: HypPossible},
		}
	default:
		if strings.EqualFold(entityType, "payout") {
			return []Hypothesis{
				{ID: "H1", Statement: "Payout bank story is incomplete", Status: HypPossible},
				{ID: "H6", Statement: "Evidence is insufficient to determine root cause", Status: HypPossible},
			}
		}
		return []Hypothesis{
			{ID: "H6", Statement: "Evidence is insufficient to determine root cause", Status: HypPossible},
		}
	}
}

func EvaluateHypotheses(st *InvestigationState) {
	if st == nil {
		return
	}
	setl := st.Sources[tools.SearchSettlements]
	if setl == nil {
		setl = st.Sources[tools.GetSettlement]
	}
	refund := st.Sources[tools.GetRefund]
	bank := st.Sources[tools.SearchBankTxns]
	if bank == nil {
		bank = st.Sources[tools.GetBankTransaction]
	}
	calc := st.Sources[tools.GetCalculationTrace]
	hasSetl := tools.HasRecords(setl, "settlements")
	hasRefund := tools.HasRecords(refund, "settlements")
	banks := sliceMaps(bank, "bank_transactions")
	hasBank := len(banks) > 0
	uniqueOwner := bankUniqueToEntity(banks, st.EntityID)
	hasUTR := bankHasUTR(banks)
	_, hasCalc := tools.StructuredCalcVariance(calc)

	for i := range st.Hypotheses {
		h := &st.Hypotheses[i]
		switch h.ID {
		case "H1":
			switch st.ExceptionReason {
			case "failed_with_bank_movement", "payout_failed_with_bank_movement":
				if setl != nil {
					if hasSetl {
						h.Status = HypPossible
					} else {
						h.Status = HypContradicted
					}
				}
			case "captured_missing_settlement":
				if setl != nil && !hasSetl {
					h.Status = HypSupported
				}
			case "amount_mismatch":
				if calc != nil && hasCalc {
					h.Status = HypPossible
				}
			case "payout_missing_bank", "settlement_without_bank":
				if bank != nil && !hasBank {
					h.Status = HypSupported
				}
			case "payout_open_past_sla":
				if strings.EqualFold(st.ProviderStatus, "processing") || strings.EqualFold(st.ProviderStatus, "queued") ||
					strings.EqualFold(st.ProviderStatus, "pending") {
					h.Status = HypSupported
				}
			}
		case "H2":
			if refund != nil && !hasRefund {
				h.Status = HypContradicted
			} else if bank != nil && hasBank && st.ExceptionReason == "captured_missing_settlement" {
				h.Status = HypPossible
			} else if bank != nil && hasBank && st.ExceptionReason == "amount_mismatch" {
				h.Status = HypSupported
			}
		case "H3":
			if hasBank && !uniqueOwner {
				h.Status = HypPossible
			} else if hasBank && uniqueOwner && len(banks) == 1 {
				h.Status = HypContradicted
			}
			if len(banks) > 1 {
				h.Status = HypSupported
			}
		case "H4":
			if hasBank && !hasSetl && !hasRefund {
				h.Status = HypSupported
			}
		case "H5":
			if hasBank && (!hasUTR || !uniqueOwner || len(banks) > 1) {
				h.Status = HypPossible
			} else if hasBank && uniqueOwner && hasUTR && len(banks) == 1 {
				h.Status = HypContradicted
			}
		case "H6":
			if !AllowProven(st) {
				h.Status = HypSupported
			}
		}
	}
}

func bankUniqueToEntity(banks []map[string]any, entityID string) bool {
	if len(banks) != 1 || entityID == "" {
		return false
	}
	id := stringField(banks[0], "payment_id", "PaymentID", "entity_id", "EntityID", "payout_id", "PayoutID")
	return id != "" && id == entityID
}

func bankHasUTR(banks []map[string]any) bool {
	for _, b := range banks {
		if stringField(b, "utr", "UTR", "raw_reference", "reference") != "" {
			return true
		}
	}
	return false
}

func AllowProven(st *InvestigationState) bool {
	if st == nil {
		return false
	}
	switch st.ExceptionReason {
	case "failed_with_bank_movement", "payout_failed_with_bank_movement",
		"ambiguous_bank_candidates", "shared_utr_or_bank_candidates":
		return false
	}
	for _, h := range st.Hypotheses {
		if h.Status == HypProven {
			return false
		}
	}
	return false
}

func applyCertainty(st *InvestigationState) {
	st.Classification = ClassifyReason(st.ExceptionReason, st.EntityType)
	st.Recommendation = Recommend(st.ExceptionReason)
	st.RootCause = ClassUnknown
	st.Certainty = CertaintyUnknown

	if st.Refused {
		st.RootCause = ClassUnknown
		st.Certainty = CertaintyUnknown
		st.Classification = ClassUnknown
		return
	}

	switch st.ExceptionReason {
	case "failed_with_bank_movement":
		st.Classification = ClassFailedMovement
		st.RootCause = ClassUnknown
		st.Certainty = CertaintyUnknown
		return
	case "payout_failed_with_bank_movement":
		st.Classification = ClassPayoutFailedMove
		st.RootCause = ClassUnknown
		st.Certainty = CertaintyUnknown
		return
	case "ambiguous_bank_candidates", "shared_utr_or_bank_candidates":
		st.Classification = ClassAmbiguousBank
		st.RootCause = ClassAmbiguousBank
		st.Certainty = CertaintyUnknown
		return
	}

	if AllowProven(st) {
		st.Certainty = CertaintyProven
		st.RootCause = st.Classification
		return
	}

	supported := false
	for _, h := range st.Hypotheses {
		if h.ID != "H6" && h.Status == HypSupported {
			supported = true
		}
	}
	if supported {
		st.Certainty = CertaintyLikely
		st.RootCause = st.Classification
		return
	}
	st.Certainty = CertaintyUnknown
	if st.Classification != "" {
		st.RootCause = st.Classification
	}
}
