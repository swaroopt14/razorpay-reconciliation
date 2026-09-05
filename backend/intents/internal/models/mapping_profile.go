package models

import (
	"encoding/json"
	"sort"
	"time"

	"zord-intent-engine/internal/jcs"

	"github.com/google/uuid"
)

// R-09: STRICT was renamed to REVIEW_STRICT (identical behavior — hold for
// review) because its old name promised hard rejection it never delivered.
// REVIEW was functionally identical to STRICT and was folded into
// REVIEW_STRICT too. HARD_STRICT is new: an explicit per-tenant opt-in
// (set via the admin mapping-profile API) that hard-rejects a missing
// required field instead of holding it for review.
const (
	ValidationModeReviewStrict = "REVIEW_STRICT"
	ValidationModeHardStrict   = "HARD_STRICT"
	ValidationModeObserve      = "OBSERVE"
)

type AmountFormat string

const (
	AmountFormatDecimal            AmountFormat = "DECIMAL"
	AmountFormatWithCurrencySymbol AmountFormat = "WITH_CURRENCY_SYMBOL"
	AmountFormatPaise              AmountFormat = "PAISE"
	AmountFormatIndianComma        AmountFormat = "INDIAN_COMMA"
)

const (
	SourceTypeTally      = "TALLY"
	SourceTypeSAP        = "SAP"
	SourceTypeERP        = "ERP"
	SourceTypeQuickbooks = "QUICKBOOKS"
	SourceTypeCustom     = "CUSTOM"
	SourceTypeGeneric    = ""
)

// ArtifactFamily values
const (
	ArtifactFamilyLiveIntentJSON = "LIVE_INTENT_JSON"
	ArtifactFamilyPayoutFile     = "PAYOUT_FILE"
	ArtifactFamilySettlementFile = "SETTLEMENT_FILE"
	ArtifactFamilyStatementFile  = "STATEMENT_FILE"
	ArtifactFamilyCallbackEvent  = "CALLBACK_EVENT"
	ArtifactFamilyRetryFile      = "RETRY_FILE"
	ArtifactFamilyReversalFile   = "REVERSAL_FILE"
)

// OutputEntityFamily values
const (
	OutputEntityIntent                = "INTENT"
	OutputEntitySettlementObservation = "SETTLEMENT_OBSERVATION"
	OutputEntityBatchContext          = "BATCH_CONTEXT"
)

