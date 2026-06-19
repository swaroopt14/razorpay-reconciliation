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

type DLQOutboxHandler struct {
	repo persistence.DLQPullRepository
}

func NewDLQOutboxHandler(repo persistence.DLQPullRepository) *DLQOutboxHandler {
	return &DLQOutboxHandler{repo: repo}
}

type dlqLeaseResponse struct {
	LeaseID    string      `json:"lease_id"`
	LeaseUntil *time.Time  `json:"lease_until,omitempty"`
	Events     interface{} `json:"events"`
}

type dlqAckNackRequest struct {
	LeaseID string   `json:"lease_id"`
	DLQIDs  []string `json:"dlq_ids"`
}

type dlqAckNackResponse struct {
	Updated int64 `json:"updated"`
}

func (h *DLQOutboxHandler) Lease(w http.ResponseWriter, r *http.Request) {
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
	leaseID, leaseUntil, entries, err := h.repo.LeaseDLQBatch(ctx, limit, ttl, relayInstanceID(r))
	if err != nil {
		http.Error(w, "failed to lease dlq events", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, dlqLeaseResponse{
		LeaseID:    leaseID,
		LeaseUntil: leaseUntil,
		Events:     entries,
	})
}

func (h *DLQOutboxHandler) Ack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req dlqAckNackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if _, err := uuid.Parse(req.LeaseID); err != nil {
		http.Error(w, "invalid lease_id", http.StatusBadRequest)
		return
	}
	if len(req.DLQIDs) == 0 {
		http.Error(w, "dlq_ids is required", http.StatusBadRequest)
		return
	}
	for _, id := range req.DLQIDs {
		if _, err := uuid.Parse(id); err != nil {
			http.Error(w, "invalid dlq_id", http.StatusBadRequest)
			return
		}
	}

	updated, err := h.repo.AckDLQBatch(r.Context(), req.LeaseID, req.DLQIDs)
	if err != nil {
		http.Error(w, "failed to ack dlq events", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, dlqAckNackResponse{Updated: updated})
}

func (h *DLQOutboxHandler) Nack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req dlqAckNackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if _, err := uuid.Parse(req.LeaseID); err != nil {
		http.Error(w, "invalid lease_id", http.StatusBadRequest)
		return
	}
	if len(req.DLQIDs) == 0 {
		http.Error(w, "dlq_ids is required", http.StatusBadRequest)
		return
	}
	for _, id := range req.DLQIDs {
		if _, err := uuid.Parse(id); err != nil {
			http.Error(w, "invalid dlq_id", http.StatusBadRequest)
			return
		}
	}

	updated, err := h.repo.NackDLQBatch(r.Context(), req.LeaseID, req.DLQIDs)
	if err != nil {
		http.Error(w, "failed to nack dlq events", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, dlqAckNackResponse{Updated: updated})
}
