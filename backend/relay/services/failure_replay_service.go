package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"zord-relay/metrics"

	"github.com/IBM/sarama"
	"go.uber.org/zap"
)

// FailureReplayService handles controlled replay of failed publish attempts
type FailureReplayService struct {
	failureRepo   *PublishFailureRepo
	kafkaProducer sarama.SyncProducer
	log           *zap.Logger
}

func NewFailureReplayService(failureRepo *PublishFailureRepo, producer sarama.SyncProducer, log *zap.Logger) *FailureReplayService {
	return &FailureReplayService{
		failureRepo:   failureRepo,
		kafkaProducer: producer,
		log:           log.With(zap.String("component", "failure_replay_service")),
	}
}

// Replay attempts to republish a previously failed event
func (s *FailureReplayService) Replay(ctx context.Context, failureID int64, operatorID, reason string) error {
	// 1. Begin replay - optimistic lock
	started, err := s.failureRepo.BeginReplay(ctx, failureID)
	if err != nil {
		return fmt.Errorf("begin replay: %w", err)
	}
	if !started {
		// Already replayed or in progress
		return ErrAlreadyReplayed
	}

	// 2. Load message bytes and verify hash
	key, value, headers, destTopic, expectedHash, err := s.failureRepo.GetMessageForReplay(ctx, failureID)
	if err != nil {
		// Revert to PENDING on failure to load
		s.failureRepo.CompleteReplay(ctx, failureID, operatorID, reason, "FAILED", err.Error())
		return fmt.Errorf("get message for replay: %w", err)
	}

	// Verify hash
	sum := sha256.Sum256(value)
	actualHash := hex.EncodeToString(sum[:])
	if actualHash != expectedHash {
		errMsg := fmt.Sprintf("hash mismatch: expected %s, got %s", expectedHash, actualHash)
		s.failureRepo.CompleteReplay(ctx, failureID, operatorID, reason, "FAILED", errMsg)
		return ErrHashMismatch
	}

	// 3. Publish to Kafka
	msg := &sarama.ProducerMessage{
		Topic:   destTopic,
		Key:     sarama.StringEncoder(key),
		Value:   sarama.ByteEncoder(value),
		Headers: nil,
	}

	// Parse headers from JSON
	if len(headers) > 0 {
		var headerMap map[string]string
		if err := json.Unmarshal(headers, &headerMap); err == nil {
			for k, v := range headerMap {
				msg.Headers = append(msg.Headers, sarama.RecordHeader{Key: []byte(k), Value: []byte(v)})
			}
		}
	}

	partition, offset, err := s.kafkaProducer.SendMessage(msg)
	if err != nil {
		s.failureRepo.CompleteReplay(ctx, failureID, operatorID, reason, "FAILED", err.Error())
		s.log.Error("replay publish failed",
			zap.Int64("failure_id", failureID),
			zap.String("operator", operatorID),
			zap.Error(err),
		)
		metrics.ReplayTotal.WithLabelValues("FAILED").Inc()
		return fmt.Errorf("kafka publish: %w", err)
	}

	// 4. Complete replay with success
	if err := s.failureRepo.CompleteReplay(ctx, failureID, operatorID, reason, "SUCCESS", ""); err != nil {
		s.log.Error("replay complete failed",
			zap.Int64("failure_id", failureID),
			zap.Error(err),
		)
		return fmt.Errorf("complete replay: %w", err)
	}

	s.log.Info("replay succeeded",
		zap.Int64("failure_id", failureID),
		zap.String("operator", operatorID),
		zap.String("topic", destTopic),
		zap.Int32("partition", partition),
		zap.Int64("offset", offset),
	)
	metrics.ReplayTotal.WithLabelValues("SUCCESS").Inc()
	return nil
}

var (
	ErrAlreadyReplayed = fmt.Errorf("failure already replayed or in progress")
)
