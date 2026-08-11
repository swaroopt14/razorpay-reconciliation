package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type PineconeClient struct {
	APIKey    string
	Host      string
	Namespace string
	HTTP      *http.Client
}

type PineconeMatch struct {
	ID       string
	Score    float64
	Metadata map[string]any
}
type PineconeVector struct {
	ID       string         `json:"id"`
	Values   []float64      `json:"values"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type pineconeUpsertRequest struct {
	Vectors   []PineconeVector `json:"vectors"`
	Namespace string           `json:"namespace,omitempty"`
}
type pineconeDeleteRequest struct {
	Namespace string         `json:"namespace,omitempty"`
	Filter    map[string]any `json:"filter,omitempty"`
}

type pineconeUpsertResponse struct {
	UpsertedCount int `json:"upsertedCount"`
}
type pineconeQueryRequest struct {
	Vector          []float64      `json:"vector"`
	TopK            int            `json:"topK"`
	IncludeMetadata bool           `json:"includeMetadata"`
	Namespace       string         `json:"namespace,omitempty"`
	Filter          map[string]any `json:"filter,omitempty"`
}

type pineconeQueryResponse struct {
	Matches []struct {
		ID       string         `json:"id"`
		Score    float64        `json:"score"`
		Metadata map[string]any `json:"metadata"`
	} `json:"matches"`
}

func NewPineconeClient(apiKey, host, namespace string, timeoutSeconds int) *PineconeClient {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 10
	}

	return &PineconeClient{
		APIKey:    strings.TrimSpace(apiKey),
		Host:      strings.TrimRight(strings.TrimSpace(host), "/"),
		Namespace: strings.TrimSpace(namespace),
		HTTP: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
	}
}

func (c *PineconeClient) Enabled() bool {
	return c != nil && c.APIKey != "" && c.Host != ""
}

func (c *PineconeClient) Query(ctx context.Context, vector []float64, topK int, tenantID string) ([]PineconeMatch, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("pinecone client not configured")
	}
	if len(vector) == 0 {
		return nil, fmt.Errorf("empty vector")
	}
	if topK <= 0 {
		topK = 5
	}

	body := pineconeQueryRequest{
		Vector:          vector,
		TopK:            topK,
		IncludeMetadata: true,
		Namespace:       c.Namespace,
		Filter: map[string]any{
			"tenant_id": map[string]any{
				"$eq": tenantID,
			},
		},
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Host+"/query", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Api-Key", c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("pinecone query failed: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var out pineconeQueryResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}

	matches := make([]PineconeMatch, 0, len(out.Matches))
	for _, m := range out.Matches {
		matches = append(matches, PineconeMatch{
			ID:       m.ID,
			Score:    m.Score,
			Metadata: m.Metadata,
		})
	}

	return matches, nil
}
func (c *PineconeClient) Upsert(ctx context.Context, vectors []PineconeVector) (int, error) {
	if !c.Enabled() {
		return 0, fmt.Errorf("pinecone client not configured")
	}
	if len(vectors) == 0 {
		return 0, nil
	}

	body := pineconeUpsertRequest{
		Vectors:   vectors,
		Namespace: c.Namespace,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return 0, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Host+"/vectors/upsert", bytes.NewReader(bodyBytes))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Api-Key", c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return 0, fmt.Errorf("pinecone upsert failed: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var out pineconeUpsertResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return 0, err
	}

	return out.UpsertedCount, nil
}
func (c *PineconeClient) DeleteByFilter(ctx context.Context, filter map[string]any) error {
	if !c.Enabled() {
		return fmt.Errorf("pinecone client not configured")
	}
	if len(filter) == 0 {
		return fmt.Errorf("pinecone delete filter is required")
	}

	body := pineconeDeleteRequest{
		Namespace: c.Namespace,
		Filter:    filter,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Host+"/vectors/delete", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Api-Key", c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("pinecone delete failed: status=%d body=%s", resp.StatusCode, string(raw))
	}

	return nil
}
