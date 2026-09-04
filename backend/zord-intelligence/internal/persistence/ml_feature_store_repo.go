package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/ml/isolation"
)

// MLFeatureStoreRepo handles all DB operations for the ml_feature_store table.
//
// WHAT IS THE ML FEATURE STORE?
// The ML feature store persists engineered feature vectors per entity+window.
// It separates ML concerns from the deterministic projection layer.
//
// WHY PERSIST FEATURES SEPARATELY?
// Two reasons:
//   1. TRAINING DATA: Features computed today become training data for next quarter's
//      model. Without persistence, you cannot retrain without replaying all events.
//   2. AUDIT: Every ML decision must be explainable. Storing the feature vector that
//      caused a risk score lets us answer "why did ZPI flag batch X as high-risk?"
//
// LABEL LIFECYCLE:
//   - feature row is written with label_json = NULL (outcome not yet known)
//   - When the ground truth is observed (e.g. batch finally resolved as FAILED),
//     SetLabel() is called to attach the label to the feature row
//   - Labeled rows are used for supervised model training
//   - Unlabeled rows are used for inference (online scoring)
//
// CURRENT FEATURE FAMILIES (matching ml_feature_store.feature_family CHECK constraint):
//   LEAKAGE   — features for leakage anomaly detection and forecasting
//   AMBIGUITY — features for ambiguity propensity prediction
//   RCA       — features for root cause classification
//   PATTERN   — features for batch quality / duplicate risk scoring
//   SLA       — features for SLA breach prediction

// MLFeatureRow mirrors the ml_feature_store DB table.
type MLFeatureRow struct {
	FeatureRowID  string          `json:"feature_row_id"` // "feat_" + uuid
	TenantID      string          `json:"tenant_id"`
	ScopeType     string          `json:"scope_type"`     // INTENT | BATCH | CORRIDOR | TENANT | PSP
	ScopeRef      string          `json:"scope_ref"`      // the entity ID
	FeatureFamily string          `json:"feature_family"` // LEAKAGE | AMBIGUITY | RCA | PATTERN | SLA
	WindowStart   time.Time       `json:"window_start"`
	WindowEnd     time.Time       `json:"window_end"`
	FeaturesJSON  json.RawMessage `json:"features_json"`           // the feature vector
	LabelJSON     json.RawMessage `json:"label_json,omitempty"`    // ground truth; nil until observed
	ModelVersion  *string         `json:"model_version,omitempty"` // nil for deterministic features
	CreatedAt     time.Time       `json:"created_at"`
}

// MLFeatureStoreRepo provides Insert, Label, and Read operations for ml_feature_store.
type MLFeatureStoreRepo struct {
	pool *pgxpool.Pool
}

// NewMLFeatureStoreRepo creates an MLFeatureStoreRepo.
func NewMLFeatureStoreRepo(pool *pgxpool.Pool) *MLFeatureStoreRepo {
	return &MLFeatureStoreRepo{pool: pool}
}

