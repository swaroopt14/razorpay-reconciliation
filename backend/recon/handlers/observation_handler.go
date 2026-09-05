package handlers

import (
	"context"
	"log"
	"net/http"

	"zord-outcome-engine/internal/observe"

	"github.com/gin-gonic/gin"
)

type ObservationHandler struct {
	Processor *observe.Processor
}

func (h *ObservationHandler) Ingest(c *gin.Context) {
	if !authorizeRelay(c.Request) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if h == nil || h.Processor == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "observation processor not configured"})
		return
	}
	raw, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	result, err := h.Processor.ApplyBytes(c.Request.Context(), raw)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "persist_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":     result.Kind,
		"payment_id": result.PaymentID,
		"event_type": result.EventType,
	})
}

var observationProcessor *observe.Processor

func SetObservationProcessor(p *observe.Processor) {
	observationProcessor = p
}

func HandleProviderObservation(msg []byte) error {
	if observationProcessor == nil {
		return nil
	}
	result, err := observationProcessor.ApplyBytes(context.Background(), msg)
	if err != nil {
		return err
	}
	if result.Kind != observe.ResultIgnored {
		log.Printf("provider.observation %s payment_id=%s event_type=%s", result.Kind, result.PaymentID, result.EventType)
	}
	return nil
}
