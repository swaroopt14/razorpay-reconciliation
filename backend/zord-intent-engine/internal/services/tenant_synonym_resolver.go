package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/google/uuid"
)

// tenantSynonymCache caches each tenant's active source_key -> canonical_path
// map so the normalizer doesn't hit the DB on every intent. Invalidated by
// InvalidateTenantSynonymCache after an admin writes/deactivates a row.
var tenantSynonymCache sync.Map // key: tenant_id string -> map[string]string

// loadTenantSynonyms fetches this tenant's active synonym overrides from
// tenant_synonym_profiles. Returns an empty map when the tenant legitimately
// has no overrides configured — the global synonym dict in the normalizer
// package still applies either way.
//
// INT-06: a real DB failure is returned as an error rather than silently
// substituted with an empty map. Swallowing it here used to mean a query
// timeout during header normalization was indistinguishable from "this
// tenant has no synonym overrides" — this replica (or this row, if the DB
// recovers on retry) would then normalize a payload without translations a
// healthy lookup would have applied, producing a different NIR/canonical
// hash for the same source row depending on nothing but DB health at the
// moment it was processed. The caller (intent_service.go) fails the row
// instead of proceeding on a non-nil error.
func loadTenantSynonyms(ctx context.Context, db *sql.DB, tenantID uuid.UUID) (map[string]string, error) {
	cacheKey := tenantID.String()
	if cached, ok := tenantSynonymCache.Load(cacheKey); ok {
		return cached.(map[string]string), nil
	}

	synonyms := make(map[string]string)

	rows, err := db.QueryContext(ctx, `
		SELECT source_key, canonical_path
		FROM tenant_synonym_profiles
		WHERE tenant_id = $1 AND is_active = true
	`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("tenant synonym query failed for tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()

	for rows.Next() {
		var sourceKey, canonicalPath string
		if err := rows.Scan(&sourceKey, &canonicalPath); err != nil {
			log.Printf("⚠️ loadTenantSynonyms: scan failed for tenant=%s: %v", tenantID, err)
			continue
		}
		synonyms[strings.ToLower(strings.TrimSpace(sourceKey))] = canonicalPath
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("tenant synonym row iteration failed for tenant=%s: %w", tenantID, err)
	}

	tenantSynonymCache.Store(cacheKey, synonyms)
	return synonyms, nil
}

// InvalidateTenantSynonymCache removes a tenant's cached synonym map. Call
// after creating, updating, or deactivating a tenant_synonym_profiles row.
func InvalidateTenantSynonymCache(tenantID uuid.UUID) {
	tenantSynonymCache.Delete(tenantID.String())
}
