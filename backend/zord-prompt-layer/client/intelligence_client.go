package client

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type IntelligenceClient struct {
	BaseURL string
	HTTP    *http.Client
}

type RCAClustersResponse struct {
	TenantID         string            `json:"tenant_id"`
	IntelligenceMode string            `json:"intelligence_mode"`
	SnapshotID       string            `json:"snapshot_id"`
	ModelVersion     *string           `json:"model_version,omitempty"`
	ClusterCount     int               `json:"cluster_count"`
	ClusteredPoints  int               `json:"clustered_points"`
	NoisePoints      int               `json:"noise_points"`
	TotalPoints      int               `json:"total_points"`
	ReturnedClusters int               `json:"returned_clusters"`
	Clusters         []json.RawMessage `json:"clusters"`
	DataAvailable    bool              `json:"data_available"`
	Reason           string            `json:"reason,omitempty"`
}

func NewIntelligenceClient(baseURL string, timeoutSec int) *IntelligenceClient {
	if timeoutSec <= 0 {
		timeoutSec = 3
	}
	return &IntelligenceClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: time.Duration(timeoutSec) * time.Second},
	}
}

func (c *IntelligenceClient) doGetJSON(path string, q url.Values, authorization string, out any) error {
	u := c.BaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	maxRetries := 2

	for attempt := 0; attempt <= maxRetries; attempt++ {
		start := time.Now()
		log.Printf(
			"[prompt-layer][intelligence] GET start path=%s query=%s attempt=%d auth_present=%t",
			path,
			q.Encode(),
			attempt+1,
			strings.TrimSpace(authorization) != "",
		)
		req, err := http.NewRequest(http.MethodGet, u, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Accept", "application/json")
		if strings.TrimSpace(authorization) != "" {
			req.Header.Set("Authorization", strings.TrimSpace(authorization))
		}

		resp, err := c.HTTP.Do(req)
		if err != nil {
			log.Printf("[prompt-layer][intelligence] GET transport_error path=%s attempt=%d err=%v duration_ms=%d",
				path, attempt+1, err, time.Since(start).Milliseconds())
			if attempt < maxRetries {
				time.Sleep(backoff(attempt))
				continue
			}
			return err
		}
		log.Printf("[prompt-layer][intelligence] GET response path=%s status=%d attempt=%d duration_ms=%d auth_present=%t",
			path, resp.StatusCode, attempt+1, time.Since(start).Milliseconds(), strings.TrimSpace(authorization) != "")

		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 300 {
			retriable := resp.StatusCode == http.StatusTooManyRequests ||
				resp.StatusCode == http.StatusServiceUnavailable ||
				resp.StatusCode == http.StatusBadGateway ||
				resp.StatusCode == http.StatusGatewayTimeout
			log.Printf("[prompt-layer][intelligence] GET failed path=%s status=%d retriable=%t attempt=%d body=%s",
				path, resp.StatusCode, retriable, attempt+1, string(raw))
			if retriable && attempt < maxRetries {
				log.Printf("[prompt-layer][intelligence] GET retrying path=%s next_attempt=%d", path, attempt+2)
				time.Sleep(backoff(attempt))
				continue
			}
			return fmt.Errorf("intelligence api error: status=%d body=%s", resp.StatusCode, string(raw))
		}

		if out == nil {
			return nil
		}
		if err := json.Unmarshal(raw, out); err != nil {
			return err
		}
		return nil
	}
	return fmt.Errorf("intelligence api failed after retries")
}

func backoff(attempt int) time.Duration {
	d := 200 * time.Millisecond
	for i := 0; i < attempt; i++ {
		d *= 2
	}
	if d > 2*time.Second {
		d = 2 * time.Second
	}
	return d
}

func (c *IntelligenceClient) FetchRCAClusters(tenantID, authorization string) (*RCAClustersResponse, error) {
	if strings.TrimSpace(tenantID) == "" {
		return nil, nil
	}
	q := url.Values{}
	q.Set("tenant_id", tenantID)

	var out RCAClustersResponse
	if err := c.doGetJSON("/v1/intelligence/rca/clusters", q, authorization, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
