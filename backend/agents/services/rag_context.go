package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("[]")
	}
	return b
}
func buildSelectedUIContextQuery(req dto.QueryRequest, resolvedQuery string) string {
	if req.UIContext == nil {
		return resolvedQuery
	}

	parts := []string{resolvedQuery}

	if s := strings.TrimSpace(req.UIContext.Scope); s != "" {
		parts = append(parts, "selected_scope="+s)
	}
	if s := strings.TrimSpace(req.UIContext.SourcePage); s != "" {
		parts = append(parts, "selected_source_page="+s)
	}
	if s := strings.TrimSpace(req.UIContext.SectionTitle); s != "" {
		parts = append(parts, "selected_section="+s)
	}
	if s := strings.TrimSpace(req.UIContext.SelectedTitle); s != "" {
		parts = append(parts, "selected_title="+s)
	}
	if s := strings.TrimSpace(req.UIContext.SelectedDescription); s != "" {
		parts = append(parts, "selected_description="+s)
	}
	if s := strings.TrimSpace(req.UIContext.BatchID); s != "" {
		parts = append(parts, "batch_id: "+s)
	}

	return strings.Join(parts, " ")
}

func buildSelectedUIContextBlock(ctx *dto.UIContext) string {
	if ctx == nil {
		return ""
	}

	var b strings.Builder
	b.WriteString("The user opened Ask Zord from a selected UI section. Answer only within this selected business context unless the user clearly asks to broaden the scope.\n")

	writeContextLine := func(label, value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		b.WriteString(label)
		b.WriteString(": ")
		b.WriteString(utils.SanitizeAnswerText(value))
		b.WriteString("\n")
	}

	writeContextLine("Selected scope", ctx.Scope)
	writeContextLine("Scope level", ctx.ScopeLevel)
	writeContextLine("Source page", ctx.SourcePage)
	writeContextLine("Section", ctx.SectionTitle)
	writeContextLine("Selected item", ctx.SelectedTitle)
	writeContextLine("Selected explanation", ctx.SelectedDescription)

	if len(ctx.SelectedMetrics) > 0 {
		b.WriteString("Selected visible metrics:\n")
		for _, metric := range ctx.SelectedMetrics {
			label := strings.TrimSpace(metric.Label)
			value := strings.TrimSpace(metric.Value)
			if label == "" || value == "" {
				continue
			}
			b.WriteString("- ")
			b.WriteString(utils.SanitizeAnswerText(label))
			b.WriteString(": ")
			b.WriteString(utils.SanitizeAnswerText(value))
			b.WriteString("\n")
		}
	}

	return strings.TrimSpace(b.String())
}
func buildContext(chunks []model.RetrievedChunk) string {
	var b strings.Builder
	for i, c := range chunks {
		b.WriteString(fmt.Sprintf("[%d] source=%s score=%.4f\n%s\n\n", i+1, c.SourceType, c.Score, c.Text))
	}
	return b.String()
}
func buildBusinessContext(chunks []model.RetrievedChunk) string {
	raw := buildContext(chunks)
	replacements := map[string]string{
		"ambiguous_intent_count":      "Payments needing match review",
		"ambiguity_rate":              "Review rate",
		"provider_ref_missing_rate":   "Missing bank/PSP reference rate",
		"avg_attachment_confidence":   "Average match confidence",
		"risk_adjusted_leakage_minor": "Value needing review",
		"intent":                      "payment instruction",
		"settlement observation":      "bank/settlement record",
		"defensibility":               "proof readiness",
	}
	out := raw
	for k, v := range replacements {
		out = strings.ReplaceAll(out, k, v)
	}
	return out
}
