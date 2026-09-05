package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"zord-relay/model"
)

type BatchClient struct {
	serviceName string
	baseURL     string
	authToken   string
	instanceID  string
	http        *http.Client
	log         *zap.Logger
	tracer      trace.Tracer
}

func NewBatchClient(
	serviceName, baseURL, authToken, instanceID string,
	timeout time.Duration,
	log *zap.Logger,
) *BatchClient {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	baseURL = strings.TrimSpace(baseURL)
	baseURL = strings.Trim(baseURL, "\"`'")

	return &BatchClient{
		serviceName: serviceName,
		baseURL:     baseURL,
		authToken:   authToken,
		instanceID:  instanceID,
		http: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		log:    log.With(zap.String("upstream_service", serviceName)),
		tracer: otel.Tracer("zord-relay/client"),
	}
}

func (c *BatchClient) Lease(
	ctx context.Context,
	limit int,
	leaseTTLSeconds int,
) (*model.BatchLeaseResponse, error) {
	ctx, span := c.tracer.Start(ctx, "batch.lease",
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(
			semconv.HTTPMethod("GET"),
			attribute.String("upstream.service", c.serviceName),
			attribute.Int("lease.limit", limit),
		),
	)
	defer span.End()

	u, err := url.Parse(c.baseURL + "/internal/relay/canonical_batches/lease")
	if err != nil {
		return nil, fmt.Errorf("parsing lease URL: %w", err)
	}
	q := u.Query()
	q.Set("limit", strconv.Itoa(limit))
	q.Set("lease_ttl_seconds", strconv.Itoa(leaseTTLSeconds))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("creating lease request: %w", err)
	}
	c.setHeaders(req)
	otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(req.Header))

	resp, err := c.http.Do(req)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, fmt.Errorf("lease HTTP call failed: %w", err)
	}
	defer resp.Body.Close()

	if err := c.checkStatus(resp, "lease"); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	var leaseResp model.BatchLeaseResponse
	if err := c.decode(resp.Body, &leaseResp); err != nil {
		return nil, fmt.Errorf("decoding lease response: %w", err)
	}

	span.SetAttributes(attribute.Int("lease.events_count", len(leaseResp.Events)))
	return &leaseResp, nil
}

func (c *BatchClient) Ack(ctx context.Context, leaseID string, batchIDs []string) (int64, error) {
	ctx, span := c.tracer.Start(ctx, "batch.ack",
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(
			attribute.String("upstream.service", c.serviceName),
			attribute.String("lease.id", leaseID),
			attribute.Int("ack.count", len(batchIDs)),
		),
	)
	defer span.End()

	updated, err := c.postAckNack(ctx, "/internal/relay/canonical_batches/ack", struct {
		LeaseID  string   `json:"lease_id"`
		BatchIDs []string `json:"batch_ids"`
	}{
		LeaseID:  leaseID,
		BatchIDs: batchIDs,
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return updated, err
}

func (c *BatchClient) Nack(ctx context.Context, leaseID string, batchIDs []string) (int64, error) {
	ctx, span := c.tracer.Start(ctx, "batch.nack",
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(
			attribute.String("upstream.service", c.serviceName),
			attribute.String("lease.id", leaseID),
			attribute.Int("nack.count", len(batchIDs)),
		),
	)
	defer span.End()

	updated, err := c.postAckNack(ctx, "/internal/relay/canonical_batches/nack", struct {
		LeaseID  string   `json:"lease_id"`
		BatchIDs []string `json:"batch_ids"`
	}{
		LeaseID:  leaseID,
		BatchIDs: batchIDs,
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return updated, err
}

func (c *BatchClient) postAckNack(ctx context.Context, path string, body interface{}) (int64, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return 0, fmt.Errorf("marshalling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(b))
	if err != nil {
		return 0, fmt.Errorf("creating request: %w", err)
	}
	c.setHeaders(req)
	req.Header.Set(headerContentType, contentTypeJSON)
	otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(req.Header))

	resp, err := c.http.Do(req)
	if err != nil {
		return 0, fmt.Errorf("%s HTTP call failed: %w", path, err)
	}
	defer resp.Body.Close()

	if err := c.checkStatus(resp, path); err != nil {
		return 0, err
	}

	var result model.AckNackResponse
	if err := c.decode(resp.Body, &result); err != nil {
		return 0, fmt.Errorf("decoding %s response: %w", path, err)
	}

	return result.Updated, nil
}

func (c *BatchClient) setHeaders(req *http.Request) {
	req.Header.Set(headerRelayToken, c.authToken)
	req.Header.Set(headerRelayInstanceID, c.instanceID)
}

func (c *BatchClient) checkStatus(resp *http.Response, op string) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("%s returned HTTP %d: %s", op, resp.StatusCode, string(body))
}

func (c *BatchClient) decode(r io.Reader, v interface{}) error {
	limited := io.LimitReader(r, maxBodyBytes)
	return json.NewDecoder(limited).Decode(v)
}
