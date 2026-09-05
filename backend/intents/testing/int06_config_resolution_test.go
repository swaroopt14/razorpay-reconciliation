package audittests

// INT-06 regression coverage: "Fail safely when mapping profile or synonym
// configuration is unavailable."
//
// The bug: ResolveProfileForIntent (mapping profiles) and LoadTenantSynonyms
// (tenant synonyms) both treated a real DB failure the same as "not
// configured" — every tier checked `err == nil && p != nil` and simply fell
// through to the next tier (eventually the in-memory built-in profile, or an
// empty synonym map) instead of surfacing the error. A transient DB outage
// could therefore make one replica silently canonicalize a row under
// default/weaker rules while a healthy replica — or the same row retried
// after recovery — would apply the tenant's real profile/synonyms,
// producing two different interpretations of the same source row.
//
// This test lives outside internal/services (which is where the bug was
// originally fixed and tested) at the user's request, so all of this
// package's regression tests live in one folder together. That only works
// because LoadMappingProfile, LoadBuiltInMappingProfile and
// LoadTenantSynonyms were exported specifically for it — they used to be
// unexported (loadMappingProfile / loadBuiltInMappingProfile /
// loadTenantSynonyms) and only reachable from a test in the same package
// directory, the same constraint INT-01's PersistRejectedIntentDLQ hit
// first. Renaming them is a pure visibility change: same behavior, same
// call sites, just callable from here too.
//
// legacyResolveProfileForIntent and legacyLoadTenantSynonyms below are
// verbatim reproductions of the pre-fix orchestration logic (they still call
// the real, unchanged LoadMappingProfile/db query — only the swallow was
// removed from these two functions, not from their leaf DB calls) so the
// "old" tests below prove the bug actually existed, and the "new" tests
// prove the fix against an identical simulated DB failure.
//
// Run with: go test ./testing/... -run TestINT06 -v

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/services"
)

// ---------------------------------------------------------------------------
// Mapping profile resolution
// ---------------------------------------------------------------------------

// legacyResolveProfileForIntent is a verbatim reproduction of
// ResolveProfileForIntent's pre-INT-06 tier logic: `err == nil && p != nil`
// gates every tier, so a real error and a genuine "not found" both just fall
// through to the next tier.
func legacyResolveProfileForIntent(
	ctx context.Context,
	db *sql.DB,
	tenantID uuid.UUID,
	sourceSystem string,
	artifactFamily string,
) (*models.MappingProfile, error) {
	p, err := services.LoadMappingProfile(ctx, db, &tenantID, sourceSystem, artifactFamily)
	if err == nil && p != nil {
		return p, nil
	}
	p, err = services.LoadMappingProfile(ctx, db, &tenantID, sourceSystem, "")
	if err == nil && p != nil {
		return p, nil
	}
	p, err = services.LoadMappingProfile(ctx, db, nil, sourceSystem, "")
	if err == nil && p != nil {
		return p, nil
	}
	p = services.LoadBuiltInMappingProfile(sourceSystem, artifactFamily)
	if p != nil {
		return p, nil
	}
	return nil, nil
}

func newProfileSQLMock(t *testing.T) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db, mock
}

// TestINT06_LegacyBehavior_ProfileDBErrorMaskedAsNotFound reproduces the bug:
// every DB tier fails (simulated outage), the source system has no built-in
// profile, and the legacy function still returns (nil, nil) — indistinguishable
// from "this tenant genuinely has no profile configured".
func TestINT06_LegacyBehavior_ProfileDBErrorMaskedAsNotFound(t *testing.T) {
	db, mock := newProfileSQLMock(t)
	dbErr := errors.New("dial tcp 10.0.0.5:5432: connect: connection refused")

	mock.ExpectQuery("FROM mapping_profiles").WillReturnError(dbErr)
	mock.ExpectQuery("FROM mapping_profiles").WillReturnError(dbErr)
	mock.ExpectQuery("FROM mapping_profiles").WillReturnError(dbErr)

	profile, err := legacyResolveProfileForIntent(context.Background(), db, uuid.New(), "ACME_UNCONFIGURED_ERP", "LIVE_INTENT_JSON")

	t.Logf("[LEGACY/OLD] all 3 DB tiers returned error=%v", dbErr)
	t.Logf("[LEGACY/OLD] legacyResolveProfileForIntent returned profile=%v err=%v (caller cannot tell this apart from a genuinely unconfigured tenant)", profile, err)

	if err != nil {
		t.Fatalf("legacy reproduction is expected to demonstrate the bug (err == nil) but got err=%v", err)
	}
	if profile != nil {
		t.Fatalf("expected nil profile (no built-in profile for this source system), got %+v", profile)
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations: %v", mockErr)
	}
	t.Log("[LEGACY/OLD] CONFIRMED BUG: 3 DB failures produced the same (nil, nil) result as 'tenant has no profile' — a real outage is silently indistinguishable from normal operation.")
}

