package handler

import (
	"context"
	"crypto/subtle"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"zord-edge/logger"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type OutboxHandler struct {
	repo services.OutboxPullRepository
}

func NewOutboxHandler(repo services.OutboxPullRepository) *OutboxHandler {
	return &OutboxHandler{repo: repo}
}

type leaseResponse struct {
	LeaseID    string      `json:"lease_id"`
	LeaseUntil *time.Time  `json:"lease_until,omitempty"`
	Events     interface{} `json:"events"`
}

type ackNackRequest struct {
	LeaseID  string   `json:"lease_id"`
	EventIDs []string `json:"event_ids"`
}

type ackNackResponse struct {
	Updated int64 `json:"updated"`
}

func (h *OutboxHandler) Lease(c *gin.Context) {
	if !authorizeRelay(c.Request) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	const maxLeaseLimit = 1000

	limit := 500
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid limit"})
			return
		}

		if n > maxLeaseLimit {
			n = maxLeaseLimit
		}

		limit = n
	}

	ttl := 120 // default
	if raw := c.Query("lease_ttl_seconds"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err == nil && n > 0 && n <= 600 {
			ttl = n
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	leaseID, leaseUntil, events, err := h.repo.LeaseOutboxBatch(ctx, limit, ttl, relayInstanceID(c.Request))
	if err != nil {
		logger.Log.Error("outbox lease failed",
			slog.Int("limit", limit),
			slog.Int("ttl", ttl),
			slog.String("error", err.Error()))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lease outbox events"})
		return
	}

	c.JSON(http.StatusOK, leaseResponse{
		LeaseID:    leaseID,
		LeaseUntil: leaseUntil,
		Events:     events,
	})
}

func (h *OutboxHandler) Ack(c *gin.Context) {
	if !authorizeRelay(c.Request) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req ackNackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json body"})
		return
	}
	if _, err := uuid.Parse(req.LeaseID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lease_id"})
		return
	}
	if len(req.EventIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "event_ids is required"})
		return
	}
	for _, id := range req.EventIDs {
		if _, err := uuid.Parse(id); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event_id"})
			return
		}
	}

	updated, err := h.repo.AckOutboxBatch(c.Request.Context(), req.LeaseID, req.EventIDs)
	if err != nil {
		logger.Log.Error("outbox ack failed",
			slog.String("lease_id", req.LeaseID),
			slog.Int("event_count", len(req.EventIDs)),
			slog.String("error", err.Error()))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to ack outbox events"})
		return
	}

	c.JSON(http.StatusOK, ackNackResponse{Updated: updated})
}

func (h *OutboxHandler) Nack(c *gin.Context) {
	if !authorizeRelay(c.Request) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req ackNackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json body"})
		return
	}
	if _, err := uuid.Parse(req.LeaseID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lease_id"})
		return
	}
	if len(req.EventIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "event_ids is required"})
		return
	}
	for _, id := range req.EventIDs {
		if _, err := uuid.Parse(id); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event_id"})
			return
		}
	}

	updated, err := h.repo.NackOutboxBatch(c.Request.Context(), req.LeaseID, req.EventIDs)
	if err != nil {
		logger.Log.Error("outbox nack failed",
			slog.String("lease_id", req.LeaseID),
			slog.Int("event_count", len(req.EventIDs)),
			slog.String("error", err.Error()))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to nack outbox events"})
		return
	}

	c.JSON(http.StatusOK, ackNackResponse{Updated: updated})
}

func relayInstanceID(r *http.Request) string {
	if instanceID := strings.TrimSpace(r.Header.Get("X-Relay-Instance-ID")); instanceID != "" {
		return instanceID
	}
	if hostname, err := os.Hostname(); err == nil && strings.TrimSpace(hostname) != "" {
		return hostname
	}
	return "relay"
}

func authorizeRelay(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("RELAY_AUTH_TOKEN"))

	// Fail closed — if token is not configured, deny all requests.
	if expected == "" {
		logger.Log.Warn("RELAY_AUTH_TOKEN is not set, rejecting request",
			slog.String("remote_addr", r.RemoteAddr))
		return false
	}

	provided := strings.TrimSpace(r.Header.Get("X-Relay-Token"))
	if provided == "" {
		logger.Log.Warn("missing X-Relay-Token header",
			slog.String("remote_addr", r.RemoteAddr),
			slog.String("path", r.URL.Path))
		return false
	}

	// Constant-time comparison prevents timing side-channel attacks.
	if subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) != 1 {
		logger.Log.Warn("invalid relay auth token",
			slog.String("remote_addr", r.RemoteAddr),
			slog.String("path", r.URL.Path))
		return false
	}

	return true
}