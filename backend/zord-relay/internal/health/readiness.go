package health

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// DependencyCheck represents a single dependency health check.
type DependencyCheck struct {
	Name  string
	Check func(ctx context.Context) error
}

// ReadinessHandler manages readiness probes with dependency checks.
type ReadinessHandler struct {
	checks []DependencyCheck
}

// NewReadinessHandler creates a handler with the given dependency checks.
func NewReadinessHandler(checks []DependencyCheck) *ReadinessHandler {
	return &ReadinessHandler{checks: checks}
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

// Ready is the Gin handler for /ready endpoint.
// Returns 200 if all dependencies are healthy, 503 if any fail.
func (h *ReadinessHandler) Ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
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

	c.JSON(status, gin.H{
		"status":       map[bool]string{true: "ready", false: "not_ready"}[allHealthy],
		"dependencies": results,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})
}
