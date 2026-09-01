package imports

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
)

func HashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func HashCanonical(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return HashBytes(nil)
	}
	var asAny any
	if err := json.Unmarshal(raw, &asAny); err != nil {
		return HashBytes(raw)
	}
	sorted, err := marshalSorted(asAny)
	if err != nil {
		return HashBytes(raw)
	}
	return HashBytes(sorted)
}

func marshalSorted(v any) ([]byte, error) {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buf := []byte{'{'}
		for i, k := range keys {
			if i > 0 {
				buf = append(buf, ',')
			}
			kb, _ := json.Marshal(k)
			buf = append(buf, kb...)
			buf = append(buf, ':')
			vb, err := marshalSorted(t[k])
			if err != nil {
				return nil, err
			}
			buf = append(buf, vb...)
		}
		buf = append(buf, '}')
		return buf, nil
	case []any:
		buf := []byte{'['}
		for i, item := range t {
			if i > 0 {
				buf = append(buf, ',')
			}
			vb, err := marshalSorted(item)
			if err != nil {
				return nil, err
			}
			buf = append(buf, vb...)
		}
		buf = append(buf, ']')
		return buf, nil
	default:
		return json.Marshal(t)
	}
}