// TestINT06_FixedBehavior_ProfileDBErrorPropagates exercises the real,
// currently-wired ResolveProfileForIntent against the identical simulated
// failure and confirms the error now surfaces to the caller.
func TestINT06_FixedBehavior_ProfileDBErrorPropagates(t *testing.T) {
	db, mock := newProfileSQLMock(t)
	dbErr := errors.New("dial tcp 10.0.0.5:5432: connect: connection refused")

	mock.ExpectQuery("FROM mapping_profiles").WillReturnError(dbErr)

	profile, err := services.ResolveProfileForIntent(context.Background(), db, uuid.New(), "ACME_UNCONFIGURED_ERP", "LIVE_INTENT_JSON")

	t.Logf("[FIXED/NEW] tier-1 DB query returned error=%v", dbErr)
	t.Logf("[FIXED/NEW] ResolveProfileForIntent returned profile=%v err=%v", profile, err)

	if err == nil {
		t.Fatal("expected ResolveProfileForIntent to propagate the DB error, got nil — INT-06 regression")
	}
	if profile != nil {
		t.Fatalf("expected nil profile alongside the error, got %+v", profile)
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations (fixed function must stop at tier 1, not try tiers 2/3/4 after an error): %v", mockErr)
	}
	t.Log("[FIXED/NEW] CONFIRMED FIX: a single DB failure is surfaced immediately — no fallthrough to further tiers or the in-memory default.")
}

// TestINT06_FixedBehavior_MidTierDBErrorPropagates confirms the fix also
// catches a failure that only occurs on a later tier (tier 1 legitimately
// empty, tier 2 fails) — not just a failure on the very first query.
func TestINT06_FixedBehavior_MidTierDBErrorPropagates(t *testing.T) {
	db, mock := newProfileSQLMock(t)
	dbErr := errors.New("driver: bad connection")

	mock.ExpectQuery("FROM mapping_profiles").WillReturnRows(sqlmock.NewRows(profileColumns()))
	mock.ExpectQuery("FROM mapping_profiles").WillReturnError(dbErr)

	_, err := services.ResolveProfileForIntent(context.Background(), db, uuid.New(), "ACME_UNCONFIGURED_ERP", "LIVE_INTENT_JSON")

	if err == nil {
		t.Fatal("expected a mid-tier DB error to propagate, got nil")
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations: %v", mockErr)
	}
	t.Logf("[FIXED/NEW] tier-1 genuinely empty (no error), tier-2 failed -> err=%v propagated correctly", err)
}

// TestINT06_FixedBehavior_GenuineNotFoundStillFallsThrough proves the fix
// didn't break the legitimate path: every DB tier genuinely has no matching
// row (no error), so resolution correctly falls through to the priority-4
// in-memory built-in profile, exactly as before this fix.
func TestINT06_FixedBehavior_GenuineNotFoundStillFallsThrough(t *testing.T) {
	db, mock := newProfileSQLMock(t)

	mock.ExpectQuery("FROM mapping_profiles").WillReturnRows(sqlmock.NewRows(profileColumns()))
	mock.ExpectQuery("FROM mapping_profiles").WillReturnRows(sqlmock.NewRows(profileColumns()))
	mock.ExpectQuery("FROM mapping_profiles").WillReturnRows(sqlmock.NewRows(profileColumns()))

	profile, err := services.ResolveProfileForIntent(context.Background(), db, uuid.New(), "TALLY", models.ArtifactFamilyPayoutFile)

	if err != nil {
		t.Fatalf("expected no error for a genuinely unconfigured (but DB-healthy) lookup, got %v", err)
	}
	if profile == nil || profile.ProfileID != "system-tally-v1" {
		t.Fatalf("expected fallthrough to the built-in TALLY profile, got %+v", profile)
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations: %v", mockErr)
	}
	t.Log("[FIXED/NEW] CONFIRMED: 3 genuinely-empty DB tiers (no error) still fall through to the built-in profile, unchanged from before this fix.")
}

func profileColumns() []string {
	return []string{
		"profile_id", "profile_version", "tenant_id", "tenant_name",
		"source_vendor", "source_system", "artifact_family", "file_format",
		"delimiter", "header_row_index", "mapping_strategy",
		"column_map", "amount_format", "date_format", "default_currency", "default_intent_type", "source_timezone",
		"strict_required_fields_json", "soft_inferable_fields_json",
		"field_kind_policy_json", "sensitive_field_policy_json",
		"profile_hash", "validation_mode",
		"output_entity_family", "status", "notes", "created_at", "updated_at", "created_by",
	}
}

