package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"

	"github.com/google/uuid"
	"zord-intent-engine/config"
	"zord-intent-engine/internal/models"
)

var (
	profileCache sync.Map // key: "<tenant_id>:<source_system>:<artifact_family>" → *models.MappingProfile
)

// ResolveProfileForIntent looks up the correct MappingProfile for an incoming intent.
//
// Selection priority:
//  1. tenant_id + source_system + artifact_family exact match (tenant-specific)
//  2. tenant_id + source_system (any artifact_family — tenant default for this source)
//  3. source_system only (global profile — tenant_id IS NULL)
//  4. built-in profile from config/global_profiles.json
//  5. nil → caller falls back to normalizer synonym dict (existing path)
//
// source_system comes from in.SourceSystem on the Kafka event (set by zord-edge from
// X-Zord-Source-System header).
func ResolveProfileForIntent(
	ctx context.Context,
	db *sql.DB,
	tenantID uuid.UUID,
	sourceSystem string,
	artifactFamily string, // "LIVE_INTENT_JSON" for single intents, "PAYOUT_FILE" for bulk
) (*models.MappingProfile, error) {

	sourceSystem = strings.ToUpper(strings.TrimSpace(sourceSystem))
	if sourceSystem == "" {
		return nil, nil // no source system → use existing normalizer path
	}

	cacheKey := fmt.Sprintf("%s:%s:%s", tenantID, sourceSystem, artifactFamily)
	if cached, ok := profileCache.Load(cacheKey); ok {
		p := cached.(*models.MappingProfile)
		return p, nil
	}

	// Priority 1: exact tenant + source_system + artifact_family
	p, err := loadMappingProfile(ctx, db, &tenantID, sourceSystem, artifactFamily)
	if err == nil && p != nil {
		profileCache.Store(cacheKey, p)
		return p, nil
	}

	// Priority 2: tenant + source_system (ignore artifact_family)
	p, err = loadMappingProfile(ctx, db, &tenantID, sourceSystem, "")
	if err == nil && p != nil {
		profileCache.Store(cacheKey, p)
		return p, nil
	}

	// Priority 3: global profile (tenant_id IS NULL)
	p, err = loadMappingProfile(ctx, db, nil, sourceSystem, "")
	if err == nil && p != nil {
		profileCache.Store(cacheKey, p)
		return p, nil
	}

	// Priority 4: built-in profile from config/global_profiles.json.
	p = loadBuiltInMappingProfile(sourceSystem, artifactFamily)
	if p != nil {
		profileCache.Store(cacheKey, p)
		return p, nil
	}

	return nil, nil
}

// InvalidateProfileCache removes a cached profile. Call after admin update/deactivate.
func InvalidateProfileCache(tenantID uuid.UUID, sourceSystem, artifactFamily string) {
	profileCache.Delete(fmt.Sprintf("%s:%s:%s", tenantID, sourceSystem, artifactFamily))
}

// ── Source-type detection (migrated from zord-edge) ───────────────────────────

// GlobalProfileDef holds the detection metadata for a known source system.
type GlobalProfileDef struct {
	ProfileID          string              `json:"profile_id"`
	SourceType         string              `json:"source_type"`
	ParserClass        string              `json:"parser_class"`
	Signatures         []string            `json:"signatures"`
	SignatureThreshold int                 `json:"signature_threshold"`
	ColumnMap          map[string]string   `json:"column_map"`
	AmountFormat       models.AmountFormat `json:"amount_format"`
	DateFormat         string              `json:"date_format"`
	DefaultCurrency    string              `json:"default_currency"`
	DefaultIntentType  string              `json:"default_intent_type"`
	RequiredFields     []string            `json:"required_fields"`
}

var (
	detectorProfiles     map[string]GlobalProfileDef
	detectorProfilesOnce sync.Once
)

