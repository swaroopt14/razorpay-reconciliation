package razorpay

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"sort"
	"strings"
)

// HashRawResponse returns a sha256: hex digest of the exact response body.
func HashRawResponse(body []byte) string {
	sum := sha256.Sum256(body)
	return "sha256:" + hex.EncodeToString(sum[:])
}

// HashRequestQuery returns a stable hash of sorted query parameters.
func HashRequestQuery(query url.Values) string {
	if len(query) == 0 {
		return HashRawResponse(nil)
	}
	keys := make([]string, 0, len(query))
	for k := range query {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		vals := append([]string(nil), query[k]...)
		sort.Strings(vals)
		b.WriteString(url.QueryEscape(k))
		b.WriteByte('=')
		b.WriteString(url.QueryEscape(strings.Join(vals, ",")))
	}
	return HashRawResponse([]byte(b.String()))
}

// CanonicalizeForHash encodes v as deterministic JSON with sorted keys.
func CanonicalizeForHash(v any) ([]byte, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var asAny any
	if err := json.Unmarshal(raw, &asAny); err != nil {
		return raw, nil
	}
	return marshalSorted(asAny)
}

func marshalSorted(v any) ([]byte, error) {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buf := make([]byte, 0, 64)
		buf = append(buf, '{')
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
		buf := make([]byte, 0, 64)
		buf = append(buf, '[')
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
