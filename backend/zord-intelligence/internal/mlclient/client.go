package mlclient

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
)

const defaultTimeout = 5 * time.Second

// Client provides synchronous ML invocations over a Kafka request-reply pair.
//
// Usage:
//
//	c := mlclient.New(brokers, requestTopic, resultTopic, groupIDPrefix)
//	c.Start(ctx)   // starts background result consumer
//	defer c.Close()
//
//	result, err := c.InvokeIsolationForest(ctx, req)
//
// If the Python ML service does not respond within 5 seconds, Invoke* returns
// a safe fallback value — Go business logic is never blocked.
type Client struct {
	requestTopic string
	writer       *kafka.Writer
	reader       *kafka.Reader
	pending      map[string]chan MLResult
	mu           sync.Mutex
	done         chan struct{}
	// asyncSem caps concurrent background ML goroutines to prevent unbounded growth under burst.
	asyncSem chan struct{}
}

// New creates a Client.  groupIDPrefix is used to derive a unique consumer group
// so this instance receives ALL messages from the result topic (not round-robined
// with other instances).  Call Start before any Invoke* calls.
func New(brokers, requestTopic, resultTopic, groupIDPrefix string) *Client {
	// Each process gets its own consumer group so it sees every result message.
	// Results for other pending event IDs are discarded cheaply via the map check.
	resultGroupID := groupIDPrefix + "-mlresult-" + uuid.NewString()[:8]
	brokerList := strings.Split(brokers, ",")
	for i := range brokerList {
		brokerList[i] = strings.TrimSpace(brokerList[i])
	}

	writer := &kafka.Writer{
		Addr:         kafka.TCP(brokerList...),
		Balancer:     &kafka.LeastBytes{},
		RequiredAcks: kafka.RequireAll,
		Async:        false,
	}
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokerList,
		GroupID:        resultGroupID,
		Topic:          resultTopic,
		CommitInterval: time.Second,
		MaxWait:        3 * time.Second,
	})

	return &Client{
		requestTopic: requestTopic,
		writer:       writer,
		reader:       reader,
		pending:      make(map[string]chan MLResult),
		done:         make(chan struct{}),
		asyncSem:     make(chan struct{}, 100),
	}
}

// Start launches the background result consumer goroutine.  Must be called once.
func (c *Client) Start(ctx context.Context) {
	go c.consumeResults(ctx)
	log.Println("mlclient: result consumer started")
}

// Close shuts down the writer and reader.  Safe to call multiple times.
func (c *Client) Close() {
	select {
	case <-c.done:
	default:
		close(c.done)
	}
	_ = c.writer.Close()
	_ = c.reader.Close()
}

// InvokeIsolationForest sends an IF scoring request and blocks until a result
// arrives or the default timeout elapses.  On timeout/error returns FallbackIFResult.
func (c *Client) InvokeIsolationForest(ctx context.Context, req IFRequest) (IFResult, error) {
	payload := map[string]interface{}{
		"features": map[string]interface{}{
			"ambiguity_rate":   req.AmbiguityRate,
			"variance_rate":    req.VarianceRate,
			"settlement_ratio": req.SettlementRatio,
			"unresolved_ratio": req.UnresolvedRatio,
			"missing_ref_rate": req.MissingRefRate,
		},
		"history": req.History,
	}

	result, err := c.roundTrip(ctx, EventIFScore, req.TenantID, payload)
	if err != nil {
		log.Printf("mlclient: InvokeIsolationForest failed tenant=%s: %v", req.TenantID, err)
		return FallbackIFResult(), err
	}

	score, _ := result.ModelOutputs["score"].(float64)
	level, _ := result.ModelOutputs["level"].(string)
	anomalyType, _ := result.ModelOutputs["anomaly_type"].(string)
	if level == "" {
		level = "LOW"
	}
	return IFResult{Score: score, Level: level, AnomalyType: anomalyType}, nil
}

// InvokeZScore sends a Z-score request and blocks until a result arrives.
// On timeout/error returns FallbackZScoreResult.
func (c *Client) InvokeZScore(ctx context.Context, req ZScoreRequest) (ZScoreResult, error) {
	payload := map[string]interface{}{
		"current_value": req.CurrentValue,
		"history":       req.History,
	}

	result, err := c.roundTrip(ctx, EventZScore, req.TenantID, payload)
	if err != nil {
		log.Printf("mlclient: InvokeZScore failed tenant=%s: %v", req.TenantID, err)
		return FallbackZScoreResult(), err
	}

	score, _ := result.ModelOutputs["score"].(float64)
	level, _ := result.ModelOutputs["level"].(string)
	zScore, _ := result.ModelOutputs["z_score"].(float64)
	mean, _ := result.ModelOutputs["mean"].(float64)
	stdDev, _ := result.ModelOutputs["std_dev"].(float64)
	if level == "" {
		level = "INSUFFICIENT_DATA"
	}
	return ZScoreResult{Score: score, Level: level, ZScore: zScore, Mean: mean, StdDev: stdDev}, nil
}