func loadDetectorProfiles() {
	detectorProfilesOnce.Do(func() {
		detectorProfiles = make(map[string]GlobalProfileDef)

		// Prefer a live file override (allows updates without recompile).
		// Falls back to the JSON embedded at compile time — always available.
		var data []byte
		if raw, err := os.ReadFile("config/global_profiles.json"); err == nil {
			data = raw
			log.Printf("[DetectSourceType] loaded global profiles from filesystem")
		} else {
			data = config.GlobalProfilesJSON
			log.Printf("[DetectSourceType] using embedded global profiles (filesystem not found: %v)", err)
		}

		if err := json.Unmarshal(data, &detectorProfiles); err != nil {
			log.Printf("[DetectSourceType] warning: could not parse global_profiles.json: %v", err)
		}
	})
}

// DetectSourceType infers the source system from the file's column headers.
// Called by the intent-engine when processing a Kafka envelope that has no
// source_system set (i.e. zord-edge did not receive an X-Zord-Source-System header).
func DetectSourceType(headers []string) string {
	loadDetectorProfiles()

	normalized := make(map[string]bool, len(headers))
	for _, h := range headers {
		normalized[strings.ToLower(strings.TrimSpace(h))] = true
	}

	for _, def := range detectorProfiles {
		score := 0
		for _, sig := range def.Signatures {
			if normalized[strings.ToLower(strings.TrimSpace(sig))] {
				score++
			}
		}
		if def.SignatureThreshold > 0 && score >= def.SignatureThreshold {
			return def.SourceType
		}
	}

	return ""
}

func loadBuiltInMappingProfile(sourceSystem, artifactFamily string) *models.MappingProfile {
	loadDetectorProfiles()

	def, ok := detectorProfiles[sourceSystem]
	if !ok {
		for _, candidate := range detectorProfiles {
			if strings.EqualFold(candidate.SourceType, sourceSystem) {
				def = candidate
				ok = true
				break
			}
		}
	}
	if !ok || len(def.ColumnMap) == 0 {
		return nil
	}

	if artifactFamily == "" {
		artifactFamily = models.ArtifactFamilyPayoutFile
	}
	profileID := def.ProfileID
	if profileID == "" {
		profileID = fmt.Sprintf("system-%s-v1", strings.ToLower(sourceSystem))
	}
	amountFormat := def.AmountFormat
	if amountFormat == "" {
		amountFormat = models.AmountFormatDecimal
	}
	dateFormat := def.DateFormat
	if dateFormat == "" {
		dateFormat = "2006-01-02"
	}
	defaultCurrency := def.DefaultCurrency
	if defaultCurrency == "" {
		defaultCurrency = "INR"
	}
	defaultIntentType := def.DefaultIntentType
	if defaultIntentType == "" {
		defaultIntentType = "PAYOUT"
	}
	requiredFieldsJSON, _ := json.Marshal(def.RequiredFields)

	p := &models.MappingProfile{
		ProfileID:                profileID,
		ProfileVersion:           "1.0.0",
		SourceVendor:             strings.ToLower(sourceSystem),
		SourceSystem:             sourceSystem,
		ArtifactFamily:           artifactFamily,
		FileFormat:               "json",
		Delimiter:                ",",
		MappingStrategy:          "column_map",
		ColumnMap:                def.ColumnMap,
		AmountFormat:             amountFormat,
		DateFormat:               dateFormat,
		DefaultCurrency:          defaultCurrency,
		DefaultIntentType:        defaultIntentType,
		SourceTimezone:           "Asia/Kolkata",
		StrictRequiredFieldsJSON: requiredFieldsJSON,
		SoftInferableFieldsJSON:  json.RawMessage("[]"),
		FieldKindPolicyJSON:      json.RawMessage("{}"),
		SensitiveFieldPolicyJSON: json.RawMessage("{}"),
		ValidationMode:           models.ValidationModeStrict,
		OutputEntityFamily:       models.OutputEntityIntent,
		Status:                   "active",
		CreatedBy:                "global_profiles.json",
	}
	p.ProfileHash = p.ComputeProfileHash()
	return p
}

