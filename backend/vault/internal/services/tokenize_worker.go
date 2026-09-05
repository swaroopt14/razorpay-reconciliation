package services

import (
	"context"
	"log"
	"os"

	"zord-token-enclave/internal/models"
	"zord-token-enclave/kafka"
)

type TokenizeWorker struct {
	tokenService *TokenService
	producer     *kafka.Producer
}

func NewTokenizeWorker(
	svc *TokenService,
	producer *kafka.Producer,
) *TokenizeWorker {
	return &TokenizeWorker{
		tokenService: svc,
		producer:     producer,
	}
}

func (w *TokenizeWorker) ProcessTokenizeEvent(
	ctx context.Context,
	event models.TokenizeRequestEvent,
) error {

	log.Printf("Processing queued tokenize request envelope=%s", event.EnvelopeID)

	// Extract PII map
	canonical := event.Canonical

	beneficiary, _ := canonical["beneficiary"].(map[string]interface{})
	instrument, _ := beneficiary["instrument"].(map[string]interface{})
	remitter, _ := canonical["remitter"].(map[string]interface{})

	pii := map[string]string{
		"account_number": canonical["account_number"].(string),
		"ifsc":           instrument["ifsc"].(string),
		"vpa":            instrument["vpa"].(string),
		"name":           beneficiary["name"].(string),
		"phone":          remitter["phone"].(string),
		"email":          remitter["email"].(string),
	}

	// Use existing service logic
	tokens, err := w.tokenService.TokenizePII(
		ctx,
		event.TenantID,
		event.TraceID,
		"kafka-tokenize-consumer", // actor for audit
		pii,
	)

	if err != nil {
		log.Printf("Tokenization failed: %v", err)
		return err
	}

	// Create result event
	result := models.TokenizeResultEvent{
		EventType:    "PII_TOKENIZE_RESULT",
		TraceID:      event.TraceID,
		EnvelopeID:   event.EnvelopeID,
		TenantID:     event.TenantID,
		ObjectRef:    event.ObjectRef,
		SourceSystem: event.SourceSystem,
		IdempotencyKey: event.IdempotencyKey,
		Tokens:       tokens,
		Canonical:    event.Canonical,
		BatchID:      event.BatchID,
	}

	topic := os.Getenv("KAFKA_TOPIC_PII_TOKENIZE_RESULT")

	err = w.producer.Publish(
		ctx,
		topic,
		event.EnvelopeID,
		result,
	)

	if err != nil {
		log.Printf("Failed to publish tokenize result: %v", err)
		return err
	}

	log.Printf("Tokenize result published envelope=%s", event.EnvelopeID)

	return nil
}
