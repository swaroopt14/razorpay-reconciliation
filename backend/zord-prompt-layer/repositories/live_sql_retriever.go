package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

var uuidRegex = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var batchHintRe = regexp.MustCompile(`(?i)\bbatch(?:_id| id)?\s*[:=]?\s*([A-Za-z0-9._:-]+)\b`)

type LiveSQLRetriever struct {
	edgeDB         *sql.DB
	intentDB       *sql.DB
	relayDB        *sql.DB
	intelligenceDB *sql.DB
	evidenceDB     *sql.DB
	outcomeDB      *sql.DB
	timeout        time.Duration
}

func NewLiveSQLRetriever(edgeDB, intentDB, relayDB, intelligenceDB, evidenceDB, outcomeDB *sql.DB) *LiveSQLRetriever {
	return &LiveSQLRetriever{
		edgeDB:         edgeDB,
		intentDB:       intentDB,
		relayDB:        relayDB,
		intelligenceDB: intelligenceDB,
		outcomeDB:      outcomeDB,
		evidenceDB:     evidenceDB,
		timeout:        4 * time.Second,
	}
}
func isFailureQuery(q string) bool {
	s := strings.ToLower(q)
	return strings.Contains(s, "fail") ||
		strings.Contains(s, "failed") ||
		strings.Contains(s, "failure") ||
		strings.Contains(s, "error") ||
		strings.Contains(s, "dlq")
}
func isBatchQuery(q string) bool {
	s := strings.ToLower(q)
	return strings.Contains(s, "batch") || strings.Contains(s, "csv") || strings.Contains(s, "upload")
}

func isDuplicateProtectionQuery(q string) bool {
	s := strings.ToLower(q)
	hints := []string{
		"idempotency",
		"duplicate",
		"duplicated",
		"same payment twice",
		"sent twice",
		"replay",
		"conflict",
	}
	for _, h := range hints {
		if strings.Contains(s, h) {
			return true
		}
	}
	return false
}

func extractBatchHint(q string) string {
	m := batchHintRe.FindStringSubmatch(q)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}
func (r *LiveSQLRetriever) Retrieve(req dto.QueryRequest, intentID, traceID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	tenantID := ""
	effectiveTopK := topK
	if effectiveTopK <= 0 {
		effectiveTopK = 5
	}
	if isBatchQuery(req.Query) && effectiveTopK < 25 {
		effectiveTopK = 25
	}
	if strings.TrimSpace(req.TenantID) != "" {
		resolved, err := r.resolveTenantID(req.TenantID)
		if err != nil {
			return nil, err
		}
		tenantID = resolved
		// If tenant was provided but not found, return empty evidence.
		if tenantID == "" || !uuidRegex.MatchString(tenantID) {
			return []model.RetrievedChunk{}, nil
		}
	}

	failureOnly := isFailureQuery(req.Query)
	includeDuplicateSignals := isDuplicateProtectionQuery(req.Query)
	chunks := make([]model.RetrievedChunk, 0, effectiveTopK*4)

	if r.edgeDB != nil {
		if c, err := r.fetchFromEdge(tenantID, traceID, effectiveTopK, failureOnly, scope, includeDuplicateSignals); err == nil {
			chunks = append(chunks, c...)
		}

	}
	if r.intentDB != nil {
		if c, err := r.fetchFromIntent(tenantID, intentID, traceID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
		if d, err := r.fetchFromIntentDLQ(tenantID, effectiveTopK, scope); err == nil {
			chunks = append(chunks, d...)
		}
		if b, err := r.fetchBatchIntentSummary(tenantID, req.Query, scope); err == nil {
			chunks = append(chunks, b...)
		}
	}
	if r.relayDB != nil {
		if c, err := r.fetchFromRelay(tenantID, intentID, traceID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}

	if r.intelligenceDB != nil {
		if c, err := r.fetchFromIntelligence(tenantID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}
	if r.outcomeDB != nil {
		if c, err := r.fetchFromOutcome(tenantID, effectiveTopK, scope); err == nil {
			chunks = append(chunks, c...)
		} else {
			log.Printf("[prompt-layer][outcome-db] retrieval failed tenant=%s err=%v", tenantID, err)
		}
	}
	if r.evidenceDB != nil {
		if c, err := r.fetchFromEvidence(req, tenantID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}

	finalTopK := topK
	if finalTopK <= 0 {
		finalTopK = 5
	}
	if isBatchQuery(req.Query) && finalTopK < 20 {
		finalTopK = 20
	}
	chunks = rankAndTrimBalanced(chunks, finalTopK)
	return chunks, nil

}

func (r *LiveSQLRetriever) resolveTenantID(input string) (string, error) {
	if uuidRegex.MatchString(input) {
		return strings.ToLower(input), nil
	}
	if r.edgeDB == nil {
		return "", nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	var tenantID string
	err := r.edgeDB.QueryRowContext(ctx, `
		SELECT tenant_id::text
		FROM tenants
		WHERE tenant_name = $1
		LIMIT 1
	`, input).Scan(&tenantID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("tenant resolution failed: %w", err)
	}
	return strings.ToLower(tenantID), nil
}
func (r *LiveSQLRetriever) ListVectorIndexTenantIDs(ctx context.Context, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 100
	}

	seen := map[string]struct{}{}
	out := make([]string, 0, limit)

	collect := func(db *sql.DB, label string, query string) {
		if db == nil || len(out) >= limit {
			return
		}

		rows, err := db.QueryContext(ctx, query, limit)
		if err != nil {
			log.Printf("[prompt-layer][vector-index] tenant scan failed source=%s err=%v", label, err)
			return
		}
		defer rows.Close()

		for rows.Next() {
			if len(out) >= limit {
				return
			}

			var tenantID string
			if err := rows.Scan(&tenantID); err != nil {
				log.Printf("[prompt-layer][vector-index] tenant scan row failed source=%s err=%v", label, err)
				continue
			}

			tenantID = strings.ToLower(strings.TrimSpace(tenantID))
			if tenantID == "" || !uuidRegex.MatchString(tenantID) {
				continue
			}
			if _, ok := seen[tenantID]; ok {
				continue
			}

			seen[tenantID] = struct{}{}
			out = append(out, tenantID)
		}
	}

	collect(r.edgeDB, "edge.tenants", `
		SELECT DISTINCT tenant_id::text
		FROM tenants
		WHERE tenant_id IS NOT NULL
		LIMIT $1
	`)

	collect(r.intentDB, "intent.payment_intents", `
		SELECT DISTINCT tenant_id::text
		FROM payment_intents
		WHERE tenant_id IS NOT NULL
		LIMIT $1
	`)

	collect(r.outcomeDB, "outcome.batch_attachment_summaries", `
		SELECT DISTINCT tenant_id::text
		FROM batch_attachment_summaries
		WHERE tenant_id IS NOT NULL
		LIMIT $1
	`)

	collect(r.intelligenceDB, "intelligence.intelligence_snapshots", `
		SELECT DISTINCT tenant_id
		FROM intelligence_snapshots
		WHERE tenant_id IS NOT NULL
		LIMIT $1
	`)

	collect(r.evidenceDB, "evidence.evidence_packs", `
		SELECT DISTINCT tenant_id
		FROM evidence_packs
		WHERE tenant_id IS NOT NULL
		LIMIT $1
	`)

	return out, nil
}
