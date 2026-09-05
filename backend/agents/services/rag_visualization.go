package services

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
	"zord-prompt-layer/client"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

func (s *DefaultRAGService) buildDetailedVisualizationFromChunks(
	chunks []model.RetrievedChunk,
	req dto.QueryRequest,
	scope utils.QueryScope,
	kind vizKind,
	confidence string,
) (*dto.Visualization, string) {
	statusCounts := map[string]float64{}
	sourceCounts := map[string]float64{}

	for _, c := range chunks {
		src := sourceGroup(c.SourceType)
		if src != "" {
			sourceCounts[strings.Title(src)]++
		}
		status := extractStatusToken(c.Text)
		if status != "" {
			statusCounts[status]++
		}
	}

	series := make([]dto.VisualizationPoint, 0)
	title := "Operational Distribution"
	subtitle := "Tenant-scoped operational status from current evidence"
	description := "This view summarizes operational patterns for the selected tenant in business-friendly terms."
	xAxis := "Category"
	yAxis := "Count"
	legend := []string{"Higher bars indicate more observed events in current evidence."}

	switch kind {
	case vizTopFailures:
		title = "Top Failure Categories"
		subtitle = "Most frequent failure-type observations for this tenant"
		description = "This chart highlights where operational issues are concentrating, so teams can prioritize impact."
		xAxis = "Failure Category"
		for k, v := range statusCounts {
			if strings.Contains(strings.ToUpper(k), "FAIL") || strings.Contains(strings.ToUpper(k), "ERROR") {
				series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
			}
		}
		if len(series) == 0 {
			for k, v := range statusCounts {
				series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
			}
		}
	case vizSLABreach:
		title = "SLA Breach Risk Snapshot"
		subtitle = "Observed delayed/breached patterns in current tenant evidence"
		description = "This chart gives a business view of likely SLA pressure based on recent processing outcomes."
		xAxis = "SLA State"
		breached := 0.0
		onTime := 0.0
		for k, v := range statusCounts {
			up := strings.ToUpper(k)
			if strings.Contains(up, "FAIL") || strings.Contains(up, "DELAY") || strings.Contains(up, "BREACH") {
				breached += v
			} else {
				onTime += v
			}
		}
		series = append(series, dto.VisualizationPoint{Label: "Breach/Delayed", Value: breached})
		series = append(series, dto.VisualizationPoint{Label: "On Track", Value: onTime})
	case vizApprovalMix:
		title = "Pending Approval Mix"
		subtitle = "Severity-like distribution inferred from current action/evidence context"
		description = "This chart shows relative concentration of pending work to support prioritization."
		xAxis = "Priority Bucket"
		high := 0.0
		medium := 0.0
		low := 0.0
		for k, v := range statusCounts {
			up := strings.ToUpper(k)
			switch {
			case strings.Contains(up, "HIGH"):
				high += v
			case strings.Contains(up, "MEDIUM"):
				medium += v
			default:
				low += v
			}
		}
		series = append(series, dto.VisualizationPoint{Label: "High", Value: high})
		series = append(series, dto.VisualizationPoint{Label: "Medium", Value: medium})
		series = append(series, dto.VisualizationPoint{Label: "Low", Value: low})
	default:
		title = "Source-Wise Evidence Coverage"
		subtitle = "How evidence is distributed across operational domains"
		description = "This chart explains where the current answer evidence is coming from."
		xAxis = "Operational Domain"
		for k, v := range sourceCounts {
			series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
		}
	}

	if len(series) == 0 {
		return &dto.Visualization{
			VisualizationID:   "viz-" + strings.ToLower(string(kind)),
			ChartType:         "bar",
			Title:             title,
			Subtitle:          subtitle,
			Description:       description,
			XAxis:             xAxis,
			YAxis:             yAxis,
			Series:            []dto.VisualizationPoint{},
			Legend:            legend,
			Insights:          []string{"No sufficient tenant-scoped data was found for a reliable visualization."},
			SummaryMetrics:    []dto.VisualizationMetric{{Key: "Tenant", Value: utils.SanitizeAnswerText(req.TenantID)}, {Key: "Data points", Value: "0"}},
			TimeWindow:        buildVisualizationWindow(scope),
			Confidence:        "low",
			EmptyStateMessage: "No sufficient tenant-scoped data is available for visualization right now.",
		}, "I could not find enough tenant-scoped data to render a detailed visualization right now."
	}

	sort.Slice(series, func(i, j int) bool { return series[i].Value > series[j].Value })

	total := 0.0
	for _, p := range series {
		total += p.Value
	}
	topLabel := series[0].Label
	topValue := series[0].Value

	insight := fmt.Sprintf("The highest concentration is in %s with %.0f observations.", topLabel, topValue)
	insight = utils.SanitizeAnswerText(insight)

	metrics := []dto.VisualizationMetric{
		{Key: "Tenant", Value: utils.SanitizeAnswerText(req.TenantID)},
		{Key: "Data points", Value: fmt.Sprintf("%.0f", total)},
		{Key: "Top category", Value: utils.SanitizeAnswerText(topLabel)},
	}

	return &dto.Visualization{
		VisualizationID: "viz-" + strings.ToLower(string(kind)),
		ChartType:       "bar",
		Title:           title,
		Subtitle:        subtitle,
		Description:     utils.SanitizeAnswerText(description),
		XAxis:           xAxis,
		YAxis:           yAxis,
		Series:          sanitizeVisualizationSeries(series),
		Legend:          sanitizeStringList(legend),
		Insights:        sanitizeStringList([]string{insight}),
		SummaryMetrics:  sanitizeMetrics(metrics),
		TimeWindow:      buildVisualizationWindow(scope),
		Confidence:      confidence,
	}, insight
}

