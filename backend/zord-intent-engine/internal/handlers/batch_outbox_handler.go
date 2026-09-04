package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"zord-intent-engine/internal/persistence"

	"github.com/google/uuid"
)

type BatchOutboxHandler struct {
	repo persistence.BatchPullRepository
}

func NewBatchOutboxHandler(repo persistence.BatchPullRepository) *BatchOutboxHandler {
	return &BatchOutboxHandler{repo: repo}
}

type batchLeaseResponse struct {
	LeaseID    string      `json:"lease_id"`
	LeaseUntil *time.Time  `json:"lease_until,omitempty"`
	Events     interface{} `json:"events"`
}

type batchAckNackRequest struct {
	LeaseID  string   `json:"lease_id"`
	BatchIDs []string `json:"batch_ids"`
}

type batchAckNackResponse struct {
	Updated int64 `json:"updated"`
}

func (h *BatchOutboxHandler) Lease(w http.ResponseWriter, r *http.Request) {
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

	ttl := 120 // default
	if raw := r.URL.Query().Get("lease_ttl_seconds"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err == nil && n > 0 && n <= 600 {
			ttl = n
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	leaseID, leaseUntil, entries, err := h.repo.LeaseBatch(ctx, limit, ttl, relayInstanceID(r))
	if err != nil {
		http.Error(w, "failed to lease batch events", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, batchLeaseResponse{
		LeaseID:    leaseID,
		LeaseUntil: leaseUntil,
		Events:     entries,
	})
}

func (h *BatchOutboxHandler) Ack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req batchAckNackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if _, err := uuid.Parse(req.LeaseID); err != nil {
		http.Error(w, "invalid lease_id", http.StatusBadRequest)
		return
	}
	if len(req.BatchIDs) == 0 {
		http.Error(w, "batch_ids is required", http.StatusBadRequest)
		return
	}

	updated, err := h.repo.AckBatch(r.Context(), req.LeaseID, req.BatchIDs)
	if err != nil {
		http.Error(w, "failed to ack batch events", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, batchAckNackResponse{Updated: updated})
}

func (h *BatchOutboxHandler) Nack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req batchAckNackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if _, err := uuid.Parse(req.LeaseID); err != nil {
		http.Error(w, "invalid lease_id", http.StatusBadRequest)
		return
	}
	if len(req.BatchIDs) == 0 {
		http.Error(w, "batch_ids is required", http.StatusBadRequest)
		return
	}

	updated, err := h.repo.NackBatch(r.Context(), req.LeaseID, req.BatchIDs)
	if err != nil {
		http.Error(w, "failed to nack batch events", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, batchAckNackResponse{Updated: updated})
}
