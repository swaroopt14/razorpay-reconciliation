package utils

import "encoding/json"

// MarshalCanonicalJSON produces deterministic JSON bytes for hashing.
// encoding/json sorts map keys, so SchemaVersions and similar maps are stable.
// Callers must pass the same Go value shape at write and verify time.
func MarshalCanonicalJSON(v any) ([]byte, error) {
	return json.Marshal(v)
}