func extractStatusToken(text string) string {
	up := strings.ToUpper(text)
	switch {
	case strings.Contains(up, "STATUS=FAILED"), strings.Contains(up, "STATUS=FAIL"), strings.Contains(up, "ERROR"):
		return "FAILED"
	case strings.Contains(up, "STATUS=PENDING"), strings.Contains(up, "PENDING"):
		return "PENDING"
	case strings.Contains(up, "STATUS=SUCCESS"), strings.Contains(up, "SUCCESS"):
		return "SUCCESS"
	case strings.Contains(up, "RETRY"):
		return "RETRY"
	default:
		return ""
	}
}
func (s *DefaultRAGService) buildRCAVisualizationFromClusters(
	rca *client.RCAClustersResponse,
	req dto.QueryRequest,
	scope utils.QueryScope,
	kind vizKind,
	confidence string,
) (*dto.Visualization, string, bool) {
	if rca == nil || !rca.DataAvailable || len(rca.Clusters) == 0 {
		return nil, "", false
	}

	type agg struct {
		label string
		value float64
	}
	acc := map[string]float64{}

	for _, raw := range rca.Clusters {
		var obj map[string]any
		if err := json.Unmarshal(raw, &obj); err != nil {
			continue
		}

		label := firstString(obj,
			"cluster_name", "label", "reason", "reason_code", "failure_reason", "bucket", "name", "cluster_id")
		if strings.TrimSpace(label) == "" {
			label = "Cluster"
		}
		label = utils.SanitizeAnswerText(label)
		if strings.TrimSpace(label) == "" || uuidLeakRe.MatchString(label) {
			continue
		}

		v := firstNumber(obj,
			"affected_amount_minor", "total_affected_amount_minor", "affected_count", "count", "points")
		if v <= 0 {
			v = 1
		}
		acc[label] += v
	}

	if len(acc) == 0 {
		return nil, "", false
	}

	series := make([]dto.VisualizationPoint, 0, len(acc))
	for k, v := range acc {
		series = append(series, dto.VisualizationPoint{Label: k, Value: v})
	}
	sort.Slice(series, func(i, j int) bool { return series[i].Value > series[j].Value })

	title := "RCA Cluster Distribution"
	subtitle := "Root-cause concentration for current tenant scope"
	description := "This visualization is generated from intelligence RCA clusters to explain concentration of operational issues."
	xAxis := "RCA Cluster"
	yAxis := "Impact"

	total := 0.0
	for _, p := range series {
		total += p.Value
	}
	top := series[0]
	insight := utils.SanitizeAnswerText(fmt.Sprintf("Highest concentration is in %s (%.0f impact units).", top.Label, top.Value))

	metrics := []dto.VisualizationMetric{
		{Key: "Tenant", Value: utils.SanitizeAnswerText(req.TenantID)},
		{Key: "Clusters", Value: fmt.Sprintf("%d", len(series))},
		{Key: "Total impact", Value: fmt.Sprintf("%.0f", total)},
	}

	variants := []dto.VisualizationVariant{
		{
			ChartType:      "bar",
			Title:          title,
			Subtitle:       subtitle,
			Description:    description,
			XAxis:          xAxis,
			YAxis:          yAxis,
			Series:         sanitizeVisualizationSeries(series),
			Legend:         sanitizeStringList([]string{"RCA cluster impact comparison"}),
			Insights:       sanitizeStringList([]string{insight}),
			SummaryMetrics: sanitizeMetrics(metrics),
		},
		{
			ChartType:      "pie",
			Title:          "RCA Share Breakdown",
			Subtitle:       "Percentage contribution by RCA cluster",
			Description:    "Use this to see dominant root-cause share.",
			Series:         sanitizeVisualizationSeries(series),
			Legend:         sanitizeStringList([]string{"Cluster share of total impact"}),
			Insights:       sanitizeStringList([]string{insight}),
			SummaryMetrics: sanitizeMetrics(metrics),
		},
		{
			ChartType:      "donut",
			Title:          "RCA Contribution Mix",
			Subtitle:       "Relative mix of RCA categories",
			Description:    "Shows contribution split in a compact format.",
			Series:         sanitizeVisualizationSeries(series),
			Legend:         sanitizeStringList([]string{"Contribution by cluster"}),
			Insights:       sanitizeStringList([]string{insight}),
			SummaryMetrics: sanitizeMetrics(metrics),
		},
		{
			ChartType:      "table",
			Title:          "RCA Cluster Table View",
			Subtitle:       "Ranked RCA cluster impact",
			Description:    "Tabular ranking for operational review.",
			XAxis:          "Cluster",
			YAxis:          "Impact",
			Series:         sanitizeVisualizationSeries(series),
			Legend:         sanitizeStringList([]string{"Ranked cluster impact"}),
			Insights:       sanitizeStringList([]string{insight}),
			SummaryMetrics: sanitizeMetrics(metrics),
		},
	}

	return &dto.Visualization{
		VisualizationID: "viz-rca-" + strings.ToLower(string(kind)),
		ChartType:       "bar",
		Title:           title,
		Subtitle:        subtitle,
		Description:     utils.SanitizeAnswerText(description),
		XAxis:           xAxis,
		YAxis:           yAxis,
		Series:          sanitizeVisualizationSeries(series),
		ChartVariants:   sanitizeVisualizationVariants(variants),
		Legend:          sanitizeStringList([]string{"RCA cluster impact comparison"}),
		Insights:        sanitizeStringList([]string{insight}),
		SummaryMetrics:  sanitizeMetrics(metrics),
		TimeWindow:      buildVisualizationWindow(scope),
		Confidence:      confidence,
	}, insight, true
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch t := v.(type) {
			case string:
				if strings.TrimSpace(t) != "" {
					return strings.TrimSpace(t)
				}
			}
		}
	}
	return ""
}

