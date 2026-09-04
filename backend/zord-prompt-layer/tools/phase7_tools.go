package tools

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func (c *OutcomeClient) evidenceConfigured() bool {
	return c != nil && strings.TrimSpace(c.EvidenceBaseURL) != ""
}

func noneEvidence(tool string) map[string]any {
	return map[string]any{
		"tool":    tool,
		"error":   "none",
		"message": "No finance evidence was returned. Do not invent evidence IDs, bank rows, or a pack.",
	}
}

func (c *OutcomeClient) evidenceDo(method, path string, q url.Values) (map[string]any, error) {
	if !c.evidenceConfigured() {
		return noneEvidence(path), nil
	}
	u := c.EvidenceBaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	var body io.Reader
	if method == http.MethodPost {
		body = bytes.NewReader([]byte("{}"))
	}
	req, err := http.NewRequest(method, u, body)
	if err != nil {
		return noneEvidence(path), nil
	}
	if c.EvidenceInternalKey != "" {
		req.Header.Set("X-Internal-Key", c.EvidenceInternalKey)
	} else if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return noneEvidence(path), nil
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return noneEvidence(path), nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return noneEvidence(path), nil
	}
	return out, nil
}

func evidenceTenantQ(tenantID string) url.Values {
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	return q
}

func (c *OutcomeClient) ListFinanceEvidence(tenantID, entityType, entityID string) (map[string]any, error) {
	if entityType == "" {
		entityType = entityTypeFromID(entityID)
	}
	return c.evidenceDo(http.MethodGet, "/internal/finance-evidence/entities/"+entityType+"/"+entityID, evidenceTenantQ(tenantID))
}

func (c *OutcomeClient) GetEvidencePack(tenantID, investigationID string) (map[string]any, error) {
	if investigationID == "" {
		return noneEvidence(GetEvidencePack), nil
	}
	return c.evidenceDo(http.MethodGet, "/internal/finance-evidence/packs/"+investigationID, evidenceTenantQ(tenantID))
}

func (c *OutcomeClient) GetDecisionTrace(tenantID, entityType, entityID string) (map[string]any, error) {
	if entityType == "" {
		entityType = entityTypeFromID(entityID)
	}
	return c.evidenceDo(http.MethodGet, "/internal/finance-evidence/entities/"+entityType+"/"+entityID+"/decisions", evidenceTenantQ(tenantID))
}

func (c *OutcomeClient) GetCalculationTrace(tenantID, entityType, entityID string) (map[string]any, error) {
	if entityType == "" {
		entityType = entityTypeFromID(entityID)
	}
	return c.evidenceDo(http.MethodGet, "/internal/finance-evidence/entities/"+entityType+"/"+entityID+"/calculations", evidenceTenantQ(tenantID))
}

func (c *OutcomeClient) GetAuditTrail(tenantID, entityType, entityID string) (map[string]any, error) {
	if entityType == "" {
		entityType = entityTypeFromID(entityID)
	}
	return c.evidenceDo(http.MethodGet, "/internal/finance-evidence/entities/"+entityType+"/"+entityID+"/audit", evidenceTenantQ(tenantID))
}

func (c *OutcomeClient) VerifyEvidence(tenantID, evidenceID string) (map[string]any, error) {
	if evidenceID == "" {
		return noneEvidence(VerifyEvidenceTool), nil
	}
	return c.evidenceDo(http.MethodPost, "/internal/finance-evidence/items/"+evidenceID+"/verify", evidenceTenantQ(tenantID))
}

func (c *OutcomeClient) GetSourceSnapshot(tenantID, evidenceID string) (map[string]any, error) {
	if evidenceID == "" {
		return noneEvidence(GetSourceSnapshot), nil
	}
	return c.evidenceDo(http.MethodGet, "/internal/finance-evidence/items/"+evidenceID, evidenceTenantQ(tenantID))
}

func CollectFinanceEvidenceIDs(body map[string]any) []string {
	if body == nil {
		return nil
	}
	out := stringSlice(body, "evidence_ids")
	if raw, ok := body["evidence"].([]any); ok {
		for _, item := range raw {
			m, _ := item.(map[string]any)
			if id := stringField(m, "evidence_id"); id != "" {
				out = appendUnique(out, id)
			}
			if id := stringField(m, "id"); id != "" && strings.HasPrefix(id, "ev_") {
				out = appendUnique(out, id)
			}
		}
	}
	if doc, ok := body["document"].(map[string]any); ok {
		if src, ok := doc["source_evidence"].([]any); ok {
			for _, item := range src {
				m, _ := item.(map[string]any)
				if id := stringField(m, "evidence_id"); id != "" {
					out = appendUnique(out, id)
				}
			}
		}
	}
	return out
}

func FinanceEvidenceNone(body map[string]any) bool {
	if body == nil {
		return true
	}
	if err, _ := body["error"].(string); err == "none" || err == "not_found" {
		return true
	}
	return false
}

func StructuredCalcVariance(body map[string]any) (int64, bool) {
	if body == nil {
		return 0, false
	}
	if raw, ok := body["calculations"].([]any); ok && len(raw) > 0 {
		last, _ := raw[len(raw)-1].(map[string]any)
		if last != nil {
			return intField(last, "variance"), true
		}
	}
	return 0, false
}