// InvokeLogisticRegression sends an LR predict request and blocks until a result.
// On timeout/error returns FallbackLRResult.
func (c *Client) InvokeLogisticRegression(ctx context.Context, req LRRequest) (LRResult, error) {
	payload := map[string]interface{}{
		"features": map[string]interface{}{
			"ambiguity_rate":            req.AmbiguityRate,
			"provider_ref_missing_rate": req.ProviderRefMissingRate,
			"avg_confidence":            req.AvgConfidence,
			"value_at_risk_minor":       req.ValueAtRiskMinor,
			"total_intended_minor":      req.TotalIntendedMinor,
		},
	}

	result, err := c.roundTrip(ctx, EventLRPredict, req.TenantID, payload)
	if err != nil {
		log.Printf("mlclient: InvokeLogisticRegression failed tenant=%s: %v", req.TenantID, err)
		return FallbackLRResult(), err
	}

	prob, _ := result.ModelOutputs["probability"].(float64)
	level, _ := result.ModelOutputs["level"].(string)
	if level == "" {
		level = "LOW"
	}
	return LRResult{Probability: prob, Level: level}, nil
}

// InvokeRCAClustering sends payment candidates to the Python service for HDBSCAN
// clustering and blocks until a result arrives or the default timeout elapses.
// On timeout/error returns FallbackRCAResult — business logic is never blocked.
func (c *Client) InvokeRCAClustering(ctx context.Context, req RCARequest) (RCAClusterResult, error) {
	payload := map[string]interface{}{
		"candidates":               req.Candidates,
		"batch_id":                 req.BatchID,
		"feature_contract_version": req.FeatureContractVersion,
		"finality_label":           req.FinalityLabel,
	}

	result, err := c.roundTrip(ctx, EventRCACluster, req.TenantID, payload)
	if err != nil {
		log.Printf("mlclient: InvokeRCAClustering failed tenant=%s batch=%s: %v",
			req.TenantID, req.BatchID, err)
		return FallbackRCAResult(), err
	}

	// model_outputs is the full RCAClusterResult dict — marshal then unmarshal
	// into the typed struct so we get proper type safety without manual field extraction.
	raw, err := json.Marshal(result.ModelOutputs)
	if err != nil {
		log.Printf("mlclient: InvokeRCAClustering marshal outputs tenant=%s: %v", req.TenantID, err)
		return FallbackRCAResult(), err
	}
	var clusterResult RCAClusterResult
	if err := json.Unmarshal(raw, &clusterResult); err != nil {
		log.Printf("mlclient: InvokeRCAClustering unmarshal tenant=%s: %v", req.TenantID, err)
		return FallbackRCAResult(), err
	}
	return clusterResult, nil
}

// InvokeLeakagePrediction sends a batch-level leakage regression request and
// blocks until a result arrives. On timeout/error returns FallbackLeakagePredictionResult.
func (c *Client) InvokeLeakagePrediction(
	ctx context.Context,
	req LeakagePredictionRequest,
) (LeakagePredictionResult, error) {
	payload := map[string]interface{}{
		"batch_id": req.BatchID,
		"features": req.Features,
	}
	result, err := c.roundTrip(ctx, EventLeakagePredict, req.TenantID, payload)
	if err != nil {
		log.Printf("mlclient: InvokeLeakagePrediction failed tenant=%s batch=%s: %v",
			req.TenantID, req.BatchID, err)
		return FallbackLeakagePredictionResult(), err
	}

	rate, _ := result.ModelOutputs["predicted_leakage_rate"].(float64)
	amount, _ := result.ModelOutputs["predicted_leakage_minor"].(float64)
	riskTier, _ := result.ModelOutputs["risk_tier"].(string)
	modelReady, _ := result.ModelOutputs["model_ready"].(bool)
	status, _ := result.ModelOutputs["status"].(string)
	trainingRowCount := 0
	if rawCount, ok := result.ModelOutputs["training_row_count"].(float64); ok {
		trainingRowCount = int(rawCount)
	}
	minTrainingRows := 0
	if rawCount, ok := result.ModelOutputs["min_training_rows"].(float64); ok {
		minTrainingRows = int(rawCount)
	}
	fallbackFeatureCount := 0
	if rawCount, ok := result.ModelOutputs["fallback_feature_count"].(float64); ok {
		fallbackFeatureCount = int(rawCount)
	}
	fallbackSegmentLevel, _ := result.ModelOutputs["fallback_segment_level"].(string)
	fallbackFeatures := make([]string, 0)
	if rawFeatures, ok := result.ModelOutputs["fallback_features"].([]interface{}); ok {
		for _, item := range rawFeatures {
			if text, ok := item.(string); ok && text != "" {
				fallbackFeatures = append(fallbackFeatures, text)
			}
		}
	}
	if modelReady && riskTier == "" {
		riskTier = "LOW"
	}
	return LeakagePredictionResult{
		PredictedLeakageRate:  rate,
		PredictedLeakageMinor: amount,
		RiskTier:              riskTier,
		ModelReady:            modelReady,
		Status:                status,
		TrainingRowCount:      trainingRowCount,
		MinTrainingRows:       minTrainingRows,
		FallbackFeatureCount:  fallbackFeatureCount,
		FallbackFeatures:      fallbackFeatures,
		FallbackSegmentLevel:  fallbackSegmentLevel,
	}, nil
}

