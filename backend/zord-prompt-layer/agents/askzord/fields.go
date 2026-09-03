package askzord

func exceptionMaps(body map[string]any) []map[string]any {
	if body == nil {
		return nil
	}
	raw, ok := body["exceptions"].([]any)
	if !ok {
		return nil
	}
	var out []map[string]any
	for _, v := range raw {
		if m, ok := v.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func stringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func intField(m map[string]any, key string) int64 {
	if m == nil {
		return 0
	}
	n, _ := intish(m[key])
	return n
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

func stringSlice(m map[string]any, key string) []string {
	if m == nil {
		return nil
	}
	raw, ok := m[key].([]any)
	if !ok {
		return nil
	}
	var out []string
	for _, v := range raw {
		if s, ok := v.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

func appendUnique(in []string, v string) []string {
	for _, x := range in {
		if x == v {
			return in
		}
	}
	return append(in, v)
}

func factInt(ctx FinanceContext, field string) int64 {
	for _, f := range ctx.Facts {
		if f.Field == field {
			if n, ok := intish(f.Value); ok {
				return n
			}
		}
	}
	return 0
}
