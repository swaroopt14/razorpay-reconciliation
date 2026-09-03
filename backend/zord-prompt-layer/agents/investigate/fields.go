package investigate

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
)

func newInvestigationID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return "inv_" + hex.EncodeToString(b[:])
}

func stringField(m map[string]any, keys ...string) string {
	if m == nil {
		return ""
	}
	for _, key := range keys {
		if v, ok := m[key].(string); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func intField(m map[string]any, keys ...string) int64 {
	if m == nil {
		return 0
	}
	for _, key := range keys {
		if n, ok := intish(m[key]); ok {
			return n
		}
	}
	return 0
}

func intish(v any) (int64, bool) {
	switch n := v.(type) {
	case int64:
		return n, true
	case int:
		return int64(n), true
	case float64:
		return int64(n), true
	default:
		return 0, false
	}
}

func mapField(m map[string]any, keys ...string) map[string]any {
	if m == nil {
		return nil
	}
	for _, key := range keys {
		if v, ok := m[key].(map[string]any); ok {
			return v
		}
	}
	return nil
}

func sliceMaps(m map[string]any, keys ...string) []map[string]any {
	if m == nil {
		return nil
	}
	for _, key := range keys {
		raw, ok := m[key].([]any)
		if !ok {
			continue
		}
		var out []map[string]any
		for _, v := range raw {
			if item, ok := v.(map[string]any); ok {
				out = append(out, item)
			}
		}
		return out
	}
	return nil
}

func unwrapData(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	if data := mapField(m, "data"); data != nil {
		return data
	}
	return m
}

func exceptionList(body map[string]any) []map[string]any {
	if body == nil {
		return nil
	}
	if list := sliceMaps(body, "exceptions"); len(list) > 0 {
		return list
	}
	if data := mapField(body, "data"); data != nil {
		if list := sliceMaps(data, "exceptions"); len(list) > 0 {
			return list
		}
		if stringField(data, "entity_id", "EntityID", "id", "ID") != "" {
			return []map[string]any{data}
		}
	}
	if stringField(body, "entity_id", "EntityID") != "" {
		return []map[string]any{body}
	}
	return nil
}

func appendUnique(in []string, v string) []string {
	v = strings.TrimSpace(v)
	if v == "" {
		return in
	}
	for _, x := range in {
		if x == v {
			return in
		}
	}
	return append(in, v)
}

func errCode(m map[string]any) string {
	if m == nil {
		return ""
	}
	s, _ := m["error"].(string)
	return s
}

func isNone(m map[string]any) bool {
	if m == nil {
		return true
	}
	switch errCode(m) {
	case "none", "not_found", "unavailable", "tenant_isolation", "source_not_in_this_phase", "skipped":
		return true
	}
	return false
}

func reconOf(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	if rec := mapField(m, "reconciliation"); rec != nil {
		return rec
	}
	return unwrapData(m)
}
