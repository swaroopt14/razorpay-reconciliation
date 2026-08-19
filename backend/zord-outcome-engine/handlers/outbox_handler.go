package handlers

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"zord-outcome-engine/models"
	"zord-outcome-engine/storage"

	"github.com/google/uuid"
)

type OutboxHandler struct {
	repo storage.OutboxPullRepository
}

func NewOutboxHandler(repo storage.OutboxPullRepository) *OutboxHandler {
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

func (h *OutboxHandler) Lease(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	const maxLeaseLimit = 1000

	limit := 500
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			http.Error(w, "invalid limit", http.StatusBadRequest)
			return
		}

		if n > maxLeaseLimit {
			n = maxLeaseLimit
		}

		limit = n
	}

	// Issue 1 — leasedBy is hardcoded to "relay" in the handler.
	// multiple relay instances, every instance identifies itself as "relay".
	// Fix — read it from a request header:
	// leasedBy := r.Header.Get("X-Relay-Instance-ID")
	// if leasedBy == "" {
	//		http.Error(w, "X-Relay-Instance-ID header required", http.StatusBadRequest)
	//		return
	//}
	// Service 4 sets this header to its pod name or instance UUID on every lease call.

	// Fix — make TTL configurable via query param with a sane default:
	ttl := 120 // default
	if raw := r.URL.Query().Get("lease_ttl_seconds"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err == nil && n > 0 && n <= 600 {
			ttl = n
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	leaseID, leaseUntil, events, err := h.repo.LeaseOutboxBatch(ctx, limit, ttl, relayInstanceID(r))
	if err != nil {
		http.Error(w, "failed to lease outbox events", http.StatusInternalServerError)
		return
	}

	// Stamp the standard cross-service envelope fields (event_version,
	// schema_version) that aren't outbox DB columns — they're constant per
	// producer, not per-row data. Mirrors zord-intent-engine's outbox handler.
	for i := range events {
		events[i].EventVersion = models.EventVersionV1
		events[i].SchemaVersion = models.SchemaVersionV1
	}

	writeJSON(w, http.StatusOK, leaseResponse{
		LeaseID:    leaseID,
		LeaseUntil: leaseUntil,
		Events:     events,
	})
}

func (h *OutboxHandler) Ack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req ackNackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if _, err := uuid.Parse(req.LeaseID); err != nil {
		http.Error(w, "invalid lease_id", http.StatusBadRequest)
		return
	}
	if len(req.EventIDs) == 0 {
		http.Error(w, "event_ids is required", http.StatusBadRequest)
		return
	}
	for _, id := range req.EventIDs {
		if _, err := uuid.Parse(id); err != nil {
			http.Error(w, "invalid event_id", http.StatusBadRequest)
			return
		}
	}

	updated, err := h.repo.AckOutboxBatch(r.Context(), req.LeaseID, req.EventIDs)
	if err != nil {
		http.Error(w, "failed to ack outbox events", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, ackNackResponse{Updated: updated})
}

func (h *OutboxHandler) Nack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req ackNackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if _, err := uuid.Parse(req.LeaseID); err != nil {
		http.Error(w, "invalid lease_id", http.StatusBadRequest)
		return
	}
	if len(req.EventIDs) == 0 {
		http.Error(w, "event_ids is required", http.StatusBadRequest)
		return
	}
	for _, id := range req.EventIDs {
		if _, err := uuid.Parse(id); err != nil {
			http.Error(w, "invalid event_id", http.StatusBadRequest)
			return
		}
	}

	updated, err := h.repo.NackOutboxBatch(r.Context(), req.LeaseID, req.EventIDs)
	if err != nil {
		http.Error(w, "failed to nack outbox events", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, ackNackResponse{Updated: updated})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
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
		log.Printf("SECURITY: RELAY_AUTH_TOKEN is not set — rejecting request from %s", r.RemoteAddr)
		return false
	}

	provided := strings.TrimSpace(r.Header.Get("X-Relay-Token"))
	if provided == "" {
		log.Printf("SECURITY: missing X-Relay-Token header from %s %s", r.RemoteAddr, r.URL.Path)
		return false
	}

	// Constant-time comparison prevents timing side-channel attacks.
	if subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) != 1 {
		log.Printf("SECURITY: invalid relay auth token from %s %s", r.RemoteAddr, r.URL.Path)
		return false
	}

	return true
}