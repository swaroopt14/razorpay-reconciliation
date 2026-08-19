package audittests

// TOK-04: "Use tenant- and purpose-scoped service authorization for
// tokenize/detokenize." Unit tests against the REAL
// serviceauth.VerifyServiceJWTWithSecret -- signature, expiry, issuer, and
// purpose-code-scope checks -- independent of the process-wide sync.Once
// signing secret (each test mints/signs its own token with its own secret).
//
// Run with:
//   go test ./testing/... -run TestTOK04_ -v

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"zord-token-enclave/internal/serviceauth"
)

var tok04Secret = []byte("tok04-test-signing-secret")

func mintTok04Token(t *testing.T, secret []byte, issuer, tenantID, purposeCode string, ttl time.Duration) string {
	t.Helper()
	claims := serviceauth.ServiceClaims{
		TenantID:    tenantID,
		PurposeCode: purposeCode,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}
	return tok
}

// TestTOK04_ValidTokenVerifiesAndReturnsClaims is the baseline positive case.
func TestTOK04_ValidTokenVerifiesAndReturnsClaims(t *testing.T) {
	tok := mintTok04Token(t, tok04Secret, "zord-intent-engine", "tenant-A", "INTENT_PROCESSING", serviceauth.DefaultTokenTTL)

	claims, err := serviceauth.VerifyServiceJWTWithSecret(tok, tok04Secret)
	if err != nil {
		t.Fatalf("VerifyServiceJWTWithSecret() error = %v", err)
	}
	if claims.Issuer != "zord-intent-engine" || claims.TenantID != "tenant-A" || claims.PurposeCode != "INTENT_PROCESSING" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

// TestTOK04_WrongSigningSecretIsRejected is the "caller spoof" scenario:
// someone without the real shared secret cannot forge a valid token, even
// claiming a legitimate issuer name.
func TestTOK04_WrongSigningSecretIsRejected(t *testing.T) {
	tok := mintTok04Token(t, []byte("attacker-does-not-know-the-real-secret"), "zord-intent-engine", "tenant-A", "INTENT_PROCESSING", serviceauth.DefaultTokenTTL)

	if _, err := serviceauth.VerifyServiceJWTWithSecret(tok, tok04Secret); err == nil {
		t.Fatal("VerifyServiceJWTWithSecret() with a forged signature succeeded, want an error")
	}
}

// TestTOK04_ExpiredTokenIsRejected proves a leaked/replayed old token can't
// be reused indefinitely.
func TestTOK04_ExpiredTokenIsRejected(t *testing.T) {
	tok := mintTok04Token(t, tok04Secret, "zord-intent-engine", "tenant-A", "INTENT_PROCESSING", -1*time.Second)

	if _, err := serviceauth.VerifyServiceJWTWithSecret(tok, tok04Secret); err == nil {
		t.Fatal("VerifyServiceJWTWithSecret() with an expired token succeeded, want an error")
	}
}

// TestTOK04_UnknownIssuerIsRejected: a validly-signed token (same secret)
// but an issuer never granted any purpose scope at all.
func TestTOK04_UnknownIssuerIsRejected(t *testing.T) {
	tok := mintTok04Token(t, tok04Secret, "some-random-service", "tenant-A", "INTENT_PROCESSING", serviceauth.DefaultTokenTTL)

	if _, err := serviceauth.VerifyServiceJWTWithSecret(tok, tok04Secret); err == nil {
		t.Fatal("VerifyServiceJWTWithSecret() with an unknown issuer succeeded, want an error")
	}
}

// TestTOK04_PurposeCodeNotAllowedForIssuerIsRejected: a validly-signed
// token from a KNOWN issuer, but claiming a purpose that issuer is not
// allowed to use -- defense in depth: the enclave enforces its own policy
// on top of whatever the issuer claims about itself.
func TestTOK04_PurposeCodeNotAllowedForIssuerIsRejected(t *testing.T) {
	tok := mintTok04Token(t, tok04Secret, "zord-intent-engine", "tenant-A", "SOME_OTHER_PURPOSE", serviceauth.DefaultTokenTTL)

	if _, err := serviceauth.VerifyServiceJWTWithSecret(tok, tok04Secret); err == nil {
		t.Fatal("VerifyServiceJWTWithSecret() with a disallowed purpose_code succeeded, want an error")
	}
}

// TestTOK04_MissingTenantIDClaimIsRejected: a validly-signed, correctly-
// issued token that's simply missing its tenant scope entirely.
func TestTOK04_MissingTenantIDClaimIsRejected(t *testing.T) {
	tok := mintTok04Token(t, tok04Secret, "zord-intent-engine", "", "INTENT_PROCESSING", serviceauth.DefaultTokenTTL)

	if _, err := serviceauth.VerifyServiceJWTWithSecret(tok, tok04Secret); err == nil {
		t.Fatal("VerifyServiceJWTWithSecret() with an empty tenant_id claim succeeded, want an error")
	}
}

// TestTOK04_EmptyTokenIsRejected covers the "no token at all" case
// (missing X-Zord-Internal-Token header).
func TestTOK04_EmptyTokenIsRejected(t *testing.T) {
	if _, err := serviceauth.VerifyServiceJWTWithSecret("", tok04Secret); err == nil {
		t.Fatal("VerifyServiceJWTWithSecret(\"\") succeeded, want an error")
	}
}

// TestTOK04_NoneAlgorithmIsRejected: the classic JWT "alg=none" forgery
// attempt (or any non-HMAC algorithm) must be rejected outright, not
// silently accepted because a signature happened to be absent/valid-shaped.
func TestTOK04_NoneAlgorithmIsRejected(t *testing.T) {
	claims := serviceauth.ServiceClaims{
		TenantID:    "tenant-A",
		PurposeCode: "INTENT_PROCESSING",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "zord-intent-engine",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(serviceauth.DefaultTokenTTL)),
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}

	if _, err := serviceauth.VerifyServiceJWTWithSecret(tok, tok04Secret); err == nil {
		t.Fatal("VerifyServiceJWTWithSecret() with alg=none succeeded, want an error")
	}
}
