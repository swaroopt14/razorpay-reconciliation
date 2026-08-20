package audittests

// TOK-04: "Use tenant- and purpose-scoped service authorization for
// tokenize/detokenize." Real-Postgres, real-HTTP-handler tests -- the REAL
// serviceauth.Middleware, the REAL TokenHandler/DetokenizeHandler, wired
// exactly as cmd/main.go wires them, driven via net/http/httptest -- not a
// reimplementation of the auth flow. This is the literal acceptance test:
// "Intent service can access only its tenant/purpose; wrong tenant, caller
// spoof and missing object_ref are denied and audited."
//
// Run with:
//   TEST_DATABASE_URL="postgres://user:pass@localhost:PORT/db?sslmode=disable" \
//   go test ./testing/... -run TestTOK04_ -v

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"zord-token-enclave/internal/handlers"
	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/repository"
	"zord-token-enclave/internal/serviceauth"
	"zord-token-enclave/internal/services"
)

func TestMain(m *testing.M) {
	// Mirrors cmd/main.go's real startup: load the signing secret once,
	// fail fast if that ever stops working. Every TOK04 handler test below
	// authenticates through the REAL serviceauth.Middleware using this same
	// secret -- never a bypass.
	os.Setenv("SERVICE_JWT_SIGNING_SECRET", "tok04-handler-test-signing-secret")
	if err := serviceauth.InitSigningSecret(); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

func tok04Router(t *testing.T, db *sql.DB) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	repo := repository.NewTokenRepository(db)
	km := keymanager.NewKeyManager(repo, newFakeKMSClient("tok04-kms-key"), "tok04-kms-key")
	svc := services.NewTokenService(repo, km, []byte("tok04-token-secret"))

	tokenHandler := handlers.NewTokenHandler(svc)
	detokenizeHandler := handlers.NewDetokenizeHandler(svc)

	r := gin.New()
	r.Use(serviceauth.Middleware(repo)) // the REAL production middleware
	r.POST("/v1/tokenize", tokenHandler.Tokenize)
	r.POST("/v1/detokenize", detokenizeHandler.Detokenize)
	return r
}

func tok04SignedToken(t *testing.T, issuer, tenantID, purposeCode string) string {
	t.Helper()
	claims := serviceauth.ServiceClaims{
		TenantID:    tenantID,
		PurposeCode: purposeCode,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(serviceauth.DefaultTokenTTL)),
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("tok04-handler-test-signing-secret"))
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}
	return tok
}

func tok04Do(t *testing.T, r *gin.Engine, method, path, bearer string, body any) *httptest.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("X-Zord-Internal-Token", bearer)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func tok04DenyAuditCount(t *testing.T, db *sql.DB) int {
	t.Helper()
	var count int
	if err := db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM token_audit WHERE action = 'AUTHZ_DENIED'`,
	).Scan(&count); err != nil {
		t.Fatalf("query deny-audit count error = %v", err)
	}
	return count
}

// TestTOK04_ValidServiceJWTTokenizesSuccessfully is the baseline positive
// case -- "Intent service can access only its tenant/purpose" implies it
// CAN, correctly, access its own.
func TestTOK04_ValidServiceJWTTokenizesSuccessfully(t *testing.T) {
	db := tok06TestDB(t)
	r := tok04Router(t, db)
	tenantID := uuid.New().String()
	tok := tok04SignedToken(t, "zord-intent-engine", tenantID, "INTENT_PROCESSING")

	w := tok04Do(t, r, "POST", "/v1/tokenize", tok, map[string]any{
		"trace_id":       "trace-1",
		"object_ref":     "intent-123",
		"correlation_id": "corr-1",
		"pii":            map[string]string{"account_number": "1234567890"},
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body = %s", w.Code, w.Body.String())
	}
	var resp struct {
		Tokens map[string]string `json:"tokens"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if resp.Tokens["account_number"] == "" {
		t.Fatal("expected a real token in the response")
	}
	t.Log("CONFIRMED: a valid, correctly-scoped service JWT tokenizes successfully.")
}

