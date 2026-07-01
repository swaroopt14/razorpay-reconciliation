package services

import (
	"strings"
	"time"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
)

func toCitations(chunks []model.RetrievedChunk) []dto.Citation {
	out := make([]dto.Citation, 0, len(chunks))
	for _, c := range chunks {
		out = append(out, dto.Citation{
			SourceType: c.SourceType,
			RecordID:   c.RecordID,
			ChunkID:    c.ChunkID,
			Snippet:    formatCitationSnippet(c.SourceType, c.Text),
			Score:      c.Score,
		})
	}
	return out
}

func formatCitationSnippet(sourceType, raw string) string {
	kv := parseKV(raw)
	switch strings.ToLower(strings.TrimSpace(sourceType)) {
	case "intent_payment_intents":
		return joinNonEmpty(" · ",
			"Payment instruction",
			labelValue("Status", pick(kv, "status")),
			labelValue("Type", pick(kv, "type")),
			labelValue("Amount", formatAmountINR(pick(kv, "amount"))),
			labelValue("Received", formatDisplayTime(pick(kv, "created_at"))),
		)
	case "edge_ingress_outbox":
		return joinNonEmpty(" · ",
			"Ingestion handoff",
			labelValue("Status", pick(kv, "status")),
			labelValue("Event", pick(kv, "event_type")),
			labelValue("Attempts", pick(kv, "attempts")),
			labelValue("Created", formatDisplayTime(pick(kv, "created_at"))),
			labelValue("Updated", formatDisplayTime(pick(kv, "updated_at"))),
			labelValue("Published", formatDisplayTime(pick(kv, "published_at"))),
		)
	case "edge_ingress_envelopes":
		return joinNonEmpty(" · ",
			"Envelope received",
			labelValue("Channel", pick(kv, "ingress_channel")),
			labelValue("Source", pick(kv, "source_system")),
			labelValue("Status", pick(kv, "status")),
			labelValue("Rows", pick(kv, "row_count_estimate")),
			labelValue("Received", formatDisplayTime(pick(kv, "received_at"))),
		)
	case "edge_idempotency_keys":
		return joinNonEmpty(" · ",
			"Duplicate-control signal",
			labelValue("Status", pick(kv, "status")),
			labelValue("Resolution", pick(kv, "resolution_type")),
			labelValue("Conflicts", pick(kv, "conflict_count")),
			labelValue("First seen", formatDisplayTime(pick(kv, "first_seen_at"))),
			labelValue("Last seen", formatDisplayTime(pick(kv, "last_seen_at"))),
		)
	default:
		parts := []string{}
		for _, k := range []string{
			"status", "type", "event_type", "source_system", "ingress_channel", "amount",
			"created_at", "updated_at", "published_at", "received_at",
		} {
			v := pick(kv, k)
			if v == "" {
				continue
			}
			if strings.Contains(k, "_at") {
				v = formatDisplayTime(v)
			}
			if k == "amount" {
				v = formatAmountINR(v)
			}
			parts = append(parts, labelValue(humanLabel(k), v))
		}
		if len(parts) == 0 {
			return ""
		}
		return joinNonEmpty(" · ", append([]string{"Operational evidence"}, parts...)...)
	}
}

func parseKV(raw string) map[string]string {
	out := map[string]string{}
	for _, f := range strings.Fields(raw) {
		if !strings.Contains(f, "=") {
			continue
		}
		parts := strings.SplitN(f, "=", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.TrimSpace(parts[0])
		v := strings.Trim(strings.TrimSpace(parts[1]), ",")
		out[strings.ToLower(k)] = v
	}
	return out
}

func pick(m map[string]string, key string) string {
	v := strings.TrimSpace(m[strings.ToLower(key)])
	switch strings.ToLower(v) {
	case "", "-", "null", "nil", "none", "n/a":
		return ""
	default:
		return v
	}
}

func labelValue(label, value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return label + ": " + value
}

func joinNonEmpty(sep string, vals ...string) string {
	clean := make([]string, 0, len(vals))
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v != "" {
			clean = append(clean, v)
		}
	}
	return strings.Join(clean, sep)
}

func humanLabel(k string) string {
	switch k {
	case "created_at":
		return "Created"
	case "updated_at":
		return "Updated"
	case "published_at":
		return "Published"
	case "received_at":
		return "Received"
	case "source_system":
		return "Source"
	case "ingress_channel":
		return "Channel"
	case "event_type":
		return "Event"
	default:
		return strings.Title(strings.ReplaceAll(k, "_", " "))
	}
}

func formatDisplayTime(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "-" {
		return ""
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05",
	}
	var t time.Time
	var err error
	for _, l := range layouts {
		t, err = time.Parse(l, s)
		if err == nil {
			loc, _ := time.LoadLocation("Asia/Kolkata")
			return t.In(loc).Format("02 Jan 2006, 03:04 PM MST")
		}
	}
	return s
}

func formatAmountINR(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	return "₹" + s
}

func filterReadableCitations(in []dto.Citation) []dto.Citation {
	out := make([]dto.Citation, 0, len(in))
	for _, c := range in {
		s := strings.TrimSpace(c.Snippet)
		if s == "" || s == "-" || s == "—" {
			continue
		}
		if strings.Count(s, ":") == 0 && len(s) < 18 {
			continue
		}
		out = append(out, c)
	}
	return out
}
