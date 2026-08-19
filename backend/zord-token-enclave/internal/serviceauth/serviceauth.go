// Package serviceauth verifies the scoped service JWT every internal caller
// of zord-token-enclave must now present (TOK-04: "Use tenant- and
// purpose-scoped service authorization for tokenize/detokenize"). It
// replaces the old scheme of a single static shared secret identical for
// every caller -- that gave zero way to tell WHICH service was calling, so
// any holder of the secret could request or decrypt PII for any tenant and
// the audit trail believed whatever caller/tenant string it was handed in
// the request body.
//
// This is a SEPARATE trust domain from zord-edge's user-session JWT
// (JWT_SIGNING_SECRET) -- different audience, different secret, on purpose.
// Reusing the console-session secret here would mean anyone able to mint or
// steal a user session token could also mint a service-to-service tokenize
// credential.
package serviceauth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// ServiceClaims is the scoped credential a caller service mints fresh for
// each outbound tokenize/detokenize call (short-lived, not a long-lived
// per-service secret) -- see zord-intent-engine's internal/auth.MintServiceToken.
type ServiceClaims struct {
	TenantID    string `json:"tenant_id"`
	PurposeCode string `json:"purpose_code"`
	jwt.RegisteredClaims
}

var (
	secretOnce sync.Once
	secret     []byte
	secretErr  error
)

// InitSigningSecret loads the HS256 shared secret used to verify service
// JWTs. Must be called once during startup, before any request is served --
// mirrors zord-intent-engine's internal/auth.InitJWTSigningSecret fail-fast
// discipline (a missing secret must refuse startup, not silently accept
// every request or reject every request with a confusing runtime error).
func InitSigningSecret() error {
	secretOnce.Do(func() {
		v := os.Getenv("SERVICE_JWT_SIGNING_SECRET")
		if v == "" {
			secretErr = errors.New("SERVICE_JWT_SIGNING_SECRET environment variable is required")
			return
		}
		secret = []byte(v)
	})
	return secretErr
}

// allowedPurposeCodes is the server-side authorization policy: even a
// validly-signed claim is rejected if its purpose_code isn't in the issuing
// service's allowed set. The claim states a purpose; the enclave still
// enforces its own policy on top -- never blindly trust whatever an issuer
// claims about itself, defense in depth against a compromised or buggy
// issuer minting out-of-scope tokens.
var allowedPurposeCodes = map[string]map[string]bool{
	"zord-intent-engine": {"INTENT_PROCESSING": true},
}

// ErrDenied is wrapped by every verification failure -- callers only need
// to know "deny", never the specific reason (avoid leaking which check
// failed to a potential attacker iterating on forged tokens), while the
// underlying error is still available via errors.Unwrap for server-side
// audit logging.
var ErrDenied = errors.New("service authorization denied")

// VerifyServiceJWT parses and verifies tokenStr against the process-wide
// signing secret loaded by InitSigningSecret: HMAC signature, expiry, and
// that the claimed issuer is permitted to use the claimed purpose_code.
// Returns the verified claims only when every check passes.
func VerifyServiceJWT(tokenStr string) (*ServiceClaims, error) {
	if len(secret) == 0 {
		return nil, fmt.Errorf("%w: signing secret not initialized", ErrDenied)
	}
	return VerifyServiceJWTWithSecret(tokenStr, secret)
}

// VerifyServiceJWTWithSecret is VerifyServiceJWT's actual logic, parameterized
// by secret rather than the process-wide sync.Once-loaded one -- lets tests
// exercise every scenario (wrong signature, expired, unknown issuer, purpose
// not allowed) directly and deterministically.
func VerifyServiceJWTWithSecret(tokenStr string, secret []byte) (*ServiceClaims, error) {
	if tokenStr == "" {
		return nil, fmt.Errorf("%w: no token presented", ErrDenied)
	}

	claims := &ServiceClaims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Method)
		}
		return secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDenied, err)
	}

	issuer := claims.Issuer
	allowed, knownIssuer := allowedPurposeCodes[issuer]
	if !knownIssuer {
		return nil, fmt.Errorf("%w: unknown issuer %q", ErrDenied, issuer)
	}
	if claims.TenantID == "" {
		return nil, fmt.Errorf("%w: token missing tenant_id claim", ErrDenied)
	}
	if !allowed[claims.PurposeCode] {
		return nil, fmt.Errorf("%w: purpose_code %q not allowed for issuer %q", ErrDenied, claims.PurposeCode, issuer)
	}

	return claims, nil
}

// DefaultTokenTTL is the recommended expiry for a minted service JWT --
// short enough to sharply limit replay value if a token ever leaks (e.g.
// into logs), long enough to comfortably cover a call's own retry budget.
const DefaultTokenTTL = 60 * time.Second

// AuditWriter is the one capability Middleware needs from the repository --
// kept as a narrow interface (rather than importing the concrete
// repository package here) so this package's dependency graph stays
// verification-focused. *repository.TokenRepository already satisfies this
// with no wrapper needed.
type AuditWriter interface {
	WriteAuthzDenialAudit(ctx context.Context, tenantID, caller, action, purposeCode, objectRef, correlationID, reason string) error
}

// Middleware is the real, single implementation of TOK-04's auth gate --
// used by cmd/main.go to wire the live service AND directly by tests
// (testing/audittests) exercising the real HTTP flow end to end, so there is
// never a second, test-only reimplementation of this logic to drift out of
// sync with production. Every request except /v1/health and /ready must
// present a valid, scoped service JWT; any failure is denied AND durably
// audited (best-effort -- an audit-write failure must never change whether
// an already-denied request is denied).
func Middleware(auditWriter AuditWriter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.URL.Path == "/v1/health" || c.Request.URL.Path == "/ready" {
			c.Next()
			return
		}

		tokenStr := c.GetHeader("X-Zord-Internal-Token")
		claims, err := VerifyServiceJWT(tokenStr)
		if err != nil {
			// An invalid/forged/expired token means no claim inside it can
			// be trusted, so the denial row records only what's
			// independently known (nothing) -- never a value that might be
			// attacker-controlled garbage.
			_ = auditWriter.WriteAuthzDenialAudit(c.Request.Context(), "", "unknown", "AUTHZ_DENIED", "", "", "", err.Error())
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		c.Set("caller_id", claims.Issuer)
		c.Set("tenant_id", claims.TenantID)
		c.Set("purpose_code", claims.PurposeCode)
		c.Next()
	}
}