// TestTOK04_MissingTokenIsDeniedAndAudited: the "caller spoof" baseline --
// no credential at all.
func TestTOK04_MissingTokenIsDeniedAndAudited(t *testing.T) {
	db := tok06TestDB(t)
	r := tok04Router(t, db)
	before := tok04DenyAuditCount(t, db)

	w := tok04Do(t, r, "POST", "/v1/tokenize", "", map[string]any{
		"trace_id": "trace-1", "object_ref": "intent-1", "correlation_id": "corr-1",
		"pii": map[string]string{"account_number": "1234567890"},
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
	after := tok04DenyAuditCount(t, db)
	if after != before+1 {
		t.Fatalf("AUTHZ_DENIED audit rows = %d, want %d (denial must be audited)", after, before+1)
	}
	t.Log("CONFIRMED: a request with no service JWT is denied AND leaves an AUTHZ_DENIED audit row.")
}

// TestTOK04_ForgedTokenIsDeniedAndAudited: the literal "caller spoof"
// scenario -- a token claiming to be zord-intent-engine, signed with a key
// an attacker made up.
func TestTOK04_ForgedTokenIsDeniedAndAudited(t *testing.T) {
	db := tok06TestDB(t)
	r := tok04Router(t, db)
	before := tok04DenyAuditCount(t, db)

	forged, err := jwt.NewWithClaims(jwt.SigningMethodHS256, serviceauth.ServiceClaims{
		TenantID: uuid.New().String(), PurposeCode: "INTENT_PROCESSING",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "zord-intent-engine", ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
		},
	}).SignedString([]byte("attacker-guessed-wrong"))
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}

	w := tok04Do(t, r, "POST", "/v1/tokenize", forged, map[string]any{
		"trace_id": "trace-1", "object_ref": "intent-1", "correlation_id": "corr-1",
		"pii": map[string]string{"account_number": "1234567890"},
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
	after := tok04DenyAuditCount(t, db)
	if after != before+1 {
		t.Fatalf("AUTHZ_DENIED audit rows = %d, want %d", after, before+1)
	}
	t.Log("CONFIRMED: a forged (wrong-signature) service JWT claiming to be zord-intent-engine is denied AND audited.")
}

// TestTOK04_MissingObjectRefIsDeniedAndAudited is the acceptance test's
// third named scenario, verbatim.
func TestTOK04_MissingObjectRefIsDeniedAndAudited(t *testing.T) {
	db := tok06TestDB(t)
	r := tok04Router(t, db)
	tenantID := uuid.New().String()
	tok := tok04SignedToken(t, "zord-intent-engine", tenantID, "INTENT_PROCESSING")
	before := tok04DenyAuditCount(t, db)

	w := tok04Do(t, r, "POST", "/v1/tokenize", tok, map[string]any{
		"trace_id": "trace-1", "correlation_id": "corr-1", // object_ref omitted
		"pii": map[string]string{"account_number": "1234567890"},
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
	after := tok04DenyAuditCount(t, db)
	if after != before+1 {
		t.Fatalf("AUTHZ_DENIED audit rows = %d, want %d", after, before+1)
	}
	t.Log("CONFIRMED: a tokenize request missing object_ref is denied AND audited (even though the caller's JWT was itself valid).")
}

// TestTOK04_DetokenizeMissingCorrelationIDIsDeniedAndAudited proves the
// SAME enforcement on the detokenize side, and that a validly-authenticated
// caller still can't skip the tracing fields.
func TestTOK04_DetokenizeMissingCorrelationIDIsDeniedAndAudited(t *testing.T) {
	db := tok06TestDB(t)
	r := tok04Router(t, db)
	tenantID := uuid.New().String()
	tok := tok04SignedToken(t, "zord-intent-engine", tenantID, "INTENT_PROCESSING")
	before := tok04DenyAuditCount(t, db)

	w := tok04Do(t, r, "POST", "/v1/detokenize", tok, map[string]any{
		"object_ref": "intent-1", // correlation_id omitted
		"tokens":     map[string]string{"account_number": "zrd_doesnotmatter"},
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
	after := tok04DenyAuditCount(t, db)
	if after != before+1 {
		t.Fatalf("AUTHZ_DENIED audit rows = %d, want %d", after, before+1)
	}
	t.Log("CONFIRMED: a detokenize request missing correlation_id is denied AND audited.")
}

// TestTOK04_BodyTenantIDAndCallerAreIgnored is the literal "ignore body
// caller" clause: even if a caller sends tenant_id/caller/purpose_code in
// the JSON body (old shape), those fields are not part of the new request
// structs at all -- the tokenize call still succeeds using ONLY the
// verified JWT's tenant, proving the body fields have zero effect either
// way (can't be used to escalate, can't be required either).
func TestTOK04_BodyTenantIDAndCallerAreIgnored(t *testing.T) {
	db := tok06TestDB(t)
	r := tok04Router(t, db)
	realTenant := uuid.New().String()
	victimTenant := uuid.New().String()
	tok := tok04SignedToken(t, "zord-intent-engine", realTenant, "INTENT_PROCESSING")

	// Old-shape body attempting to smuggle a different tenant_id in.
	raw, _ := json.Marshal(map[string]any{
		"tenant_id": victimTenant, "caller": "someone-else",
		"trace_id": "trace-1", "object_ref": "intent-1", "correlation_id": "corr-1",
		"pii": map[string]string{"account_number": "9999999999"},
	})
	req := httptest.NewRequest("POST", "/v1/tokenize", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Zord-Internal-Token", tok)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body = %s", w.Code, w.Body.String())
	}

	var count int
	if err := db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM token_map WHERE tenant_id = $1`, victimTenant,
	).Scan(&count); err != nil {
		t.Fatalf("query error = %v", err)
	}
	if count != 0 {
		t.Fatalf("victimTenant has %d token_map rows, want 0 -- body-supplied tenant_id was NOT ignored", count)
	}

	if err := db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM token_map WHERE tenant_id = $1`, realTenant,
	).Scan(&count); err != nil {
		t.Fatalf("query error = %v", err)
	}
	if count == 0 {
		t.Fatal("realTenant (from the verified JWT) has 0 token_map rows, want at least 1")
	}
	t.Log("CONFIRMED: a body-supplied tenant_id/caller has zero effect -- the token was written under the JWT's own tenant, never the body's.")
}

// TestTOK04_CrossTenantDetokenizeIsDeniedAndAudited is the "wrong tenant"
// scenario: tenant A's real token cannot be detokenized by a service JWT
// scoped to tenant B, and this falls out of the ALREADY-hardened Get()
// query (TOK-05/06) once tenant_id is bound to a verified claim -- no new
// mismatch logic needed, proven here end to end through real HTTP.
func TestTOK04_CrossTenantDetokenizeIsDeniedAndAudited(t *testing.T) {
	db := tok06TestDB(t)
	r := tok04Router(t, db)
	tenantA := uuid.New().String()
	tenantB := uuid.New().String()

	tokA := tok04SignedToken(t, "zord-intent-engine", tenantA, "INTENT_PROCESSING")
	wTok := tok04Do(t, r, "POST", "/v1/tokenize", tokA, map[string]any{
		"trace_id": "trace-1", "object_ref": "intent-1", "correlation_id": "corr-1",
		"pii": map[string]string{"account_number": "1234567890"},
	})
	if wTok.Code != http.StatusOK {
		t.Fatalf("tokenize setup status = %d, body = %s", wTok.Code, wTok.Body.String())
	}
	var tokResp struct {
		Tokens map[string]string `json:"tokens"`
	}
	if err := json.Unmarshal(wTok.Body.Bytes(), &tokResp); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	tenantAToken := tokResp.Tokens["account_number"]

	tokB := tok04SignedToken(t, "zord-intent-engine", tenantB, "INTENT_PROCESSING")
	wDetok := tok04Do(t, r, "POST", "/v1/detokenize", tokB, map[string]any{
		"object_ref": "intent-2", "correlation_id": "corr-2",
		"tokens": map[string]string{"account_number": tenantAToken},
	})

	if wDetok.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 (detokenization failed / not found for this tenant), body = %s", wDetok.Code, wDetok.Body.String())
	}
	// Get()'s own pre-existing DENY audit path (token_repo.go) fires here --
	// confirm the denial genuinely landed a DENY-decision row scoped to
	// tenant B (the caller who was denied), not tenant A (the data owner).
	var denyCount int
	if err := db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM token_audit WHERE tenant_id = $1 AND decision = 'DENY'`, tenantB,
	).Scan(&denyCount); err != nil {
		t.Fatalf("query error = %v", err)
	}
	if denyCount == 0 {
		t.Fatal("expected at least one DENY-decision token_audit row for tenant B's cross-tenant lookup attempt")
	}
	t.Log("CONFIRMED: a service JWT scoped to tenant B cannot detokenize a token that belongs to tenant A -- denied and audited, with zero new mismatch logic (the composite-scoped Get() query already does this once tenant_id is bound to a verified claim).")
}
