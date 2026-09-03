package askzord

import (
	"regexp"
	"strconv"
	"strings"
)

var evRe = regexp.MustCompile(`ev_[A-Za-z0-9_-]+`)
var numRe = regexp.MustCompile(`\b\d{3,}\b`)

func Validate(answer string, ctx FinanceContext) (string, []string) {
	var extra []string
	if !numericOK(answer, ctx) {
		extra = append(extra, "Numeric claim rejected; using structured values only.")
		return "", extra
	}
	if !statusOK(answer, ctx) {
		extra = append(extra, "Status or reconciliation wording rejected.")
		return "", extra
	}
	cleaned, dropped := filterEvidenceIDs(answer, ctx.Evidence)
	if dropped {
		extra = append(extra, "Fabricated evidence IDs were dropped.")
	}
	if lossForbidden(cleaned, ctx) {
		extra = append(extra, "Unresolved exposure is not proven permanent loss.")
		return "", extra
	}
	return cleaned, extra
}

func numericOK(answer string, ctx FinanceContext) bool {
	allowed := map[string]struct{}{}
	for _, f := range ctx.Facts {
		if n, ok := intish(f.Value); ok {
			allowed[strconv.FormatInt(n, 10)] = struct{}{}
		}
	}
	for _, c := range ctx.Calculations {
		allowed[strconv.FormatInt(c.Output, 10)] = struct{}{}
	}
	for _, m := range numRe.FindAllString(answer, -1) {
		if len(m) <= 3 {
			continue
		}
		if _, ok := allowed[m]; !ok {
			return false
		}
	}
	return true
}

func statusOK(answer string, ctx FinanceContext) bool {
	low := strings.ToLower(answer)
	status := strings.ToLower(factString(ctx, "provider_status"))
	result := strings.ToUpper(factString(ctx, "reconciliation_result"))
	if containsWord(low, "stuck") || strings.Contains(low, "sla_breach") {
		if status != "stuck" {
			return false
		}
	}
	if (strings.Contains(low, "reached the bank") || strings.Contains(low, "funds have reached") ||
		strings.Contains(low, "bank credited") || strings.Contains(low, "credited to the bank")) && !ctx.BankProven {
		if strings.Contains(low, "not proven") || strings.Contains(low, "no corresponding") ||
			strings.Contains(low, "has not been found") || strings.Contains(low, "not bank credited") ||
			strings.Contains(low, "is not bank") {
			return true
		}
		return false
	}
	if strings.Contains(low, "fully reconciled") {
		if strings.Contains(low, "not fully reconciled") || strings.Contains(low, "is not fully") {
			// allowed: MATCHED ≠ fully reconciled
		} else if result == "MATCHED" && ctx.BankProven {
			return true
		} else {
			return false
		}
	}
	return true
}

func filterEvidenceIDs(answer string, allowed []string) (string, bool) {
	ok := map[string]struct{}{}
	for _, id := range allowed {
		ok[id] = struct{}{}
	}
	dropped := false
	out := evRe.ReplaceAllStringFunc(answer, func(id string) string {
		if _, yes := ok[id]; yes {
			return id
		}
		dropped = true
		return ""
	})
	return strings.Join(strings.Fields(out), " "), dropped
}

func lossForbidden(answer string, ctx FinanceContext) bool {
	if !ctx.Plan.LossQuestion {
		low := strings.ToLower(answer)
		return strings.Contains(low, "we lost") || strings.Contains(low, "permanent loss")
	}
	return false
}

func containsWord(s, w string) bool {
	return strings.Contains(s, w)
}

// RejectRewrite reports whether an injected LLM rewrite must be discarded.
func RejectRewrite(rewrite string, ctx FinanceContext) bool {
	if rewrite == "" {
		return true
	}
	if !numericOK(rewrite, ctx) || !statusOK(rewrite, ctx) || lossForbidden(rewrite, ctx) {
		return true
	}
	if _, dropped := filterEvidenceIDs(rewrite, ctx.Evidence); dropped {
		return true
	}
	return false
}
