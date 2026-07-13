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

type MappingProfileHandler struct {
	db *sql.DB
}

func NewMappingProfileHandler(db *sql.DB) *MappingProfileHandler {
	return &MappingProfileHandler{db: db}
}

// ListOrCreate: POST /v1/admin/mapping-profiles OR GET /v1/admin/mapping-profiles
func (h *MappingProfileHandler) ListOrCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		h.Create(w, r)
		return
	} else if r.Method == http.MethodGet {
		h.List(w, r)
		return
	}
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

// GetUpdateOrDeactivate: GET, PUT, DELETE for /v1/admin/mapping-profiles/:profile_id
func (h *MappingProfileHandler) GetUpdateOrDeactivate(w http.ResponseWriter, r *http.Request) {
	// Extract profile_id from path
	parts := strings.Split(r.URL.Path, "/v1/admin/mapping-profiles/")
	if len(parts) < 2 || strings.TrimSpace(parts[1]) == "" {
		http.Error(w, "profile_id is required", http.StatusBadRequest)
		return
	}
	profileID := strings.TrimSpace(parts[1])

	if r.Method == http.MethodGet {
		h.Get(w, r, profileID)
	} else if r.Method == http.MethodPut {
		h.Update(w, r, profileID)
	} else if r.Method == http.MethodDelete {
		h.Deactivate(w, r, profileID)
	} else {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *MappingProfileHandler) Create(w http.ResponseWriter, r *http.Request) {
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req models.MappingProfile
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.ProfileID == "" {
		http.Error(w, "profile_id is required", http.StatusBadRequest)
		return
	}

	colMapBytes, err := json.Marshal(req.ColumnMap)
	if err != nil {
		http.Error(w, "failed to marshal column_map: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Sane defaults for policies if blank
	if len(req.StrictRequiredFieldsJSON) == 0 {
		req.StrictRequiredFieldsJSON = []byte("[]")
	}
	if len(req.SoftInferableFieldsJSON) == 0 {
		req.SoftInferableFieldsJSON = []byte("[]")
	}
	if len(req.FieldKindPolicyJSON) == 0 {
		req.FieldKindPolicyJSON = []byte("{}")
	}
	if len(req.SensitiveFieldPolicyJSON) == 0 {
		req.SensitiveFieldPolicyJSON = []byte("{}")
	}
	if req.ProfileVersion == "" {
		req.ProfileVersion = "1.0.0"
	}
	if req.ArtifactFamily == "" {
		req.ArtifactFamily = "LIVE_INTENT_JSON"
	}
	if req.FileFormat == "" {
		req.FileFormat = "json"
	}
	if req.Delimiter == "" {
		req.Delimiter = ","
	}
	if req.MappingStrategy == "" {
		req.MappingStrategy = "column_map"
	}
	if req.AmountFormat == "" {
		req.AmountFormat = "DECIMAL"
	}
	if req.DateFormat == "" {
		req.DateFormat = "2006-01-02"
	}
	if req.DefaultCurrency == "" {
		req.DefaultCurrency = "INR"
	}
	if req.SourceTimezone == "" {
		req.SourceTimezone = "Asia/Kolkata"
	}
	if req.OutputEntityFamily == "" {
		req.OutputEntityFamily = "INTENT"
	}
	if req.Status == "" {
		req.Status = "active"
	}
	if req.ValidationMode == "" {
		req.ValidationMode = models.ValidationModeStrict
	}
	req.ProfileHash = req.ComputeProfileHash()

	q := `INSERT INTO mapping_profiles (
		profile_id, profile_version, tenant_id, tenant_name,
		source_vendor, source_system, artifact_family, file_format,
		delimiter, header_row_index, mapping_strategy,
		column_map, amount_format, date_format, default_currency, source_timezone,
		strict_required_fields_json, soft_inferable_fields_json,
		field_kind_policy_json, sensitive_field_policy_json,
		profile_hash, validation_mode,
		output_entity_family, status, notes, created_at, updated_at, created_by
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, now(), now(), $26)`

	_, err = h.db.ExecContext(r.Context(), q,
		req.ProfileID, req.ProfileVersion, req.TenantID, req.TenantName,
		req.SourceVendor, req.SourceSystem, req.ArtifactFamily, req.FileFormat,
		req.Delimiter, req.HeaderRowIndex, req.MappingStrategy,
		colMapBytes, req.AmountFormat, req.DateFormat, req.DefaultCurrency, req.SourceTimezone,
		req.StrictRequiredFieldsJSON, req.SoftInferableFieldsJSON,
		req.FieldKindPolicyJSON, req.SensitiveFieldPolicyJSON,
		req.ProfileHash, req.ValidationMode,
		req.OutputEntityFamily, req.Status, req.Notes, req.CreatedBy,
	)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			http.Error(w, "a mapping profile with this tenant/source_system/artifact_family/version already exists", http.StatusConflict)
			return
		}
		http.Error(w, "database insert failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Invalidate cache
	if req.TenantID != nil {
		services.InvalidateProfileCache(*req.TenantID, req.SourceSystem, req.ArtifactFamily)
	} else {
		services.InvalidateProfileCache(uuid.Nil, req.SourceSystem, req.ArtifactFamily)
	}

	w.WriteHeader(http.StatusCreated)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(req)
}

func (h *MappingProfileHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantIDQuery := r.URL.Query().Get("tenant_id")
	sourceSystemQuery := r.URL.Query().Get("source_system")

	var rows *sql.Rows
	var err error

	q := `SELECT profile_id, profile_version, tenant_id, tenant_name,
	             source_vendor, source_system, artifact_family, file_format,
	             delimiter, header_row_index, mapping_strategy,
	             column_map, amount_format, date_format, default_currency, source_timezone,
	             strict_required_fields_json, soft_inferable_fields_json,
	             field_kind_policy_json, sensitive_field_policy_json,
	             profile_hash, validation_mode,
	             output_entity_family, status, notes, created_at, updated_at, created_by
	      FROM mapping_profiles`

	var args []any
	if tenantIDQuery != "" && sourceSystemQuery != "" {
		q += " WHERE tenant_id = $1 AND source_system = $2"
		args = append(args, tenantIDQuery, sourceSystemQuery)
	} else if tenantIDQuery != "" {
		q += " WHERE tenant_id = $1"
		args = append(args, tenantIDQuery)
	} else if sourceSystemQuery != "" {
		q += " WHERE source_system = $1"
		args = append(args, sourceSystemQuery)
	}

	rows, err = h.db.QueryContext(r.Context(), q, args...)
	if err != nil {
		http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var profiles []models.MappingProfile
	for rows.Next() {
		var p models.MappingProfile
		var colMapRaw []byte
		var tenantIDPtr *uuid.UUID

		err := rows.Scan(
			&p.ProfileID, &p.ProfileVersion, &tenantIDPtr, &p.TenantName,
			&p.SourceVendor, &p.SourceSystem, &p.ArtifactFamily, &p.FileFormat,
			&p.Delimiter, &p.HeaderRowIndex, &p.MappingStrategy,
			&colMapRaw, (*string)(&p.AmountFormat), &p.DateFormat,
			&p.DefaultCurrency, &p.SourceTimezone,
			&p.StrictRequiredFieldsJSON, &p.SoftInferableFieldsJSON,
			&p.FieldKindPolicyJSON, &p.SensitiveFieldPolicyJSON,
			&p.ProfileHash, &p.ValidationMode,
			&p.OutputEntityFamily, &p.Status, &p.Notes,
			&p.CreatedAt, &p.UpdatedAt, &p.CreatedBy,
		)
		if err != nil {
			http.Error(w, "row scan failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.Unmarshal(colMapRaw, &p.ColumnMap)
		p.TenantID = tenantIDPtr
		profiles = append(profiles, p)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(profiles)
}

func (h *MappingProfileHandler) Get(w http.ResponseWriter, r *http.Request, profileID string) {
	q := `SELECT profile_id, profile_version, tenant_id, tenant_name,
	             source_vendor, source_system, artifact_family, file_format,
	             delimiter, header_row_index, mapping_strategy,
	             column_map, amount_format, date_format, default_currency, source_timezone,
	             strict_required_fields_json, soft_inferable_fields_json,
	             field_kind_policy_json, sensitive_field_policy_json,
	             profile_hash, validation_mode,
	             output_entity_family, status, notes, created_at, updated_at, created_by
	      FROM mapping_profiles
	      WHERE profile_id = $1`

	row := h.db.QueryRowContext(r.Context(), q, profileID)
	var p models.MappingProfile
	var colMapRaw []byte
	var tenantIDPtr *uuid.UUID

	err := row.Scan(
		&p.ProfileID, &p.ProfileVersion, &tenantIDPtr, &p.TenantName,
		&p.SourceVendor, &p.SourceSystem, &p.ArtifactFamily, &p.FileFormat,
		&p.Delimiter, &p.HeaderRowIndex, &p.MappingStrategy,
		&colMapRaw, (*string)(&p.AmountFormat), &p.DateFormat,
		&p.DefaultCurrency, &p.SourceTimezone,
		&p.StrictRequiredFieldsJSON, &p.SoftInferableFieldsJSON,
		&p.FieldKindPolicyJSON, &p.SensitiveFieldPolicyJSON,
		&p.ProfileHash, &p.ValidationMode,
		&p.OutputEntityFamily, &p.Status, &p.Notes,
		&p.CreatedAt, &p.UpdatedAt, &p.CreatedBy,
	)
	if err == sql.ErrNoRows {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.Unmarshal(colMapRaw, &p.ColumnMap)
	p.TenantID = tenantIDPtr

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
}

func (h *MappingProfileHandler) Update(w http.ResponseWriter, r *http.Request, profileID string) {
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req models.MappingProfile
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body: "+err.Error(), http.StatusBadRequest)
		return
	}

	colMapBytes, err := json.Marshal(req.ColumnMap)
	if err != nil {
		http.Error(w, "failed to marshal column_map: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Sane defaults if blank
	if len(req.StrictRequiredFieldsJSON) == 0 {
		req.StrictRequiredFieldsJSON = []byte("[]")
	}
	if len(req.SoftInferableFieldsJSON) == 0 {
		req.SoftInferableFieldsJSON = []byte("[]")
	}
	if len(req.FieldKindPolicyJSON) == 0 {
		req.FieldKindPolicyJSON = []byte("{}")
	}
	if len(req.SensitiveFieldPolicyJSON) == 0 {
		req.SensitiveFieldPolicyJSON = []byte("{}")
	}

	if req.ValidationMode == "" {
		req.ValidationMode = models.ValidationModeStrict
	}
	req.ProfileHash = req.ComputeProfileHash()

	q := `UPDATE mapping_profiles SET
		profile_version = $1, tenant_id = $2, tenant_name = $3,
		source_vendor = $4, source_system = $5, artifact_family = $6, file_format = $7,
		delimiter = $8, header_row_index = $9, mapping_strategy = $10,
		column_map = $11, amount_format = $12, date_format = $13, default_currency = $14, source_timezone = $15,
		strict_required_fields_json = $16, soft_inferable_fields_json = $17,
		field_kind_policy_json = $18, sensitive_field_policy_json = $19,
		profile_hash = $20, validation_mode = $21,
		output_entity_family = $22, status = $23, notes = $24,
		updated_at = now(), created_by = $25
	WHERE profile_id = $26`

	_, err = h.db.ExecContext(r.Context(), q,
		req.ProfileVersion, req.TenantID, req.TenantName,
		req.SourceVendor, req.SourceSystem, req.ArtifactFamily, req.FileFormat,
		req.Delimiter, req.HeaderRowIndex, req.MappingStrategy,
		colMapBytes, req.AmountFormat, req.DateFormat, req.DefaultCurrency, req.SourceTimezone,
		req.StrictRequiredFieldsJSON, req.SoftInferableFieldsJSON,
		req.FieldKindPolicyJSON, req.SensitiveFieldPolicyJSON,
		req.ProfileHash, req.ValidationMode,
		req.OutputEntityFamily, req.Status, req.Notes, req.CreatedBy,
		profileID,
	)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			http.Error(w, "a mapping profile with this tenant/source_system/artifact_family/version already exists", http.StatusConflict)
			return
		}
		http.Error(w, "database update failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Invalidate cache
	if req.TenantID != nil {
		services.InvalidateProfileCache(*req.TenantID, req.SourceSystem, req.ArtifactFamily)
	} else {
		services.InvalidateProfileCache(uuid.Nil, req.SourceSystem, req.ArtifactFamily)
	}

	w.WriteHeader(http.StatusOK)
}

func (h *MappingProfileHandler) Deactivate(w http.ResponseWriter, r *http.Request, profileID string) {
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Fetch tenant_id and details first to invalidate cache
	qFetch := `SELECT tenant_id, source_system, artifact_family FROM mapping_profiles WHERE profile_id = $1`
	var tenantIDPtr *uuid.UUID
	var sourceSystem, artifactFamily string
	err := h.db.QueryRowContext(r.Context(), qFetch, profileID).Scan(&tenantIDPtr, &sourceSystem, &artifactFamily)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "profile not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to query profile: "+err.Error(), http.StatusInternalServerError)
		return
	}

	qUpdate := `UPDATE mapping_profiles SET status = 'inactive', updated_at = now() WHERE profile_id = $1`
	_, err = h.db.ExecContext(r.Context(), qUpdate, profileID)
	if err != nil {
		http.Error(w, "database deactivate failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Invalidate cache
	if tenantIDPtr != nil {
		services.InvalidateProfileCache(*tenantIDPtr, sourceSystem, artifactFamily)
	} else {
		services.InvalidateProfileCache(uuid.Nil, sourceSystem, artifactFamily)
	}

	w.WriteHeader(http.StatusNoContent)
}