// SendLRTrain publishes a training event to the Python service (fire-and-forget).
// The Go side does not wait for a response.  Errors are logged only.
func (c *Client) SendLRTrain(ctx context.Context, req LRTrainRequest) {
	payload := map[string]interface{}{
		"features":      req.Features,
		"label":         req.Label,
		"learning_rate": req.LearningRate,
	}
	envelope := MLRequest{
		EventID:   uuid.NewString(),
		EventType: EventLRTrain,
		TenantID:  req.TenantID,
		Payload:   payload,
		Timestamp: nowUnix(),
	}
	if err := c.publish(ctx, envelope); err != nil {
		log.Printf("mlclient: SendLRTrain publish failed tenant=%s: %v", req.TenantID, err)
	}
}

// SendLeakageTrain publishes one labeled batch row for background retraining.
func (c *Client) SendLeakageTrain(ctx context.Context, req LeakageTrainRequest) {
	payload := map[string]interface{}{
		"batch_id": req.BatchID,
	}
	envelope := MLRequest{
		EventID:   uuid.NewString(),
		EventType: EventLeakageTrain,
		TenantID:  req.TenantID,
		Payload:   payload,
		Timestamp: nowUnix(),
	}
	if err := c.publish(ctx, envelope); err != nil {
		log.Printf("mlclient: SendLeakageTrain publish failed tenant=%s batch=%s: %v",
			req.TenantID, req.BatchID, err)
	}
}

// ── Internal ──────────────────────────────────────────────────────────────────

func (c *Client) roundTrip(
	ctx context.Context,
	eventType, tenantID string,
	payload map[string]interface{},
) (MLResult, error) {
	eventID := uuid.NewString()

	ch := make(chan MLResult, 1)
	c.mu.Lock()
	c.pending[eventID] = ch
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		delete(c.pending, eventID)
		c.mu.Unlock()
	}()

	envelope := MLRequest{
		EventID:   eventID,
		EventType: eventType,
		TenantID:  tenantID,
		Payload:   payload,
		Timestamp: nowUnix(),
	}
	if err := c.publish(ctx, envelope); err != nil {
		return MLResult{}, fmt.Errorf("publish: %w", err)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, defaultTimeout)
	defer cancel()

	select {
	case result := <-ch:
		if result.Error != "" {
			return result, fmt.Errorf("ml-service returned error: %s", result.Error)
		}
		return result, nil
	case <-timeoutCtx.Done():
		return MLResult{}, fmt.Errorf("timeout waiting for event_id=%s type=%s", eventID, eventType)
	case <-c.done:
		return MLResult{}, fmt.Errorf("client closed")
	}
}

func (c *Client) publish(ctx context.Context, envelope MLRequest) error {
	value, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return c.writer.WriteMessages(ctx, kafka.Message{
		Topic: c.requestTopic,
		Key:   []byte(envelope.TenantID),
		Value: value,
	})
}

func (c *Client) consumeResults(ctx context.Context) {
	for {
		select {
		case <-c.done:
			return
		default:
		}

		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil || isClosedErr(err) {
				return
			}
			log.Printf("mlclient: result consumer read error: %v", err)
			time.Sleep(time.Second)
			continue
		}

		var result MLResult
		if err := json.Unmarshal(msg.Value, &result); err != nil {
			log.Printf("mlclient: unmarshal result error: %v", err)
			continue
		}

		c.mu.Lock()
		ch, ok := c.pending[result.EventID]
		c.mu.Unlock()

		if ok {
			select {
			case ch <- result:
			default:
			}
		}
	}
}

func isClosedErr(err error) bool {
	return err != nil && (err.Error() == "context canceled" ||
		err.Error() == "fetching message: context canceled")
}
