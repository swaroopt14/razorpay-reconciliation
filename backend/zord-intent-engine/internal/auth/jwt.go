package auth

import (
	"errors"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AccessClaims mirrors the access-token shape zord-edge issues
// (backend/zord-edge/services/jwt_service.go's AccessClaims) and Kong
// validates at the gateway (iss + exp, HS256). zord-intent-engine performs
// its own independent verification rather than trusting a claim Kong might
// pass through, since Kong's OSS jwt plugin does not forward decoded claims
// to the upstream service — only the original Authorization header.
type AccessClaims struct {
	TenantID  string `json:"tenant_id"`
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	SessionID string `json:"session_id"`
	jwt.RegisteredClaims
}

var (
	secretOnce sync.Once
	secret     []byte
	secretErr  error
)

// InitJWTSigningSecret loads the HS256 shared secret used to verify access
// tokens. Must be called once during startup, before RequireAuth serves any
// request. Returns an error if JWT_SIGNING_SECRET is unset — this is a
// release-blocking dependency (R-01), not an optional feature, so callers
// should fail startup rather than run with authentication silently disabled.
func InitJWTSigningSecret() error {
	secretOnce.Do(func() {
		v := os.Getenv("JWT_SIGNING_SECRET")
		if v == "" {
			secretErr = errors.New("JWT_SIGNING_SECRET environment variable is required")
			return
		}
		secret = []byte(v)
	})
	return secretErr
}

func issuer() string {
	if v := os.Getenv("JWT_ISSUER"); v != "" {
		return v
	}
	return "zord-edge"
}

// verifyAccessToken parses and verifies tokenStr, checking HMAC signature,
// issuer and expiry. Audience is intentionally not enforced here: Kong's
// gateway-level jwt plugin (kubernetes/api-gateway/kong/configmap.yaml) only
// verifies "exp" and "iss" for these routes today, so requiring audience
// here as well would reject tokens Kong itself already accepts.
func verifyAccessToken(tokenStr string) (*AccessClaims, error) {
	if len(secret) == 0 {
		return nil, errors.New("JWT signing secret not initialized")
	}
	claims := &AccessClaims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	}, jwt.WithIssuer(issuer()))
	if err != nil {
		return nil, err
	}
	if claims.TenantID == "" || claims.UserID == "" {
		return nil, errors.New("token missing required tenant_id/user_id claims")
	}
	return claims, nil
}

// ---------------------------------------------------------------------------
// Scoped service JWT (TOK-04: "Use tenant- and purpose-scoped service
// authorization for tokenize/detokenize"). A SEPARATE trust domain from the
// user-session AccessClaims above -- its own secret, its own audience --
// minted fresh per outbound call to zord-token-enclave rather than a single
// long-lived shared secret every caller used identically. Verified on the
// enclave side by internal/serviceauth.VerifyServiceJWT (zord-token-enclave
// repo) -- claim shape (tenant_id/purpose_code + RegisteredClaims.Issuer)
// must match that verifier exactly.
// ---------------------------------------------------------------------------

// ServiceClaims mirrors zord-token-enclave's internal/serviceauth.ServiceClaims.
type ServiceClaims struct {
	TenantID    string `json:"tenant_id"`
	PurposeCode string `json:"purpose_code"`
	jwt.RegisteredClaims
}

// ServiceTokenTTL matches zord-token-enclave's serviceauth.DefaultTokenTTL --
// short enough to sharply limit replay value if a token ever leaks (e.g.
// into logs), long enough to comfortably cover callEnclaveTokenize's own
// 3-attempt retry budget.
const ServiceTokenTTL = 60 * time.Second

// serviceIssuer identifies this service to the enclave's issuer allow-list.
const serviceIssuer = "zord-intent-engine"

var (
	serviceSecretOnce sync.Once
	serviceSecret     []byte
	serviceSecretErr  error
)

// InitServiceJWTSigningSecret loads the HS256 shared secret used to mint
// service JWTs for calls to zord-token-enclave. Must be called once during
// startup -- a missing secret is release-blocking (the enclave will reject
// every tokenize call without it), not an optional feature, so callers
// should fail startup rather than run with every outbound call doomed to a
// 401.
func InitServiceJWTSigningSecret() error {
	serviceSecretOnce.Do(func() {
		v := os.Getenv("SERVICE_JWT_SIGNING_SECRET")
		if v == "" {
			serviceSecretErr = errors.New("SERVICE_JWT_SIGNING_SECRET environment variable is required")
			return
		}
		serviceSecret = []byte(v)
	})
	return serviceSecretErr
}

// MintServiceToken signs a short-lived, single-purpose credential scoping
// this specific outbound call to exactly one tenant/purpose_code -- the
// enclave derives caller/tenant/purpose from THIS claim, never from
// whatever the request body says (TOK-04's "derive caller and allowed
// tenant/purpose from verified claims; ignore body caller").
func MintServiceToken(tenantID, purposeCode string) (string, error) {
	if len(serviceSecret) == 0 {
		return "", errors.New("service JWT signing secret not initialized")
	}
	claims := ServiceClaims{
		TenantID:    tenantID,
		PurposeCode: purposeCode,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    serviceIssuer,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ServiceTokenTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(serviceSecret)
}
