package repositories

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

func nullText(v sql.NullString) string {
	if !v.Valid || strings.TrimSpace(v.String) == "" {
		return "-"
	}
	return v.String
}
func nonEmptyParts(parts []string) []string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" || strings.HasSuffix(p, ": -") || strings.HasSuffix(p, ":") {
			continue
		}
		out = append(out, p)
	}
	return out
}

func safeOptional(v string) string {
	v = strings.TrimSpace(v)
	if v == "" || v == "-" || strings.EqualFold(v, "null") || strings.EqualFold(v, "<nil>") {
		return "Not available"
	}
	return v
}

func moneyFromMinor(raw string) string {
	return exactDBMoneyValue(raw)
}

func exactDBMoneyValue(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "-" || strings.EqualFold(raw, "null") || strings.EqualFold(raw, "<nil>") {
		return "Not available"
	}
	return "INR " + raw
}

func readableTime(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "-" || strings.EqualFold(raw, "null") {
		return "Not available"
	}

	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05.999999-07:00",
		"2006-01-02 15:04:05.999999999-07",
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05",
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.In(time.FixedZone("IST", 5*60*60+30*60)).Format("02 Jan 2006, 03:04 PM IST")
		}
	}

	if len(raw) >= 10 {
		return raw[:10]
	}
	return raw
}

func businessAction(decision string) string {
	switch strings.ToUpper(strings.TrimSpace(decision)) {
	case "ALLOW":
		return "Allowed to proceed"
	case "ESCALATE":
		return "Escalate for review"
	case "NOTIFY":
		return "Notify the responsible team"
	case "HOLD":
		return "Hold until reviewed"
	case "RETRY":
		return "Retry processing"
	case "GENERATE_EVIDENCE":
		return "Generate evidence pack"
	case "OPEN_OPS_INCIDENT":
		return "Open operations incident"
	case "ADVISORY_RECOMMENDATION":
		return "Review recommendation"
	case "PREPARE_AND_SIGN_RECOMMENDED":
		return "Prepare and sign recommended proof"
	case "DISPATCH_MODE_RECOMMENDED":
		return "Review dispatch mode recommendation"
	case "REQUEST_SOURCE_PATCH":
		return "Request source data correction"
	case "REVIEW_AMBIGUOUS_BATCH":
		return "Review unclear batch matches"
	case "REGENERATE_EVIDENCE":
		return "Regenerate evidence"
	case "REQUEST_STRONGER_CARRIER_CONTRACT":
		return "Request stronger reference data"
	default:
		return safeOptional(decision)
	}
}

func summarizeBusinessJSON(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "{}" || raw == "[]" {
		return ""
	}

	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()

	var value any
	if err := decoder.Decode(&value); err != nil {
		return ""
	}

	parts := make([]string, 0, 12)
	collectBusinessJSONParts("", value, &parts)

	if len(parts) == 0 {
		return ""
	}
	if len(parts) > 12 {
		parts = parts[:12]
	}
	return strings.Join(parts, " · ")
}

func collectBusinessJSONParts(prefix string, value any, parts *[]string) {
	if len(*parts) >= 12 {
		return
	}

	switch v := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(v))
		for k := range v {
			if isUnsafeIntelligenceJSONKey(k) {
				continue
			}
			keys = append(keys, k)
		}
		sort.Strings(keys)

		for _, k := range keys {
			nextPrefix := k
			if prefix != "" {
				nextPrefix = prefix + "." + k
			}
			collectBusinessJSONParts(nextPrefix, v[k], parts)
			if len(*parts) >= 12 {
				return
			}
		}

	case []any:
		if len(v) == 0 {
			return
		}
		*parts = append(*parts, fmt.Sprintf("%s: %d item(s)", businessMetricLabel(prefix), len(v)))

	case string:
		v = strings.TrimSpace(v)
		if v == "" || uuidRegex.MatchString(v) {
			return
		}
		*parts = append(*parts, fmt.Sprintf("%s: %s", businessMetricLabel(prefix), v))

	case json.Number:
		*parts = append(*parts, fmt.Sprintf("%s: %s", businessMetricLabel(prefix), businessNumber(prefix, v.String())))

	case float64:
		*parts = append(*parts, fmt.Sprintf("%s: %s", businessMetricLabel(prefix), businessNumber(prefix, strconv.FormatFloat(v, 'f', -1, 64))))

	case bool:
		*parts = append(*parts, fmt.Sprintf("%s: %t", businessMetricLabel(prefix), v))
	}
}

func isUnsafeIntelligenceJSONKey(key string) bool {
	k := strings.ToLower(strings.TrimSpace(key))
	if k == "" {
		return true
	}

	unsafeFragments := []string{
		"id",
		"tenant",
		"snapshot",
		"projection_ref",
		"scope_ref",
		"trace",
		"hash",
		"signature",
		"token",
		"secret",
		"encrypted",
		"raw",
		"payload",
	}

	for _, fragment := range unsafeFragments {
		if strings.Contains(k, fragment) {
			return true
		}
	}
	return false
}

func businessMetricLabel(key string) string {
	k := strings.ToLower(strings.TrimSpace(key))
	k = strings.TrimPrefix(k, ".")

	labels := map[string]string{
		"unmatched_amount_minor":        "Unmatched payment value",
		"orphan_amount_minor":           "Unlinked settlement value",
		"total_variance_minor":          "Payment value difference",
		"unexplained_variance_minor":    "Unexplained value difference",
		"whitelisted_deduction_minor":   "Expected deduction value",
		"duplicate_risk_exposure_minor": "Duplicate risk exposure",
		"risk_adjusted_leakage_minor":   "Value needing review",
		"ambiguous_value_at_risk":       "Unclear payment value",
		"ambiguous_amount_minor":        "Unclear payment value",
		"provider_ref_missing_rate":     "Missing bank/PSP reference rate",
		"missing_ref_count":             "Payments missing bank/PSP references",
		"avg_attachment_confidence":     "Average match confidence",
		"ambiguity_rate":                "Review rate",
		"ambiguous_intent_count":        "Payments needing match review",
		"candidate_collision_rate":      "Multiple match possibility rate",
		"carrier_completeness_rate":     "Reference completeness rate",
		"evidence_pack_coverage":        "Evidence coverage",
		"governance_coverage":           "Governance check coverage",
		"defensibility_score":           "Proof readiness score",
		"batch_anomaly_score":           "Batch anomaly score",
		"cluster_count":                 "RCA cluster count",
		"clustered_points":              "Clustered RCA points",
		"noise_points":                  "Unclustered RCA points",
		"total_affected_amount_minor":   "Total affected value",
		"total_points":                  "Total RCA points",
		"failed_count":                  "Failed payments",
		"pending_count":                 "Pending payments",
		"success_count":                 "Successful payments",
		"total_count":                   "Total payments",
		"total_intended_amount_minor":   "Total instructed value",
		"total_confirmed_amount_minor":  "Confirmed settlement value",
	}

	if label, ok := labels[k]; ok {
		return label
	}

	clean := strings.ReplaceAll(k, "_", " ")
	clean = strings.ReplaceAll(clean, ".", " ")
	clean = strings.TrimSpace(clean)
	if clean == "" {
		return "Metric"
	}
	return strings.Title(clean)
}

func businessNumber(key string, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "-" || strings.EqualFold(raw, "null") || strings.EqualFold(raw, "<nil>") {
		return "Not available"
	}

	k := strings.ToLower(key)
	if strings.Contains(k, "_minor") || strings.Contains(k, "amount_minor") || strings.Contains(k, "value_minor") {
		return exactDBMoneyValue(raw)
	}

	return raw
}
