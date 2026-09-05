package close

import (
	"context"
	"database/sql"
	"encoding/json"
)

type Store struct {
	DB *sql.DB
}

type groundTruthRow struct {
	EntityType        string
	EntityID          string
	ExpectedResult    string
	ExpectedReason    string
	ExpectedException bool
	ExpectedVariance  int64
	AmountMinor       int64
}

func (s *Store) ListGroundTruth(ctx context.Context, tenantID, connectorID, batchID string) ([]groundTruthRow, error) {
	if s == nil || s.DB == nil {
		return nil, nil
	}
	q := `
		SELECT entity_type, entity_id, expected_result, expected_reason, expected_exception, expected_variance, amount_minor
		FROM synthetic_ground_truth
		WHERE tenant_id=$1 AND connector_id=$2`
	args := []any{tenantID, connectorID}
	if batchID != "" {
		q += ` AND batch_id=$3`
		args = append(args, batchID)
	}
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []groundTruthRow
	for rows.Next() {
		var r groundTruthRow
		if err := rows.Scan(&r.EntityType, &r.EntityID, &r.ExpectedResult, &r.ExpectedReason, &r.ExpectedException, &r.ExpectedVariance, &r.AmountMinor); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) SaveCloseRun(ctx context.Context, rep Report) error {
	if s == nil || s.DB == nil {
		return nil
	}
	acc, _ := json.Marshal(rep.Accuracy)
	body, _ := json.Marshal(rep)
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO finance_close_runs (
			id, tenant_id, connector_id, batch_id, recon_run_id, status, records, matched, exceptions,
			match_rate, investigated, resolved_by_investigation, still_unresolved, unresolved_exposure_minor,
			false_resolutions, throughput_per_s, duration_ms, accuracy, report, completed_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
		rep.CloseRunID, rep.TenantID, rep.ConnectorID, rep.BatchID, rep.ReconRunID, "completed",
		rep.Records, rep.Matched, rep.Exceptions, rep.MatchRate, rep.Investigated, rep.ResolvedByInvestigation,
		rep.StillUnresolved, rep.UnresolvedExposureMinor, rep.FalseResolutions, rep.ThroughputPerS, rep.DurationMS,
		string(acc), string(body), rep.CompletedAt,
	)
	return err
}

func (s *Store) GetCloseRun(ctx context.Context, tenantID, id string) (Report, error) {
	if s == nil || s.DB == nil {
		return Report{}, sql.ErrNoRows
	}
	var raw []byte
	err := s.DB.QueryRowContext(ctx, `
		SELECT report FROM finance_close_runs WHERE tenant_id=$1 AND id=$2`, tenantID, id).Scan(&raw)
	if err != nil {
		return Report{}, err
	}
	var rep Report
	if err := json.Unmarshal(raw, &rep); err != nil {
		return Report{}, err
	}
	return rep, nil
}
