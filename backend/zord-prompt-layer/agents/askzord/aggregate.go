package askzord

func SummaryFromExceptions(body map[string]any) map[string]any {
	list := exceptionMaps(body)
	byReason := map[string]map[string]any{}
	var exposure int64
	for _, ex := range list {
		reason := stringField(ex, "reason")
		if reason == "" {
			reason = "unspecified"
		}
		v := intField(ex, "variance_amount")
		exposure += v
		g := byReason[reason]
		if g == nil {
			g = map[string]any{"reason": reason, "count": 0, "exposure_minor": int64(0)}
		}
		g["count"] = intField(g, "count") + 1
		g["exposure_minor"] = intField(g, "exposure_minor") + v
		byReason[reason] = g
	}
	reasons := make([]any, 0, len(byReason))
	for _, g := range byReason {
		reasons = append(reasons, g)
	}
	return map[string]any{
		"exposure_minor":     exposure,
		"exception_count":    len(list),
		"exposure_by_reason": reasons,
		"currency":           "INR",
		"result_counts":      map[string]any{},
		"scored_count":       0,
		"matched_count":      0,
	}
}
