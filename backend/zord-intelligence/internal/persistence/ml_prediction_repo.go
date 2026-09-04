package persistence

// ml_prediction_repo.go
//
// Handles DB operations for:
//   ml_predictions     — one row per scoring event (audit trail)
//   ml_model_registry  — trained model versions and their weights
//   ml_labels          — ground-truth labels for supervised training
//
// WHY PERSIST PREDICTIONS?
// Every time an ML model produces a score, we write it here so:
//   1. The score is auditable ("why was this batch flagged as HIGH?")
//   2. Operations teams can query recent predictions via the API.
//   3. We can later compute precision/recall by comparing prediction to label.
//
// WHY PERSIST MODELS?
// The Logistic Regression weights improve as labeled data arrives.
// We store weights in ml_model_registry so the service can reload them
// on restart without losing training progress.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Prediction ──────────────────────────────────────────────────────────────

// MLPrediction represents one row in ml_predictions.
type MLPrediction struct {
	PredictionID     string          // "pred_" + uuid
	TenantID         string
	ModelID          string          // FK to ml_model_registry
	ScopeType        string          // TENANT | BATCH | CORRIDOR | ...
	ScopeRef         string          // the actual ID (tenant_id, batch_id, etc.)
	PredictionFamily string          // LEAKAGE | AMBIGUITY | PATTERN | RECOMMENDATION
	PredictionValue  string          // human-readable: "HIGH", "CRITICAL", "0.87"
	PredictionScore  float64         // 0.0–1.0 normalised
	Confidence       float64         // how confident the model is
	FeatureRowID     *string         // FK to ml_feature_store (nullable)
	ExplanationJSON  json.RawMessage // {"top_features":[...], "z_score":2.8, ...}
	SnapshotID       *string         // FK to intelligence_snapshots (nullable)
	CreatedAt        time.Time
}

// MLPredictionRepo handles persistence of ML predictions and model registry.
type MLPredictionRepo struct {
	pool *pgxpool.Pool
}

// NewMLPredictionRepo creates an MLPredictionRepo.
func NewMLPredictionRepo(pool *pgxpool.Pool) *MLPredictionRepo {
	return &MLPredictionRepo{pool: pool}
}

// InsertPrediction writes one ML prediction to ml_predictions.
// Called every time an intelligence service runs an ML model.
func (r *MLPredictionRepo) InsertPrediction(ctx context.Context, p MLPrediction) error {
	sql := `
		INSERT INTO ml_predictions (
			prediction_id, tenant_id, model_id, scope_type, scope_ref,
			prediction_family, prediction_value, prediction_score,
			confidence, feature_row_id, explanation_json, snapshot_id, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT (prediction_id) DO NOTHING
	`
	_, err := r.pool.Exec(ctx, sql,
		p.PredictionID,
		p.TenantID,
		p.ModelID,
		p.ScopeType,
		p.ScopeRef,
		p.PredictionFamily,
		p.PredictionValue,
		p.PredictionScore,
		p.Confidence,
		p.FeatureRowID,
		p.ExplanationJSON,
		p.SnapshotID,
		p.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("ml_prediction_repo.InsertPrediction: %w", err)
	}
	return nil
}

// GetLatestPrediction returns the most recent prediction for a given scope + family.
// Returns nil if none found.
func (r *MLPredictionRepo) GetLatestPrediction(
	ctx context.Context,
	tenantID, scopeType, scopeRef, family string,
) (*MLPrediction, error) {
	sql := `
		SELECT prediction_id, tenant_id, model_id, scope_type, scope_ref,
		       prediction_family, prediction_value, prediction_score,
		       confidence, feature_row_id, explanation_json, snapshot_id, created_at
		FROM ml_predictions
		WHERE tenant_id = $1
		  AND scope_type = $2
		  AND scope_ref  = $3
		  AND prediction_family = $4
		ORDER BY created_at DESC
		LIMIT 1
	`
	row := r.pool.QueryRow(ctx, sql, tenantID, scopeType, scopeRef, family)

	var p MLPrediction
	var explanationBytes []byte
	err := row.Scan(
		&p.PredictionID, &p.TenantID, &p.ModelID, &p.ScopeType, &p.ScopeRef,
		&p.PredictionFamily, &p.PredictionValue, &p.PredictionScore,
		&p.Confidence, &p.FeatureRowID, &explanationBytes, &p.SnapshotID, &p.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("ml_prediction_repo.GetLatestPrediction: %w", err)
	}
	p.ExplanationJSON = explanationBytes
	return &p, nil
}

// ── Model Registry ──────────────────────────────────────────────────────────

// MLModelRecord represents one row in ml_model_registry.
type MLModelRecord struct {
	ModelID              string
	ModelName            string
	ModelFamily          string          // LEAKAGE | AMBIGUITY | PATTERN | ...
	Algorithm            string          // "zscore_v1" | "logistic_regression_v1" | ...
	TargetLabel          string
	FeatureVersion       string
	TrainingWindowStart  *time.Time
	TrainingWindowEnd    *time.Time
	HyperparametersJSON  json.RawMessage // serialised model weights
	MetricsJSON          json.RawMessage // precision, recall, AUC, etc.
	Status               string          // CANDIDATE | SHADOW | ACTIVE | RETIRED
	CreatedAt            time.Time
	ActivatedAt          *time.Time
}

