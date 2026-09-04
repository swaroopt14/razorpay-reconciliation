package health

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// DependencyCheck represents a single dependency health check.
type DependencyCheck struct {
	Name  string
	Check func(ctx context.Context) error
}

// ReadinessHandler manages readiness probes with dependency checks.
type ReadinessHandler struct {
	checks []DependencyCheck
	ready  atomic.Bool
}

// NewReadinessHandler creates a handler with the given dependency checks.
// Starts ready — see SetNotReady for the shutdown-drain path.
func NewReadinessHandler(checks []DependencyCheck) *ReadinessHandler {
	h := &ReadinessHandler{checks: checks}
	h.ready.Store(true)
	return h
}

// SetNotReady marks this handler not-ready: ReadyHTTP will return 503
// immediately afterward, without running any dependency check. INT-08:
// call this as the very first step of graceful shutdown, before draining
// consumers/HTTP/DB, so a Kubernetes readiness probe (typically polling
// every ~10s) has the whole termination grace window to notice and stop
// routing new traffic while in-flight work finishes.
func (h *ReadinessHandler) SetNotReady() {
	h.ready.Store(false)
}

// DBCheck returns a dependency check that pings the database.
func DBCheck(name string, db *sql.DB) DependencyCheck {
	return DependencyCheck{
		Name: name,
		Check: func(ctx context.Context) error {
			return db.PingContext(ctx)
		},
	}
}

// HTTPCheck returns a dependency check that verifies an HTTP endpoint is reachable.
func HTTPCheck(name string, url string) DependencyCheck {
	client := &http.Client{Timeout: 2 * time.Second}
	return DependencyCheck{
		Name: name,
		Check: func(ctx context.Context) error {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			if err != nil {
				return err
			}
			resp, err := client.Do(req)
			if err != nil {
				return err
			}
			resp.Body.Close()
			if resp.StatusCode >= 500 {
				return fmt.Errorf("unhealthy: status %d", resp.StatusCode)
			}
			return nil
		},
	}
}

type checkResult struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

// ReadyHTTP is the net/http handler for /ready endpoint.
// Returns 200 if all dependencies are healthy, 503 if any fail.
func (h *ReadinessHandler) ReadyHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.ready.Load() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "not_ready",
			"reason":    "shutting_down",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	results := make([]checkResult, len(h.checks))
	var wg sync.WaitGroup
	var mu sync.Mutex
	allHealthy := true

	for i, check := range h.checks {
		wg.Add(1)
		go func(idx int, dep DependencyCheck) {
			defer wg.Done()
			err := dep.Check(ctx)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				results[idx] = checkResult{Name: dep.Name, Status: "unhealthy", Error: err.Error()}
				allHealthy = false
			} else {
				results[idx] = checkResult{Name: dep.Name, Status: "healthy"}
			}
		}(i, check)
	}

	wg.Wait()

	status := http.StatusOK
	if !allHealthy {
		status = http.StatusServiceUnavailable
	}

	statusStr := "ready"
	if !allHealthy {
		statusStr = "not_ready"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       statusStr,
		"dependencies": results,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})
}
