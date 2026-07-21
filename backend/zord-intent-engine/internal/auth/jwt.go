package auth

import (
	"errors"
	"os"
	"sync"

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
