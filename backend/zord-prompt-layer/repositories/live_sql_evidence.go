package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

func (r *LiveSQLRetriever) fetchFromEvidence(req dto.QueryRequest, tenantID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}
	out := make([]model.RetrievedChunk, 0, topK*2)
	batchID := evidenceBatchIDFromRequest(req)

	if batchID != "" {
		var totalPacks, activePacks, proofReadyPacks, intentLevelPacks, batchLevelPacks int
		var firstCreated, lastUpdated sql.NullString

		err := r.evidenceDB.QueryRowContext(ctx, `
			SELECT
				COUNT(*)::int,
				COUNT(*) FILTER (WHERE UPPER(COALESCE(pack_status, '')) = 'ACTIVE')::int,
				COUNT(*) FILTER (WHERE UPPER(COALESCE(proof_status, '')) IN ('PROOF_READY', 'READY', 'VERIFIED', 'PROOF_ASSEMBLED'))::int,
				COUNT(*) FILTER (WHERE intent_id IS NOT NULL)::int,
				COUNT(*) FILTER (WHERE intent_id IS NULL AND batch_id IS NOT NULL)::int,
				MIN(created_at)::text,
				MAX(updated_at)::text
			FROM evidence_packs
			WHERE tenant_id = $1
			  AND batch_id = $2
		`, tenantID, batchID).Scan(
			&totalPacks,
			&activePacks,
			&proofReadyPacks,
			&intentLevelPacks,
			&batchLevelPacks,
			&firstCreated,
			&lastUpdated,
		)
		if err != nil {
			logSafeEvidenceCountError(tenantID, batchID, err)
		} else {
			out = append(out, model.RetrievedChunk{
				SourceType: "evidence_batch_exact_counts",
				Score:      1.0,
				Text: fmt.Sprintf(
					"Evidence batch exact count summary: Batch reference=%s. Total evidence packs generated=%d. Active evidence packs=%d. Proof-ready or assembled evidence packs=%d. Intent-level evidence packs=%d. Batch-level evidence packs=%d. First created=%s. Last updated=%s. Use this SQL aggregate as the source of truth for evidence pack count questions.",
					batchID,
					totalPacks,
					activePacks,
					proofReadyPacks,
					intentLevelPacks,
					batchLevelPacks,
					nullText(firstCreated),
					nullText(lastUpdated),
				),
			})
		}
	}
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

var evidenceBatchRefRe = regexp.MustCompile(`(?i)\bbatch(?:\s*id|\s*reference|\s*ref)?\s*[:#-]?\s*([A-Za-z0-9._-]+)\b`)

func evidenceBatchIDFromRequest(req dto.QueryRequest) string {
	if req.UIContext != nil {
		if s := strings.TrimSpace(req.UIContext.BatchID); s != "" {
			return s
		}
	}

	matches := evidenceBatchRefRe.FindStringSubmatch(req.Query)
	if len(matches) < 2 {
		return ""
	}

	candidate := strings.Trim(matches[1], " .,?;:")
	if !strings.ContainsAny(candidate, "0123456789") {
		return ""
	}
	return candidate
}

func logSafeEvidenceCountError(tenantID, batchID string, err error) {
	if err == sql.ErrNoRows {
		return
	}
	fmt.Printf("[prompt-layer][evidence-db] exact count query failed tenant=%s batch=%s err=%v\n", tenantID, batchID, err)
}
