package audittests

// INT-08: "Move migrations out of startup and add HTTP lifecycle controls"
// (migration-out-of-startup half is on hold per explicit direction; this
// covers the HTTP-lifecycle half). This file tests the one piece of that
// half that's genuinely unit-testable without a live server or OS signal:
// the readiness-during-drain flag on internal/health.ReadinessHandler.
//
// Before this fix, /ready always ran its dependency checks and reported
// whatever they said, with no way to signal "the process is shutting
// down" ahead of time -- so a Kubernetes readiness probe would keep
// routing new traffic right up until the instant the process was killed.
// SetNotReady() (cmd/main.go's graceful-shutdown sequence calls this as
// its very first step) makes ReadyHTTP return 503 immediately, without
// even attempting a dependency check.
//
// The graceful-shutdown sequence itself (signal handling, ordered
// consumer/HTTP/DB drain in cmd/main.go) lives in package main and reacts
// to a real OS signal -- not something `go test` can exercise the same
// way. That part is verified separately via a real SIGTERM sent to a
// running build of the binary (see the testing report for the captured
// session).
//
// Run with: go test ./testing/... -run TestINT08 -v

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"zord-intent-engine/internal/health"
)

// TestINT08_ReadinessReturnsUnavailableDuringDrain is the core INT-08 test:
// /ready reports 200 before SetNotReady(), 503 immediately after, and
// never runs the dependency check once not-ready.
func TestINT08_ReadinessReturnsUnavailableDuringDrain(t *testing.T) {
	depCheckCalls := 0
	check := health.DependencyCheck{
		Name: "fake-dep",
		Check: func(ctx context.Context) error {
			depCheckCalls++
			return nil
		},
	}
	h := health.NewReadinessHandler([]health.DependencyCheck{check})

	// Before shutdown: ready, dependency check runs.
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec := httptest.NewRecorder()
	h.ReadyHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("before SetNotReady: status = %d, want 200", rec.Code)
	}
	if depCheckCalls != 1 {
		t.Fatalf("before SetNotReady: dependency check called %d times, want 1", depCheckCalls)
	}
	var beforeBody map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &beforeBody); err != nil {
		t.Fatalf("failed to unmarshal /ready response: %v", err)
	}
	if beforeBody["status"] != "ready" {
		t.Fatalf("before SetNotReady: status field = %v, want \"ready\"", beforeBody["status"])
	}
	t.Logf("[BEFORE] /ready -> %d, body status=%q, dependency check ran", rec.Code, beforeBody["status"])

	// Simulate the first step of graceful shutdown.
	h.SetNotReady()

	// After shutdown starts: 503 immediately, dependency check NOT re-run.
	req2 := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec2 := httptest.NewRecorder()
	h.ReadyHTTP(rec2, req2)
	if rec2.Code != http.StatusServiceUnavailable {
		t.Fatalf("after SetNotReady: status = %d, want 503", rec2.Code)
	}
	if depCheckCalls != 1 {
		t.Fatalf("after SetNotReady: dependency check called %d additional time(s) -- should short-circuit before checking dependencies", depCheckCalls-1)
	}
	var afterBody map[string]interface{}
	if err := json.Unmarshal(rec2.Body.Bytes(), &afterBody); err != nil {
		t.Fatalf("failed to unmarshal /ready response: %v", err)
	}
	if afterBody["status"] != "not_ready" {
		t.Fatalf("after SetNotReady: status field = %v, want \"not_ready\"", afterBody["status"])
	}
	t.Logf("[AFTER] /ready -> %d, body status=%q, dependency check correctly skipped", rec2.Code, afterBody["status"])
	t.Log("CONFIRMED: readiness flips to unavailable immediately on SetNotReady(), before any dependency is even checked -- Kubernetes' readiness probe gets the earliest possible signal to stop routing new traffic during drain.")
}

// TestINT08_ReadinessStillReflectsRealDependencyFailure proves SetNotReady
// didn't just replace the dependency-check logic wholesale: a genuinely
// failing dependency (never having called SetNotReady) still correctly
// reports 503, same as before this fix.
func TestINT08_ReadinessStillReflectsRealDependencyFailure(t *testing.T) {
	check := health.DependencyCheck{
		Name:  "fake-dep",
		Check: func(ctx context.Context) error { return errors.New("boom") },
	}
	h := health.NewReadinessHandler([]health.DependencyCheck{check})

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec := httptest.NewRecorder()
	h.ReadyHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 for a genuinely failing dependency", rec.Code)
	}
	t.Log("CONFIRMED: a genuine dependency failure (not a shutdown-drain state) still correctly returns 503, unchanged from before this fix.")
}
