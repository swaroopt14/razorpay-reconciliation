package finance

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

func SnapshotHash(snapshot map[string]any) string {
	if snapshot == nil {
		snapshot = map[string]any{}
	}
	raw, err := json.Marshal(snapshot)
	if err != nil {
		sum := sha256.Sum256([]byte("invalid"))
		return "sha256:" + hex.EncodeToString(sum[:])
	}
	sum := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func PackHash(doc map[string]any) string {
	return SnapshotHash(doc)
}

func IdentityHash(tenantID, sourceType, sourceID, sourceHash string) string {
	sum := sha256.Sum256([]byte(tenantID + "|" + sourceType + "|" + sourceID + "|" + sourceHash))
	return hex.EncodeToString(sum[:])
}
