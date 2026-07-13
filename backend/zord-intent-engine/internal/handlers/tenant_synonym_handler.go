package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/services"
)

type TenantSynonymHandler struct {
	db *sql.DB
}

func NewTenantSynonymHandler(db *sql.DB) *TenantSynonymHandler {
	return &TenantSynonymHandler{db: db}
}

// ListOrCreate: POST /v1/admin/tenant-synonyms OR GET /v1/admin/tenant-synonyms?tenant_id=...
func (h *TenantSynonymHandler) ListOrCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		h.Create(w, r)
		return
	} else if r.Method == http.MethodGet {
		h.List(w, r)
		return
	}
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func (h *TenantSynonymHandler) Create(w http.ResponseWriter, r *http.Request) {
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req models.TenantSynonymProfile
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.TenantID == uuid.Nil {
		http.Error(w, "tenant_id is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.SourceKey) == "" || strings.TrimSpace(req.CanonicalPath) == "" {
		http.Error(w, "source_key and canonical_path are required", http.StatusBadRequest)
		return
	}
	if req.MatchMethod == "" {
		req.MatchMethod = "exact"
	}

	q := `INSERT INTO tenant_synonym_profiles (tenant_id, source_key, canonical_path, match_method, is_active)
	      VALUES ($1, $2, $3, $4, true)
	      ON CONFLICT (tenant_id, source_key) DO UPDATE SET
	          canonical_path = EXCLUDED.canonical_path,
	          match_method = EXCLUDED.match_method,
	          is_active = true`

	_, err := h.db.ExecContext(r.Context(), q, req.TenantID, req.SourceKey, req.CanonicalPath, req.MatchMethod)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			http.Error(w, "a synonym for this tenant/source_key already exists", http.StatusConflict)
			return
		}
		http.Error(w, "database insert failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	services.InvalidateTenantSynonymCache(req.TenantID)

	w.WriteHeader(http.StatusCreated)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(req)
}

func (h *TenantSynonymHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantIDQuery := r.URL.Query().Get("tenant_id")
	if tenantIDQuery == "" {
		http.Error(w, "tenant_id query parameter is required", http.StatusBadRequest)
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT profile_id, tenant_id, source_key, canonical_path, match_method, is_active, created_at
		FROM tenant_synonym_profiles
		WHERE tenant_id = $1
		ORDER BY source_key`, tenantIDQuery)
	if err != nil {
		http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]models.TenantSynonymProfile, 0)
	for rows.Next() {
		var it models.TenantSynonymProfile
		if err := rows.Scan(&it.ProfileID, &it.TenantID, &it.SourceKey, &it.CanonicalPath, &it.MatchMethod, &it.IsActive, &it.CreatedAt); err != nil {
			http.Error(w, "row scan failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		items = append(items, it)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

// Deactivate: DELETE /v1/admin/tenant-synonyms/:profile_id
func (h *TenantSynonymHandler) Deactivate(w http.ResponseWriter, r *http.Request) {
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/v1/admin/tenant-synonyms/")
	if len(parts) < 2 || strings.TrimSpace(parts[1]) == "" {
		http.Error(w, "profile_id is required", http.StatusBadRequest)
		return
	}
	profileID := strings.TrimSpace(parts[1])

	var tenantID uuid.UUID
	err := h.db.QueryRowContext(r.Context(),
		`SELECT tenant_id FROM tenant_synonym_profiles WHERE profile_id = $1`, profileID,
	).Scan(&tenantID)
	if err == sql.ErrNoRows {
		http.Error(w, "synonym not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "failed to query synonym: "+err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = h.db.ExecContext(r.Context(),
		`UPDATE tenant_synonym_profiles SET is_active = false WHERE profile_id = $1`, profileID)
	if err != nil {
		http.Error(w, "database deactivate failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	services.InvalidateTenantSynonymCache(tenantID)

	w.WriteHeader(http.StatusNoContent)
}
