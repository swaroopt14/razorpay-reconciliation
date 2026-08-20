package vault

import (
	"fmt"
	"strings"
)

// EncryptionContext binds ciphertext to tenant/artifact metadata via AES-GCM AAD.
type EncryptionContext struct {
	TenantID          string
	ArtifactID        string
	ArtifactVersionID string
	ContentType       string
}

func (c EncryptionContext) AAD() []byte {
	return []byte(fmt.Sprintf(
		"tenant_id=%s|artifact_id=%s|artifact_version_id=%s|content_type=%s",
		strings.TrimSpace(c.TenantID),
		strings.TrimSpace(c.ArtifactID),
		strings.TrimSpace(c.ArtifactVersionID),
		strings.TrimSpace(c.ContentType),
	))
}
