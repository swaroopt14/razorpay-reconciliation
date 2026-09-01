package poll

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

const (
	FreshnessAPIAndWebhook       = "api_and_webhook_present"
	FreshnessAPIOnly             = "api_only_missing_webhook"
	FreshnessWebhookOnly         = "webhook_only_missing_api"
	FreshnessPayloadChanged      = "both_present_payload_changed"
	FreshnessAPIDelayed          = "api_delayed"
	FreshnessAPIFailedUnknown    = "api_failed_unknown"
)

type WebhookReceiptRef struct {
	ProviderEntityID string `json:"provider_entity_id"`
	EventID          string `json:"event_id"`
	EventType        string `json:"event_type"`
	ReceivedAt       time.Time `json:"received_at"`
	RawBodyHash      string `json:"raw_body_hash,omitempty"`
}

type FreshnessRecord struct {
	ProviderEntityID string `json:"provider_entity_id"`
	State            string `json:"state"`
}

type FreshnessReport struct {
	JobID                   string    `json:"job_id"`
	WindowFrom              time.Time `json:"window_from"`
	WindowTo                time.Time `json:"window_to"`
	APIRecords              int       `json:"api_records"`
	WebhookRecords          int       `json:"webhook_records"`
	MatchedRecords          int       `json:"matched_records"`
	APIOnlyMissingWebhook   int       `json:"api_only_missing_webhook"`
	WebhookOnlyMissingAPI   int       `json:"webhook_only_missing_api"`
	PayloadConflicts        int       `json:"payload_conflicts"`
	FreshnessTimestamp      time.Time `json:"freshness_timestamp"`
	Records                 []FreshnessRecord `json:"records,omitempty"`
}

type FreshnessService struct {
	Store Store
	Index WebhookIndex
	now   func() time.Time
}

func NewFreshnessService(store Store, index WebhookIndex) *FreshnessService {
	return &FreshnessService{
		Store: store,
		Index: index,
		now:   func() time.Time { return time.Now().UTC() },
	}
}

func (s *FreshnessService) CompareWindow(ctx context.Context, tenantID, connectorID string, window TimeWindow) (FreshnessReport, error) {
	report := FreshnessReport{
		WindowFrom:         window.From,
		WindowTo:           window.To,
		FreshnessTimestamp: s.now(),
	}
	if s == nil || s.Store == nil || s.Index == nil {
		return report, fmt.Errorf("freshness service not configured")
	}

	apiIDs, err := s.Store.ListPaymentIDsInWindow(ctx, tenantID, connectorID, window.From, window.To)
	if err != nil {
		return report, err
	}
	webhooks, err := s.Index.ListReceipts(ctx, tenantID, connectorID, window.From, window.To)
	if err != nil {
		return report, err
	}

	apiSet := map[string]struct{}{}
	for _, id := range apiIDs {
		if id == "" {
			continue
		}
		apiSet[id] = struct{}{}
	}
	webhookSet := map[string]struct{}{}
	webhookHash := map[string]string{}
	for _, w := range webhooks {
		if w.ProviderEntityID == "" {
			continue
		}
		webhookSet[w.ProviderEntityID] = struct{}{}
		if w.RawBodyHash != "" {
			webhookHash[w.ProviderEntityID] = w.RawBodyHash
		}
	}
	report.APIRecords = len(apiSet)
	report.WebhookRecords = len(webhookSet)

	for id := range apiSet {
		if _, ok := webhookSet[id]; ok {
			apiHash, _, _ := s.Store.GetPaymentHash(ctx, tenantID, connectorID, id)
			if wh, ok := webhookHash[id]; ok && apiHash != "" && wh != apiHash {
				report.PayloadConflicts++
				report.Records = append(report.Records, FreshnessRecord{ProviderEntityID: id, State: FreshnessPayloadChanged})
				continue
			}
			report.MatchedRecords++
			report.Records = append(report.Records, FreshnessRecord{ProviderEntityID: id, State: FreshnessAPIAndWebhook})
		} else {
			report.APIOnlyMissingWebhook++
			report.Records = append(report.Records, FreshnessRecord{ProviderEntityID: id, State: FreshnessAPIOnly})
		}
	}
	for id := range webhookSet {
		if _, ok := apiSet[id]; !ok {
			report.WebhookOnlyMissingAPI++
			report.Records = append(report.Records, FreshnessRecord{ProviderEntityID: id, State: FreshnessWebhookOnly})
		}
	}
	return report, nil
}

func (s *FreshnessService) CompareJob(ctx context.Context, job BackfillJob) (FreshnessReport, error) {
	report, err := s.CompareWindow(ctx, job.TenantID, job.ConnectorID, TimeWindow{From: job.WindowFrom, To: job.WindowTo})
	if err != nil {
		return report, err
	}
	report.JobID = job.ID
	return report, nil
}

// MemoryWebhookIndex is a test double.
type MemoryWebhookIndex struct {
	Receipts []WebhookReceiptRef
}

func (m MemoryWebhookIndex) ListReceipts(_ context.Context, _, _ string, from, to time.Time) ([]WebhookReceiptRef, error) {
	var out []WebhookReceiptRef
	for _, r := range m.Receipts {
		if (r.ReceivedAt.Equal(from) || r.ReceivedAt.After(from)) && r.ReceivedAt.Before(to) {
			out = append(out, r)
		}
	}
	return out, nil
}

type EdgeReceiptClient struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

func NewEdgeReceiptClient(baseURL, token string) *EdgeReceiptClient {
	return &EdgeReceiptClient{
		BaseURL:    baseURL,
		Token:      token,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *EdgeReceiptClient) ListReceipts(ctx context.Context, tenantID, connectorID string, from, to time.Time) ([]WebhookReceiptRef, error) {
	if c == nil || c.BaseURL == "" {
		return nil, fmt.Errorf("edge receipt client not configured")
	}
	u, err := url.Parse(c.BaseURL + "/internal/webhooks/receipts/index")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("tenant_id", tenantID)
	q.Set("connector_id", connectorID)
	q.Set("from", from.UTC().Format(time.RFC3339))
	q.Set("to", to.UTC().Format(time.RFC3339))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	token := c.Token
	if token == "" {
		token = os.Getenv("RELAY_AUTH_TOKEN")
	}
	req.Header.Set("X-Relay-Token", token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("edge receipt index HTTP %d", resp.StatusCode)
	}
	var parsed struct {
		Receipts []WebhookReceiptRef `json:"receipts"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return parsed.Receipts, nil
}