func firstNumber(m map[string]any, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch t := v.(type) {
			case float64:
				return t
			case float32:
				return float64(t)
			case int:
				return float64(t)
			case int64:
				return float64(t)
			case json.Number:
				if f, err := t.Float64(); err == nil {
					return f
				}
			}
		}
	}
	return 0
}
func sanitizeVisualizationSeries(in []dto.VisualizationPoint) []dto.VisualizationPoint {
	out := make([]dto.VisualizationPoint, 0, len(in))
	for _, p := range in {
		label := utils.SanitizeAnswerText(p.Label)
		if strings.TrimSpace(label) == "" || uuidLeakRe.MatchString(label) {
			continue
		}
		out = append(out, dto.VisualizationPoint{Label: label, Value: p.Value})
	}
	return out
}

func sanitizeStringList(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		v := utils.SanitizeAnswerText(s)
		if strings.TrimSpace(v) != "" && !uuidLeakRe.MatchString(v) {
			out = append(out, v)
		}
	}
	return out
}

func sanitizeMetrics(in []dto.VisualizationMetric) []dto.VisualizationMetric {
	out := make([]dto.VisualizationMetric, 0, len(in))
	for _, m := range in {
		k := utils.SanitizeAnswerText(m.Key)
		v := utils.SanitizeAnswerText(m.Value)
		if strings.TrimSpace(k) == "" || strings.TrimSpace(v) == "" {
			continue
		}
		if uuidLeakRe.MatchString(k) || uuidLeakRe.MatchString(v) {
			continue
		}
		out = append(out, dto.VisualizationMetric{Key: k, Value: v})
	}
	return out
}
func sanitizeVisualizationVariants(in []dto.VisualizationVariant) []dto.VisualizationVariant {
	out := make([]dto.VisualizationVariant, 0, len(in))
	for _, v := range in {
		item := dto.VisualizationVariant{
			ChartType:      strings.TrimSpace(v.ChartType),
			Title:          utils.SanitizeAnswerText(v.Title),
			Subtitle:       utils.SanitizeAnswerText(v.Subtitle),
			Description:    utils.SanitizeAnswerText(v.Description),
			XAxis:          utils.SanitizeAnswerText(v.XAxis),
			YAxis:          utils.SanitizeAnswerText(v.YAxis),
			Series:         sanitizeVisualizationSeries(v.Series),
			Legend:         sanitizeStringList(v.Legend),
			Insights:       sanitizeStringList(v.Insights),
			SummaryMetrics: sanitizeMetrics(v.SummaryMetrics),
		}
		if strings.TrimSpace(item.ChartType) == "" || strings.TrimSpace(item.Title) == "" {
			continue
		}
		out = append(out, item)
	}
	return out
}
func buildVisualizationWindow(scope utils.QueryScope) *dto.VisualizationWindow {
	if !scope.HasExplicitTime {
		if strings.TrimSpace(scope.TimePhrase) == "" {
			return nil
		}
		return &dto.VisualizationWindow{Label: scope.TimePhrase}
	}
	return &dto.VisualizationWindow{
		FromUTC: scope.StartUTC.UTC().Format(time.RFC3339),
		ToUTC:   scope.EndUTC.UTC().Format(time.RFC3339),
		Label:   scope.TimePhrase,
	}
}
