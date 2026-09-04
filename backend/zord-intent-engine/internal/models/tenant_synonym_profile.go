package models

import (
	"time"

	"github.com/google/uuid"
)

// TenantSynonymProfile maps one tenant-specific source column name to a Zord
// canonical dot-path (e.g. "Vendor Name" -> "beneficiary.name"), feeding the
// normalizer's per-tenant synonym overrides on top of the global dictionary.
type TenantSynonymProfile struct {
	ProfileID     uuid.UUID `json:"profile_id" db:"profile_id"`
	TenantID      uuid.UUID `json:"tenant_id" db:"tenant_id"`
	SourceKey     string    `json:"source_key" db:"source_key"`
	CanonicalPath string    `json:"canonical_path" db:"canonical_path"`
	MatchMethod   string    `json:"match_method" db:"match_method"`
	IsActive      bool      `json:"is_active" db:"is_active"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}