// Insert writes a new feature row to the store.
//
// Called by Phase 3's intelligence layer services whenever they compute
// a new feature vector for a given entity+window.
//
// The feature_row_id must be unique. Callers should use "feat_" + uuid.
// label_json should be nil at insert time — use SetLabel() when the outcome is known.
//
// IDEMPOTENCY: Unlike projections (which use ON CONFLICT UPDATE),
// feature rows are insert-only. If the same feature_row_id is submitted twice,
// Postgres will return a unique violation error. The caller is responsible for
// ensuring feature_row_id uniqueness (use deterministic IDs: hash of scope+window+family
// if you need idempotency, or uuid if each computation is always unique).
func (r *MLFeatureStoreRepo) Insert(ctx context.Context, row MLFeatureRow) error {
	sql := `
		INSERT INTO ml_feature_store
			(feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
			 window_start, window_end, features_json, label_json, model_version, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	if _, err := r.pool.Exec(ctx, sql,
		row.FeatureRowID,
		row.TenantID,
		row.ScopeType,
		row.ScopeRef,
		row.FeatureFamily,
		row.WindowStart,
		row.WindowEnd,
		row.FeaturesJSON,
		row.LabelJSON,    // nullable
		row.ModelVersion, // nullable
		row.CreatedAt,
	); err != nil {
		return fmt.Errorf("ml_feature_store_repo.Insert row_id=%s family=%s: %w",
			row.FeatureRowID, row.FeatureFamily, err)
	}
	return nil
}

// Upsert replaces the current feature payload for a deterministic feature row ID.
// Used for long-lived scope rows such as one evolving BATCH leakage feature row.
func (r *MLFeatureStoreRepo) Upsert(ctx context.Context, row MLFeatureRow) error {
	sql := `
		INSERT INTO ml_feature_store
			(feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
			 window_start, window_end, features_json, label_json, model_version, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (feature_row_id) DO UPDATE SET
			window_start = EXCLUDED.window_start,
			window_end = EXCLUDED.window_end,
			features_json = EXCLUDED.features_json,
			label_json = COALESCE(ml_feature_store.label_json, EXCLUDED.label_json),
			model_version = EXCLUDED.model_version,
			created_at = EXCLUDED.created_at
	`
	if _, err := r.pool.Exec(ctx, sql,
		row.FeatureRowID,
		row.TenantID,
		row.ScopeType,
		row.ScopeRef,
		row.FeatureFamily,
		row.WindowStart,
		row.WindowEnd,
		row.FeaturesJSON,
		row.LabelJSON,
		row.ModelVersion,
		row.CreatedAt,
	); err != nil {
		return fmt.Errorf("ml_feature_store_repo.Upsert row_id=%s family=%s: %w",
			row.FeatureRowID, row.FeatureFamily, err)
	}
	return nil
}

// SetLabel attaches a ground-truth label to an existing feature row.
//
// Called when the outcome of the entity is finally known.
// Example: a batch that was flagged as HIGH_RISK eventually resolved as FAILED →
//
//	SetLabel(ctx, feature_row_id, []byte(`{"outcome": "FAILED", "resolved_at": "..."}`) )
//
// This is the mechanism by which ZPI builds a supervised training dataset
// from its own operational outcomes — without requiring any external labeling.
func (r *MLFeatureStoreRepo) SetLabel(
	ctx context.Context,
	featureRowID string,
	labelJSON json.RawMessage,
) error {
	sql := `
		UPDATE ml_feature_store
		SET label_json = $2
		WHERE feature_row_id = $1
		  AND label_json IS NULL
	`
	// AND label_json IS NULL: prevents accidentally overwriting a label that
	// was already set. If the label is already set and a second SetLabel arrives
	// (e.g. Kafka redelivery), we silently skip it.
	tag, err := r.pool.Exec(ctx, sql, featureRowID, labelJSON)
	if err != nil {
		return fmt.Errorf("ml_feature_store_repo.SetLabel row_id=%s: %w", featureRowID, err)
	}
	if tag.RowsAffected() == 0 {
		// Either row not found or label already set — both are non-fatal.
		return nil
	}
	return nil
}

// GetByID returns one feature row by its primary key.
// Returns nil, nil when no row exists.
func (r *MLFeatureStoreRepo) GetByID(
	ctx context.Context,
	featureRowID string,
) (*MLFeatureRow, error) {
	sql := `
		SELECT feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
		       window_start, window_end, features_json, label_json, model_version, created_at
		FROM   ml_feature_store
		WHERE  feature_row_id = $1
	`
	row := r.pool.QueryRow(ctx, sql, featureRowID)
	feat, err := scanMLFeatureRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("ml_feature_store_repo.GetByID row_id=%s: %w", featureRowID, err)
	}
	return feat, nil
}

// ListUnlabeled returns feature rows of a given family that do not yet have labels.
//
// Used by the ML training pipeline to find rows ready for label attachment.
// Also used by the online scoring engine to find features awaiting inference.
// limit controls how many rows to return (max 500 — ML batches can be larger).
func (r *MLFeatureStoreRepo) ListUnlabeled(
	ctx context.Context,
	tenantID string,
	featureFamily string,
	limit int,
) ([]MLFeatureRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	sql := `
		SELECT feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
		       window_start, window_end, features_json, label_json, model_version, created_at
		FROM   ml_feature_store
		WHERE  tenant_id      = $1
		  AND  feature_family = $2
		  AND  label_json     IS NULL
		ORDER  BY created_at DESC
		LIMIT  $3
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, featureFamily, limit)
	if err != nil {
		return nil, fmt.Errorf("ml_feature_store_repo.ListUnlabeled family=%s: %w",
			featureFamily, err)
	}
	defer rows.Close()

	var result []MLFeatureRow
	for rows.Next() {
		feat, err := scanMLFeatureRowFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("ml_feature_store_repo.ListUnlabeled scan: %w", err)
		}
		result = append(result, *feat)
	}
	return result, nil
}