// MappingProfile defines how raw vendor/customer/source formats map into NIR and canonical entities.
// profile_id is deterministic — set by admin at creation time, never auto-generated.
type MappingProfile struct {
	ProfileID       string     `json:"profile_id"        db:"profile_id"`
	ProfileVersion  string     `json:"profile_version"   db:"profile_version"`
	TenantID        *uuid.UUID `json:"tenant_id"         db:"tenant_id"` // nullable — global profiles have no tenant
	TenantName      string     `json:"tenant_name"       db:"tenant_name"`
	SourceVendor    string     `json:"source_vendor"     db:"source_vendor"`   // e.g. "tally", "sap", "razorpay"
	SourceSystem    string     `json:"source_system"     db:"source_system"`   // e.g. "TALLY", "SAP", "ERP"
	ArtifactFamily  string     `json:"artifact_family"   db:"artifact_family"` // PAYOUT_FILE, LIVE_INTENT_JSON, etc.
	FileFormat      string     `json:"file_format"       db:"file_format"`     // "csv" / "xlsx" / "json"
	Delimiter       string     `json:"delimiter"         db:"delimiter"`
	HeaderRowIndex  int        `json:"header_row_index"  db:"header_row_index"`
	MappingStrategy string     `json:"mapping_strategy"  db:"mapping_strategy"` // "column_map" / "json_path" / "synonym"

	// Column mapping: universal field name → tenant's actual column header
	ColumnMap map[string]string `json:"column_map"        db:"column_map"`

	AmountFormat      AmountFormat `json:"amount_format"     db:"amount_format"`
	DateFormat        string       `json:"date_format"       db:"date_format"`
	DefaultCurrency   string       `json:"default_currency"  db:"default_currency"`
	DefaultIntentType string       `json:"default_intent_type" db:"default_intent_type"` // e.g. "PAYOUT", "REFUND"
	SourceTimezone    string       `json:"source_timezone"   db:"source_timezone"`

	// Field policy JSON — stored as JSONB
	StrictRequiredFieldsJSON json.RawMessage `json:"strict_required_fields"   db:"strict_required_fields_json"`
	SoftInferableFieldsJSON  json.RawMessage `json:"soft_inferable_fields"    db:"soft_inferable_fields_json"`
	FieldKindPolicyJSON      json.RawMessage `json:"field_kind_policy"        db:"field_kind_policy_json"`
	SensitiveFieldPolicyJSON json.RawMessage `json:"sensitive_field_policy"   db:"sensitive_field_policy_json"`

	// ProfileHash is a deterministic hash of the profile's policy content
	// (column_map + field policy JSON). It lets a payment_intent/NIR row prove
	// exactly which profile content produced it, independent of profile_id/
	// version. Computed by ComputeProfileHash, not client-supplied.
	ProfileHash string `json:"profile_hash" db:"profile_hash"`

	// ValidationMode controls how a profile-required field being missing
	// affects the intent: REVIEW_STRICT (the default) flags for review
	// (governance_state = FLAGGED/REQUIRES_REVIEW); HARD_STRICT hard-rejects
	// to DLQ instead (reason_code = HARD_STRICT_REQUIRED_FIELD_MISSING);
	// OBSERVE records the field for visibility only, never flags or rejects.
	ValidationMode string `json:"validation_mode" db:"validation_mode"`

	OutputEntityFamily string `json:"output_entity_family" db:"output_entity_family"`

	Status    string    `json:"status"     db:"status"` // "active" / "inactive" / "draft"
	Notes     string    `json:"notes"      db:"notes"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
	CreatedBy string    `json:"created_by" db:"created_by"`
}

// mappingProfileNormalizationRules is a static description of the
// canonicalization rules internal/canonicalizer.CanonicalizeIntent actually
// applies (amount -> minor units, currency -> uppercase, strings -> trim).
// It's not per-profile configuration, so it's hashed as a fixed constant
// rather than a MappingProfile field.
var mappingProfileNormalizationRules = map[string]string{
	"amount":   "MINOR_UNITS",
	"currency": "UPPERCASE",
	"strings":  "TRIM",
}

// ComputeProfileHash returns
// mapping_profile_hash = SHA-256(JCS_Canonicalize({hash_type, hash_version, ...profile identity + policy content}))
// independent of status/timestamps. Two profiles with identical identity and
// policy content hash identically even under different profile_id/version.
// synonym_profile_version has no upstream tracking yet, so it hashes as "".
func (p *MappingProfile) ComputeProfileHash() string {
	var requiredFields, softInferableFields []string
	_ = json.Unmarshal(p.StrictRequiredFieldsJSON, &requiredFields)
	_ = json.Unmarshal(p.SoftInferableFieldsJSON, &softInferableFields)
	sort.Strings(requiredFields)
	sort.Strings(softInferableFields)

	var fieldKindPolicy, sensitiveFieldPolicy map[string]any
	_ = json.Unmarshal(p.FieldKindPolicyJSON, &fieldKindPolicy)
	_ = json.Unmarshal(p.SensitiveFieldPolicyJSON, &sensitiveFieldPolicy)

	fields := map[string]any{
		"hash_type":               "MAPPING_PROFILE",
		"hash_version":            "1",
		"profile_id":              p.ProfileID,
		"profile_version":         p.ProfileVersion,
		"source_system":           p.SourceSystem,
		"detected_format":         p.FileFormat,
		"field_mappings":          p.ColumnMap,
		"required_fields":         requiredFields,
		"soft_inferable_fields":   softInferableFields,
		"field_kind_policy":       fieldKindPolicy,
		"sensitive_field_policy":  sensitiveFieldPolicy,
		"normalization_rules":     mappingProfileNormalizationRules,
		"synonym_profile_version": "",
	}
	hash, err := jcs.CanonicalizeAndSHA256(fields)
	if err != nil {
		return ""
	}
	return hash
}

// IsFieldRequired reports whether fieldName appears in the profile's
// strict-required-fields list.
func (p *MappingProfile) IsFieldRequired(fieldName string) bool {
	if len(p.StrictRequiredFieldsJSON) == 0 {
		return false
	}
	var required []string
	if err := json.Unmarshal(p.StrictRequiredFieldsJSON, &required); err != nil {
		return false
	}
	for _, f := range required {
		if f == fieldName {
			return true
		}
	}
	return false
}
