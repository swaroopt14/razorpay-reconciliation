// OUT-01: verify JWT and bind query/header/body tenant_id to token claims.
package auth

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type accessClaims struct {
	TenantID string `json:"tenant_id"`
	UserID   string `json:"user_id"`
	jwt.RegisteredClaims
}

type principal struct {
	tenantID string
}

type contextKey struct{}

var (
	principalKey contextKey
	secretOnce   sync.Once
	secret       []byte
	secretErr    error
)

// InitJWTSigningSecret must run once at startup before protected routes serve traffic.
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

// GinProtect verifies JWT and rejects query/header tenant_id that does not match claims.
func GinProtect() gin.HandlerFunc {
	return func(c *gin.Context) {
		p, err := authenticate(c.Request)
		if err != nil {
			abort(c, http.StatusUnauthorized, "UNAUTHENTICATED", "missing or invalid Authorization token")
			return
		}
		if requested := requestedTenant(c.Request); requested != "" &&
			!strings.EqualFold(strings.TrimSpace(p.tenantID), strings.TrimSpace(requested)) {
			log.Printf("tenant_mismatch route=%s jwt_tenant=%q requested_tenant=%q", c.Request.URL.Path, p.tenantID, requested)
			abort(c, http.StatusForbidden, "TENANT_FORBIDDEN", "requested tenant is not authorised for this principal")
			return
		}
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), principalKey, p))
		c.Next()
	}
}

// EnsureBodyTenant rejects JSON body tenant_id that does not match the verified JWT.
func EnsureBodyTenant(c *gin.Context, bodyTenantID string) bool {
	p, ok := c.Request.Context().Value(principalKey).(principal)
	if !ok {
		abort(c, http.StatusUnauthorized, "UNAUTHENTICATED", "no verified principal on request")
		return false
	}
	bodyTenantID = strings.TrimSpace(bodyTenantID)
	if bodyTenantID != "" && !strings.EqualFold(strings.TrimSpace(p.tenantID), bodyTenantID) {
		log.Printf("tenant_mismatch route=%s jwt_tenant=%q body_tenant=%q", c.Request.URL.Path, p.tenantID, bodyTenantID)
		abort(c, http.StatusForbidden, "TENANT_FORBIDDEN", "requested tenant is not authorised for this principal")
		return false
	}
	return true
}

func authenticate(r *http.Request) (principal, error) {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	const prefix = "Bearer "
	if len(h) <= len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return principal{}, errors.New("missing bearer token")
	}
	token := strings.TrimSpace(h[len(prefix):])
	if token == "" {
		return principal{}, errors.New("empty bearer token")
	}

	claims := &accessClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	}, jwt.WithIssuer(jwtIssuer()))
	if err != nil {
		return principal{}, err
	}
	if claims.TenantID == "" || claims.UserID == "" {
		return principal{}, errors.New("token missing tenant_id or user_id")
	}
	return principal{tenantID: claims.TenantID}, nil
}

func jwtIssuer() string {
	if v := os.Getenv("JWT_ISSUER"); v != "" {
		return v
	}
	return "zord-edge"
}

var tenantHeaders = []string{"X-Tenant-ID", "x-tenant-id", "tenant-id", "tenant_id"}

func requestedTenant(r *http.Request) string {
	for _, h := range tenantHeaders {
		if v := strings.TrimSpace(r.Header.Get(h)); v != "" {
			return v
		}
	}
	return strings.TrimSpace(r.URL.Query().Get("tenant_id"))
}

func abort(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, gin.H{
		"error":   "REQUEST_FAILED",
		"code":    code,
		"message": message,
	})
}
