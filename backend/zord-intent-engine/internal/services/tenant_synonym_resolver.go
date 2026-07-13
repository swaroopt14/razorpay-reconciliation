package services

import (
	"context"
	"database/sql"
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
// tenant_synonym_profiles. Returns an empty map (not an error) on any DB
// failure or when the tenant has no overrides — the global synonym dict in
// the normalizer package still applies either way.
func loadTenantSynonyms(ctx context.Context, db *sql.DB, tenantID uuid.UUID) map[string]string {
	cacheKey := tenantID.String()
	if cached, ok := tenantSynonymCache.Load(cacheKey); ok {
		return cached.(map[string]string)
	}

	synonyms := make(map[string]string)

	rows, err := db.QueryContext(ctx, `
		SELECT source_key, canonical_path
		FROM tenant_synonym_profiles
		WHERE tenant_id = $1 AND is_active = true
	`, tenantID)
	if err != nil {
		log.Printf("⚠️ loadTenantSynonyms: query failed for tenant=%s: %v", tenantID, err)
		return synonyms
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
		log.Printf("⚠️ loadTenantSynonyms: row iteration failed for tenant=%s: %v", tenantID, err)
	}

	tenantSynonymCache.Store(cacheKey, synonyms)
	return synonyms
}

// InvalidateTenantSynonymCache removes a tenant's cached synonym map. Call
// after creating, updating, or deactivating a tenant_synonym_profiles row.
func InvalidateTenantSynonymCache(tenantID uuid.UUID) {
	tenantSynonymCache.Delete(tenantID.String())
}