func loadMappingProfile(
	ctx context.Context,
	db *sql.DB,
	tenantID *uuid.UUID,
	sourceSystem string,
	artifactFamily string,
) (*models.MappingProfile, error) {

	var q string
	var args []any

	if tenantID == nil {
		// Global profile
		q = `SELECT profile_id, profile_version, tenant_id, tenant_name,
                    source_vendor, source_system, artifact_family, file_format,
                    delimiter, header_row_index, mapping_strategy,
                    column_map, amount_format, date_format, default_currency, default_intent_type, source_timezone,
                    strict_required_fields_json, soft_inferable_fields_json,
                    field_kind_policy_json, sensitive_field_policy_json,
                    profile_hash, validation_mode,
                    output_entity_family, status, notes, created_at, updated_at, created_by
             FROM mapping_profiles
             WHERE tenant_id IS NULL
               AND source_system = $1
               AND status = 'active'
             ORDER BY created_at DESC LIMIT 1`
		args = []any{sourceSystem}
	} else if artifactFamily == "" {
		q = `SELECT profile_id, profile_version, tenant_id, tenant_name,
                    source_vendor, source_system, artifact_family, file_format,
                    delimiter, header_row_index, mapping_strategy,
                    column_map, amount_format, date_format, default_currency, default_intent_type, source_timezone,
                    strict_required_fields_json, soft_inferable_fields_json,
                    field_kind_policy_json, sensitive_field_policy_json,
                    profile_hash, validation_mode,
                    output_entity_family, status, notes, created_at, updated_at, created_by
             FROM mapping_profiles
             WHERE tenant_id = $1
               AND source_system = $2
               AND status = 'active'
             ORDER BY created_at DESC LIMIT 1`
		args = []any{tenantID, sourceSystem}
	} else {
		q = `SELECT profile_id, profile_version, tenant_id, tenant_name,
                    source_vendor, source_system, artifact_family, file_format,
                    delimiter, header_row_index, mapping_strategy,
                    column_map, amount_format, date_format, default_currency, default_intent_type, source_timezone,
                    strict_required_fields_json, soft_inferable_fields_json,
                    field_kind_policy_json, sensitive_field_policy_json,
                    profile_hash, validation_mode,
                    output_entity_family, status, notes, created_at, updated_at, created_by
             FROM mapping_profiles
             WHERE tenant_id = $1
               AND source_system = $2
               AND artifact_family = $3
               AND status = 'active'
             ORDER BY created_at DESC LIMIT 1`
		args = []any{tenantID, sourceSystem, artifactFamily}
	}

	row := db.QueryRowContext(ctx, q, args...)
	return scanMappingProfile(row)
}

func scanMappingProfile(row *sql.Row) (*models.MappingProfile, error) {
	var p models.MappingProfile
	var colMapRaw []byte
	var tenantIDPtr *uuid.UUID

	err := row.Scan(
		&p.ProfileID, &p.ProfileVersion, &tenantIDPtr, &p.TenantName,
		&p.SourceVendor, &p.SourceSystem, &p.ArtifactFamily, &p.FileFormat,
		&p.Delimiter, &p.HeaderRowIndex, &p.MappingStrategy,
		&colMapRaw, (*string)(&p.AmountFormat), &p.DateFormat,
		&p.DefaultCurrency, &p.DefaultIntentType, &p.SourceTimezone,
		&p.StrictRequiredFieldsJSON, &p.SoftInferableFieldsJSON,
		&p.FieldKindPolicyJSON, &p.SensitiveFieldPolicyJSON,
		&p.ProfileHash, &p.ValidationMode,
		&p.OutputEntityFamily, &p.Status, &p.Notes,
		&p.CreatedAt, &p.UpdatedAt, &p.CreatedBy,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(colMapRaw, &p.ColumnMap); err != nil {
		return nil, fmt.Errorf("column_map unmarshal: %w", err)
	}
	p.TenantID = tenantIDPtr
	if p.ProfileHash == "" {
		// Legacy row created before profile_hash existed — compute it now so
		// callers never see an empty hash for an active profile.
		p.ProfileHash = p.ComputeProfileHash()
	}
	if p.ValidationMode == "" {
		p.ValidationMode = models.ValidationModeStrict
	}
	return &p, nil
}
