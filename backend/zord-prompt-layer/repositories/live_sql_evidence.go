package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

func (r *LiveSQLRetriever) fetchFromEvidence(tenantID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}
	out := make([]model.RetrievedChunk, 0, topK*2)

	{
		args := []any{}
		q := `
			SELECT mode, pack_status, ruleset_version, signature_alg, replay_equivalence_status, created_at::text, updated_at::text
			FROM evidence_packs
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (pack_status ILIKE '%FAILED%' OR replay_equivalence_status ILIKE '%MISMATCH%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.evidenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("evidence packs retrieval failed: %w", err)
		}
		for rows.Next() {
			var mode, packStatus, rulesetVersion, signatureAlg, replayStatus, createdAt, updatedAt sql.NullString
			if err := rows.Scan(&mode, &packStatus, &rulesetVersion, &signatureAlg, &replayStatus, &createdAt, &updatedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "evidence_packs",
				Score:      0.90,
				Text: fmt.Sprintf(
					"Evidence pack status: mode=%s pack_status=%s ruleset_version=%s signature_algorithm=%s replay_status=%s created_at=%s updated_at=%s",
					nullText(mode), nullText(packStatus), nullText(rulesetVersion), nullText(signatureAlg), nullText(replayStatus), nullText(createdAt), nullText(updatedAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	{
		args := []any{}
		q := `
			SELECT status, ruleset_version, equivalence_result, created_at::text, completed_at::text
			FROM evidence_replay_jobs
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR equivalence_result ILIKE '%MISMATCH%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.evidenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("evidence replay retrieval failed: %w", err)
		}
		for rows.Next() {
			var status, rulesetVersion, equivalence, createdAt, completedAt sql.NullString
			if err := rows.Scan(&status, &rulesetVersion, &equivalence, &createdAt, &completedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "evidence_replay_jobs",
				Score:      0.86,
				Text: fmt.Sprintf(
					"Evidence replay job: status=%s ruleset_version=%s equivalence_result=%s created_at=%s completed_at=%s",
					nullText(status), nullText(rulesetVersion), nullText(equivalence), nullText(createdAt), nullText(completedAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	return out, nil
}