// ListForTraining returns labeled feature rows for a given family and time window.
//
// Used by the offline training pipeline. Returns only rows where label_json IS NOT NULL
// (i.e. the ground truth outcome is known).
// windowStart/End bounds the created_at timestamp to limit the training window.
func (r *MLFeatureStoreRepo) ListForTraining(
	ctx context.Context,
	tenantID string,
	featureFamily string,
	windowStart, windowEnd time.Time,
	limit int,
) ([]MLFeatureRow, error) {
	if limit <= 0 || limit > 10000 {
		limit = 1000
	}

	sql := `
		SELECT feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
		       window_start, window_end, features_json, label_json, model_version, created_at
		FROM   ml_feature_store
		WHERE  tenant_id      = $1
		  AND  feature_family = $2
		  AND  label_json     IS NOT NULL
		  AND  created_at     >= $3
		  AND  created_at     <  $4
		ORDER  BY created_at ASC
		LIMIT  $5
	`
	rows, err := r.pool.Query(ctx, sql,
		tenantID, featureFamily, windowStart, windowEnd, limit)
	if err != nil {
		return nil, fmt.Errorf("ml_feature_store_repo.ListForTraining family=%s: %w",
			featureFamily, err)
	}
	defer rows.Close()

	var result []MLFeatureRow
	for rows.Next() {
		feat, err := scanMLFeatureRowFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("ml_feature_store_repo.ListForTraining scan: %w", err)
		}
		result = append(result, *feat)
	}
	return result, nil
}

// GetRecentFloatField returns the last `limit` values of a single float field
// from features_json for a given tenant + family.
//
// Used by Z-score detector to read historical leakage_percentage values.
// fieldName must be a top-level key in features_json whose value is a number.
//
// Example: GetRecentFloatField(ctx, "tnt_A", "LEAKAGE", "leakage_percentage", 30)
// returns the last 30 daily leakage rates for tenant tnt_A.
func (r *MLFeatureStoreRepo) GetRecentFloatField(
	ctx context.Context,
	tenantID string,
	featureFamily string,
	fieldName string,
	limit int,
) ([]float64, error) {
	if limit <= 0 {
		limit = 30
	}

	// Extract the specific float field from JSONB using the ->> operator.
	// ::float cast converts the text value to float (returns NULL if not numeric).
	sql := `
		SELECT (features_json ->> $4)::float
		FROM   ml_feature_store
		WHERE  tenant_id      = $1
		  AND  feature_family = $2
		  AND  features_json ? $3
		  AND  (features_json ->> $4)::float IS NOT NULL
		ORDER  BY created_at DESC
		LIMIT  $5
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, featureFamily, fieldName, fieldName, limit)
	if err != nil {
		return nil, fmt.Errorf("ml_feature_store_repo.GetRecentFloatField family=%s field=%s: %w",
			featureFamily, fieldName, err)
	}
	defer rows.Close()

	var values []float64
	for rows.Next() {
		var v float64
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("ml_feature_store_repo.GetRecentFloatField scan: %w", err)
		}
		values = append(values, v)
	}
	return values, rows.Err()
}

// GetRecentBatchFeatures returns the last `limit` PATTERN feature rows as float
// slices suitable for training/scoring an Isolation Forest.
//
// The feature vector order matches isolation.BuildFeatures():
//   [0] ambiguity_rate
//   [1] variance_rate
//   [2] settlement_gap (derived from settlement_ratio)
//   [3] unresolved_ratio
//   [4] missing_ref_rate
//
// Rows with any NULL numeric field are skipped.
func (r *MLFeatureStoreRepo) GetRecentBatchFeatures(
	ctx context.Context,
	tenantID string,
	limit int,
) ([][]float64, error) {
	if limit <= 0 {
		limit = 200
	}

	// Pull the raw JSON rows; we'll parse the vector in Go.
	sql := `
		SELECT features_json
		FROM   ml_feature_store
		WHERE  tenant_id      = $1
		  AND  feature_family = 'PATTERN'
		ORDER  BY created_at DESC
		LIMIT  $2
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, limit)
	if err != nil {
		return nil, fmt.Errorf("ml_feature_store_repo.GetRecentBatchFeatures: %w", err)
	}
	defer rows.Close()

	var matrix [][]float64
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			continue
		}
		vec := parseBatchFeatureVector(raw)
		if vec != nil {
			matrix = append(matrix, vec)
		}
	}
	return matrix, rows.Err()
}

