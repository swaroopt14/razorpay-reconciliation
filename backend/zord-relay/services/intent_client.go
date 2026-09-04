package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	"zord-relay/model"
)

// IntentClientIface is the interface the dispatch loop depends on.
// This allows tests to inject a fake without starting a real HTTP server.
type IntentClientIface interface {
	Lease(ctx context.Context, limit, leaseTTLSeconds int) (*LeaseResponse, error)
	Ack(ctx context.Context, leaseID string, eventIDs []string) error
	Nack(ctx context.Context, leaseID string, eventIDs []string) error
}

// IntentClient calls Service 2's internal outbox lease API.
// It is the only point of contact between Service 4 and Service 2.
// Service 4 never reads Service 2's database directly.
type IntentClient struct {
	baseURL    string
	instanceID string // sent as X-Relay-Instance-ID header on every lease call
	http       *http.Client
}

// LeaseResponse is the response from GET /internal/outbox/lease.
type LeaseResponse struct {
	LeaseID    string             `json:"lease_id"`
	LeaseUntil *time.Time         `json:"lease_until,omitempty"`
	Events     []model.OutboxEvent `json:"events"`
}

type ackNackRequest struct {
	LeaseID  string   `json:"lease_id"`
	EventIDs []string `json:"event_ids"`
}

type ackNackResponse struct {
	Updated int64 `json:"updated"`
}

func NewIntentClient(baseURL, instanceID string, timeoutSecs int) *IntentClient {
	return &IntentClient{
		baseURL:    baseURL,
		instanceID: instanceID,
		http: &http.Client{
			Timeout: time.Duration(timeoutSecs) * time.Second,
		},
	}
}

// Lease fetches up to `limit` events from Service 2's outbox.
// Returns nil, nil when the outbox is empty (not an error — just no work).
func (c *IntentClient) Lease(ctx context.Context, limit, leaseTTLSeconds int) (*LeaseResponse, error) {
	url := fmt.Sprintf("%s/internal/outbox/lease?limit=%d&lease_ttl_seconds=%d", c.baseURL, limit, leaseTTLSeconds)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("intent_client: build lease request: %w", err)
	}
	req.Header.Set("X-Relay-Instance-ID", c.instanceID)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("intent_client: lease request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("intent_client: lease returned HTTP %d", resp.StatusCode)
	}

	var lease LeaseResponse
	if err := json.NewDecoder(resp.Body).Decode(&lease); err != nil {
		return nil, fmt.Errorf("intent_client: decode lease response: %w", err)
	}

	return &lease, nil
}

// Ack marks a batch of events as successfully processed in Service 2's outbox.
// Must be called after ProviderAcked is written and committed.
func (c *IntentClient) Ack(ctx context.Context, leaseID string, eventIDs []string) error {
	return c.postAckNack(ctx, "/internal/outbox/ack", leaseID, eventIDs)
}

// Nack returns a batch of events to Service 2's outbox for retry.
// Must be called on any failure before ProviderAcked is committed.
func (c *IntentClient) Nack(ctx context.Context, leaseID string, eventIDs []string) error {
	return c.postAckNack(ctx, "/internal/outbox/nack", leaseID, eventIDs)
}

func (c *IntentClient) postAckNack(ctx context.Context, path, leaseID string, eventIDs []string) error {
	if len(eventIDs) == 0 {
		return nil
	}

	body, err := json.Marshal(ackNackRequest{LeaseID: leaseID, EventIDs: eventIDs})
	if err != nil {
		return fmt.Errorf("intent_client: marshal %s body: %w", path, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("intent_client: build %s request: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Relay-Instance-ID", c.instanceID)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("intent_client: %s request failed: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("intent_client: %s returned HTTP %d", path, resp.StatusCode)
	}
	return nil
}