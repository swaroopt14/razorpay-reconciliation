package auth

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

const testInternalToken = "test-internal-service-token"

func okHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func withInternalServiceToken(t *testing.T, value string) {
	t.Helper()
	old := os.Getenv("INTERNAL_SERVICE_TOKEN")
	os.Setenv("INTERNAL_SERVICE_TOKEN", value)
	t.Cleanup(func() { os.Setenv("INTERNAL_SERVICE_TOKEN", old) })
}

func TestRequireInternalScope_NoTokenConfigured_FailsClosed(t *testing.T) {
	withInternalServiceToken(t, "") // unset entirely

	req := httptest.NewRequest(http.MethodGet, "/internal/intents/count", nil)
	req.Header.Set("X-Internal-Service-Token", "anything")
	rec := httptest.NewRecorder()

	RequireInternalScope(ScopeIntentReadCrossTenant, okHandler)(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when no token is configured (fail-closed), got %d", rec.Code)
	}
}

func TestRequireInternalScope_MissingHeader_Unauthorized(t *testing.T) {
	withInternalServiceToken(t, testInternalToken)

	req := httptest.NewRequest(http.MethodGet, "/internal/intents/count", nil)
	rec := httptest.NewRecorder()

	RequireInternalScope(ScopeIntentReadCrossTenant, okHandler)(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing header, got %d", rec.Code)
	}
}

func TestRequireInternalScope_WrongToken_Unauthorized(t *testing.T) {
	withInternalServiceToken(t, testInternalToken)

	req := httptest.NewRequest(http.MethodGet, "/internal/intents/count", nil)
	req.Header.Set("X-Internal-Service-Token", "not-the-configured-token")
	rec := httptest.NewRecorder()

	RequireInternalScope(ScopeIntentReadCrossTenant, okHandler)(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong token, got %d", rec.Code)
	}
}

func TestRequireInternalScope_EndUserJWT_TreatedAsNoCredential(t *testing.T) {
	withInternalServiceToken(t, testInternalToken)

	// An Authorization bearer (however it was obtained — a real end-user
	// JWT included) must not substitute for the internal service token: this
	// route never consults Authorization, only X-Internal-Service-Token, so
	// it must be denied exactly like an unauthenticated request.
	req := httptest.NewRequest(http.MethodGet, "/internal/intents/count", nil)
	req.Header.Set("Authorization", "Bearer some-end-user-jwt.with.signature")
	rec := httptest.NewRecorder()

	RequireInternalScope(ScopeIntentReadCrossTenant, okHandler)(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for end-user JWT on internal route, got %d", rec.Code)
	}
}

func TestRequireInternalScope_ValidToken_MissingScope_Forbidden(t *testing.T) {
	withInternalServiceToken(t, testInternalToken)

	req := httptest.NewRequest(http.MethodGet, "/internal/intents/count", nil)
	req.Header.Set("X-Internal-Service-Token", testInternalToken)
	rec := httptest.NewRecorder()

	// The configured token only ever carries ScopeIntentReadCrossTenant
	// today; requiring a different scope proves the scope check itself
	// (not just token presence) gates access.
	RequireInternalScope("some.other.scope", okHandler)(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for valid token lacking required scope, got %d", rec.Code)
	}
}

func TestRequireInternalScope_ValidTokenAndScope_Passes(t *testing.T) {
	withInternalServiceToken(t, testInternalToken)

	req := httptest.NewRequest(http.MethodGet, "/internal/intents/by-envelope?envelope_id=abc", nil)
	req.Header.Set("X-Internal-Service-Token", testInternalToken)
	rec := httptest.NewRecorder()

	RequireInternalScope(ScopeIntentReadCrossTenant, okHandler)(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}
}