// parseBatchFeatureVector extracts the 5-element float vector from a PATTERN
// features_json blob. It prefers current normalized fields and falls back to
// legacy count-based fields for older rows.
func parseBatchFeatureVector(raw []byte) []float64 {
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}

	asFloat := func(key string) (float64, bool) {
		v, ok := m[key]
		if !ok {
			return 0, false
		}
		switch n := v.(type) {
		case float64:
			return n, true
		case int:
			return float64(n), true
		}
		return 0, false
	}

	asRate := func(numKey, denKey string) (float64, bool) {
		num, ok1 := asFloat(numKey)
		den, ok2 := asFloat(denKey)
		if !ok1 || !ok2 || den == 0 {
			return 0, ok1 && ok2
		}
		v := num / den
		if v < 0 {
			v = 0
		}
		if v > 1 {
			v = 1
		}
		return v, true
	}

	amb, ok0 := asFloat("ambiguity_rate")
	if !ok0 {
		amb, ok0 = asFloat("ambiguity_score")
	}
	if !ok0 {
		return nil
	}

	varRate, ok := asFloat("variance_rate")
	if !ok {
		varRate, _ = asRate("total_variance_minor", "total_intended_amount_minor")
	}

	settlementRatio, ok := asFloat("settlement_ratio")
	if !ok {
		settlementRatio, _ = asRate("settled_count", "total_count")
	}

	unresolvedRatio, ok := asFloat("unresolved_ratio")
	if !ok {
		unresolvedRatio, _ = asRate("unresolved_count", "total_count")
	}

	missingRefRate, ok := asFloat("missing_ref_rate")
	if !ok {
		missingRefRate, _ = asRate("missing_ref_count", "total_count")
	}

	return isolation.BuildFeatures(amb, varRate, settlementRatio, unresolvedRatio, missingRefRate)
}

// scanMLFeatureRow scans one row from a QueryRow call.
func scanMLFeatureRow(row pgx.Row) (*MLFeatureRow, error) {
	var f MLFeatureRow
	err := row.Scan(
		&f.FeatureRowID,
		&f.TenantID,
		&f.ScopeType,
		&f.ScopeRef,
		&f.FeatureFamily,
		&f.WindowStart,
		&f.WindowEnd,
		&f.FeaturesJSON,
		&f.LabelJSON,
		&f.ModelVersion,
		&f.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// scanMLFeatureRowFromRows scans one row from a Query (rows) call.
func scanMLFeatureRowFromRows(rows pgx.Rows) (*MLFeatureRow, error) {
	var f MLFeatureRow
	err := rows.Scan(
		&f.FeatureRowID,
		&f.TenantID,
		&f.ScopeType,
		&f.ScopeRef,
		&f.FeatureFamily,
		&f.WindowStart,
		&f.WindowEnd,
		&f.FeaturesJSON,
		&f.LabelJSON,
		&f.ModelVersion,
		&f.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &f, nil
}
