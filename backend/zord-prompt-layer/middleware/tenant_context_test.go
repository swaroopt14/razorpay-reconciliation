package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestTenantContextRejectsForgedTenantHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)

	secret := "test-secret"
	token := signedTestToken(t, secret, "83a296f0-7cf7-4b0e-ad3c-adace632f2a8", "2ddec4be-93a3-4d80-b0a2-f9623e8d5ed9")

	router := gin.New()
	router.Use(RequestIDMiddleware())
	router.Use(TenantContextMiddleware(AuthConfig{SigningSecret: secret}))
	router.GET("/protected", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Tenant-ID", "11111111-1111-4111-8111-111111111111")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestTenantContextAcceptsMatchingOptionalHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)

	secret := "test-secret"
	tenantID := "83a296f0-7cf7-4b0e-ad3c-adace632f2a8"
	userID := "2ddec4be-93a3-4d80-b0a2-f9623e8d5ed9"
	token := signedTestToken(t, secret, tenantID, userID)

	router := gin.New()
	router.Use(RequestIDMiddleware())
	router.Use(TenantContextMiddleware(AuthConfig{SigningSecret: secret}))
	router.GET("/protected", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("X-User-ID", userID)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestTenantContextRejectsMissingJWT(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(RequestIDMiddleware())
	router.Use(TenantContextMiddleware(AuthConfig{SigningSecret: "test-secret"}))
	router.GET("/protected", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d body=%s", w.Code, w.Body.String())
	}
}

func signedTestToken(t *testing.T, secret string, tenantID string, userID string) string {
	t.Helper()

	claims := AccessClaims{
		TenantID: tenantID,
		UserID:   userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed signing token: %v", err)
	}
	return s
}