// UpsertModel inserts or updates a model in ml_model_registry.
// Use this both when first creating a model and when updating weights after training.
func (r *MLPredictionRepo) UpsertModel(ctx context.Context, m MLModelRecord) error {
	sql := `
		INSERT INTO ml_model_registry (
			model_id, model_name, model_family, algorithm, target_label,
			feature_version, training_window_start, training_window_end,
			hyperparameters_json, metrics_json, status, created_at, activated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT (model_id) DO UPDATE SET
			hyperparameters_json = EXCLUDED.hyperparameters_json,
			metrics_json         = EXCLUDED.metrics_json,
			status               = EXCLUDED.status,
			training_window_end  = EXCLUDED.training_window_end,
			activated_at         = EXCLUDED.activated_at
	`
	_, err := r.pool.Exec(ctx, sql,
		m.ModelID, m.ModelName, m.ModelFamily, m.Algorithm, m.TargetLabel,
		m.FeatureVersion, m.TrainingWindowStart, m.TrainingWindowEnd,
		m.HyperparametersJSON, m.MetricsJSON, m.Status, m.CreatedAt, m.ActivatedAt,
	)
	if err != nil {
		return fmt.Errorf("ml_prediction_repo.UpsertModel: %w", err)
	}
	return nil
}

// GetActiveModel returns the ACTIVE model for a given family.
// Returns nil if no active model exists (service should use default weights).
func (r *MLPredictionRepo) GetActiveModel(
	ctx context.Context,
	family string,
) (*MLModelRecord, error) {
	sql := `
		SELECT model_id, model_name, model_family, algorithm, target_label,
		       feature_version, training_window_start, training_window_end,
		       hyperparameters_json, metrics_json, status, created_at, activated_at
		FROM ml_model_registry
		WHERE model_family = $1
		  AND status = 'ACTIVE'
		LIMIT 1
	`
	row := r.pool.QueryRow(ctx, sql, family)

	var m MLModelRecord
	var hpBytes, metricsBytes []byte
	err := row.Scan(
		&m.ModelID, &m.ModelName, &m.ModelFamily, &m.Algorithm, &m.TargetLabel,
		&m.FeatureVersion, &m.TrainingWindowStart, &m.TrainingWindowEnd,
		&hpBytes, &metricsBytes, &m.Status, &m.CreatedAt, &m.ActivatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("ml_prediction_repo.GetActiveModel family=%s: %w", family, err)
	}
	m.HyperparametersJSON = hpBytes
	m.MetricsJSON = metricsBytes
	return &m, nil
}

// ── ML Labels ───────────────────────────────────────────────────────────────

// MLLabel represents one row in ml_labels.
type MLLabel struct {
	LabelID        string
	TenantID       string
	ScopeType      string
	ScopeRef       string
	LabelFamily    string          // LEAKAGE | AMBIGUITY | FAILURE | DUPLICATE | SLA_BREACH | DEFENSIBILITY
	LabelValue     float64         // 0/1 for binary; float for regression
	LabelConfidence float64
	LabelSource    string          // "attachment_decision" | "variance_record" | "evidence_pack" | "sla_timer"
	SourceRefsJSON json.RawMessage
	FeatureRowID   *string
	CreatedAt      time.Time
}

// InsertLabel persists a ground-truth label.
// Called when Service 5C or Service 6 produces a final outcome we can learn from.
func (r *MLPredictionRepo) InsertLabel(ctx context.Context, l MLLabel) error {
	sql := `
		INSERT INTO ml_labels (
			label_id, tenant_id, scope_type, scope_ref,
			label_family, label_value, label_confidence,
			label_source, source_refs_json, feature_row_id, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (label_id) DO NOTHING
	`
	_, err := r.pool.Exec(ctx, sql,
		l.LabelID, l.TenantID, l.ScopeType, l.ScopeRef,
		l.LabelFamily, l.LabelValue, l.LabelConfidence,
		l.LabelSource, l.SourceRefsJSON, l.FeatureRowID, l.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("ml_prediction_repo.InsertLabel: %w", err)
	}
	return nil
}

// GetRecentLabels returns up to `limit` recent labels for a tenant + family.
// Used by training workers to pull fresh examples for SGD updates.
func (r *MLPredictionRepo) GetRecentLabels(
	ctx context.Context,
	tenantID, family string,
	limit int,
) ([]MLLabel, error) {
	sql := `
		SELECT label_id, tenant_id, scope_type, scope_ref,
		       label_family, label_value, label_confidence,
		       label_source, source_refs_json, feature_row_id, created_at
		FROM ml_labels
		WHERE tenant_id   = $1
		  AND label_family = $2
		ORDER BY created_at DESC
		LIMIT $3
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, family, limit)
	if err != nil {
		return nil, fmt.Errorf("ml_prediction_repo.GetRecentLabels: %w", err)
	}
	defer rows.Close()

	var labels []MLLabel
	for rows.Next() {
		var l MLLabel
		var srcBytes []byte
		if err := rows.Scan(
			&l.LabelID, &l.TenantID, &l.ScopeType, &l.ScopeRef,
			&l.LabelFamily, &l.LabelValue, &l.LabelConfidence,
			&l.LabelSource, &srcBytes, &l.FeatureRowID, &l.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("ml_prediction_repo.GetRecentLabels scan: %w", err)
		}
		l.SourceRefsJSON = srcBytes
		labels = append(labels, l)
	}
	return labels, rows.Err()
}
