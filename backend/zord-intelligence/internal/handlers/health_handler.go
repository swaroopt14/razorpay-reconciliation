package handlers

// What is this file?
// Health check endpoints for Kubernetes.
// Kubernetes calls /healthz every few seconds to know if the pod is alive.
// If this returns non-200, Kubernetes restarts the pod.
//
// Two endpoints:
//   GET /healthz  → liveness  (is the process running?)
//   GET /readyz   → readiness (is it ready to serve traffic?)

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HealthHandler handles health check requests.
type HealthHandler struct {
	pool *pgxpool.Pool
}

// NewHealthHandler creates a HealthHandler with the database pool for readiness checks.
func NewHealthHandler(pool *pgxpool.Pool) *HealthHandler {
	return &HealthHandler{pool: pool}
}

// Liveness responds to GET /healthz
// Returns 200 as long as the process is alive.
// Even if DB is down, this returns 200 — the process is still running.
func (h *HealthHandler) Liveness(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "zord-intelligence",
	})
}

// Readiness responds to GET /readyz
// Returns 200 only when the service is ready to handle traffic.
// Kubernetes won't route traffic to a pod until this returns 200.
func (h *HealthHandler) Readiness(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	type checkResult struct {
		Name   string `json:"name"`
		Status string `json:"status"`
		Error  string `json:"error,omitempty"`
	}

	results := make([]checkResult, 1)
	var wg sync.WaitGroup
	var mu sync.Mutex
	allHealthy := true

	wg.Add(1)
	go func() {
		defer wg.Done()
		err := h.pool.Ping(ctx)
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			results[0] = checkResult{Name: "postgres", Status: "unhealthy", Error: err.Error()}
			allHealthy = false
		} else {
			results[0] = checkResult{Name: "postgres", Status: "healthy"}
		}
	}()

	wg.Wait()

	status := http.StatusOK
	if !allHealthy {
		status = http.StatusServiceUnavailable
	}

	statusStr := "ready"
	if !allHealthy {
		statusStr = "not_ready"
	}

	writeJSON(w, status, map[string]interface{}{
		"status":       statusStr,
		"dependencies": results,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})
}