// ---------------------------------------------------------------------------
// Tenant synonym resolution
// ---------------------------------------------------------------------------

// legacyLoadTenantSynonyms is a verbatim reproduction of LoadTenantSynonyms's
// pre-INT-06 behavior: any query error is logged and swallowed, returning an
// empty map exactly as if the tenant had no overrides configured.
func legacyLoadTenantSynonyms(ctx context.Context, db *sql.DB, tenantID uuid.UUID) map[string]string {
	synonyms := make(map[string]string)
	rows, err := db.QueryContext(ctx, `
		SELECT source_key, canonical_path
		FROM tenant_synonym_profiles
		WHERE tenant_id = $1 AND is_active = true
	`, tenantID)
	if err != nil {
		return synonyms // bug: swallowed
	}
	defer rows.Close()
	for rows.Next() {
		var sourceKey, canonicalPath string
		if scanErr := rows.Scan(&sourceKey, &canonicalPath); scanErr != nil {
			continue
		}
		synonyms[sourceKey] = canonicalPath
	}
	return synonyms
}

func newSynonymSQLMock(t *testing.T) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db, mock
}

// TestINT06_LegacyBehavior_SynonymDBErrorMaskedAsNoOverrides reproduces the
// synonym-side bug: a query failure and "tenant has no overrides" both
// produce an identical empty map with no way to tell them apart.
func TestINT06_LegacyBehavior_SynonymDBErrorMaskedAsNoOverrides(t *testing.T) {
	db, mock := newSynonymSQLMock(t)
	dbErr := errors.New("dial tcp 10.0.0.5:5432: connect: connection refused")
	mock.ExpectQuery("FROM tenant_synonym_profiles").WillReturnError(dbErr)

	synonyms := legacyLoadTenantSynonyms(context.Background(), db, uuid.New())

	t.Logf("[LEGACY/OLD] DB query error=%v", dbErr)
	t.Logf("[LEGACY/OLD] legacyLoadTenantSynonyms returned synonyms=%v (empty, same shape as a tenant with zero configured overrides)", synonyms)

	if len(synonyms) != 0 {
		t.Fatalf("expected an empty map from the legacy function, got %v", synonyms)
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations: %v", mockErr)
	}
	t.Log("[LEGACY/OLD] CONFIRMED BUG: DB failure produced the same empty map as 'no overrides configured' — silently normalizes without the tenant's real synonym translations.")
}

// TestINT06_FixedBehavior_SynonymDBErrorPropagates exercises the real,
// currently-wired LoadTenantSynonyms against an identical simulated failure.
func TestINT06_FixedBehavior_SynonymDBErrorPropagates(t *testing.T) {
	db, mock := newSynonymSQLMock(t)
	dbErr := errors.New("dial tcp 10.0.0.5:5432: connect: connection refused")
	mock.ExpectQuery("FROM tenant_synonym_profiles").WillReturnError(dbErr)

	synonyms, err := services.LoadTenantSynonyms(context.Background(), db, uuid.New())

	t.Logf("[FIXED/NEW] DB query error=%v", dbErr)
	t.Logf("[FIXED/NEW] LoadTenantSynonyms returned synonyms=%v err=%v", synonyms, err)

	if err == nil {
		t.Fatal("expected LoadTenantSynonyms to propagate the DB error, got nil — INT-06 regression")
	}
	if synonyms != nil {
		t.Fatalf("expected a nil map alongside the error, got %v", synonyms)
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations: %v", mockErr)
	}
	t.Log("[FIXED/NEW] CONFIRMED FIX: DB failure is surfaced as a real error instead of an empty map.")
}

// TestINT06_FixedBehavior_SynonymGenuineEmptyStillWorks proves the fix
// didn't break the legitimate "tenant has no overrides configured" path.
func TestINT06_FixedBehavior_SynonymGenuineEmptyStillWorks(t *testing.T) {
	db, mock := newSynonymSQLMock(t)
	mock.ExpectQuery("FROM tenant_synonym_profiles").
		WillReturnRows(sqlmock.NewRows([]string{"source_key", "canonical_path"}))

	synonyms, err := services.LoadTenantSynonyms(context.Background(), db, uuid.New())

	if err != nil {
		t.Fatalf("expected no error for a genuinely empty (but DB-healthy) result, got %v", err)
	}
	if len(synonyms) != 0 {
		t.Fatalf("expected an empty map, got %v", synonyms)
	}
	if mockErr := mock.ExpectationsWereMet(); mockErr != nil {
		t.Fatalf("unmet DB expectations: %v", mockErr)
	}
	t.Log("[FIXED/NEW] CONFIRMED: a genuinely empty, DB-healthy result still returns an empty map with no error, unchanged from before this fix.")
}
