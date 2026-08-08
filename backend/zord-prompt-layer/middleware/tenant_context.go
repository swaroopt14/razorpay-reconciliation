package middleware

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	TenantIDContextKey = "tenant_id"
	UserIDContextKey   = "user_id"
)

var tenantUUIDRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type AuthConfig struct {
	SigningSecret string
	Issuer        string
	Audience      string
}

type AccessClaims struct {
	TenantID string `json:"tenant_id"`
	UserID   string `json:"user_id"`
	Email    string `json:"email,omitempty"`
	Role     string `json:"role,omitempty"`
	jwt.RegisteredClaims
}

func TenantContextMiddleware(auth AuthConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, err := verifyBearerAccessToken(c.GetHeader("Authorization"), auth)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "unauthorized",
				"details": "Invalid or expired authentication token. Please login again.",
			})
			c.Abort()
			return
		}

		tenantID := strings.ToLower(strings.TrimSpace(claims.TenantID))
		userID := strings.ToLower(strings.TrimSpace(claims.UserID))

		if !tenantUUIDRe.MatchString(tenantID) {
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "forbidden",
				"details": "Invalid tenant context.",
			})
			c.Abort()
			return
		}

		if !tenantUUIDRe.MatchString(userID) {
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "forbidden",
				"details": "Invalid user context.",
			})
			c.Abort()
			return
		}

		if !optionalHeaderMatches(c.GetHeader("X-Tenant-ID"), tenantID) {
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "forbidden",
				"details": "Tenant mismatch with authenticated context.",
			})
			c.Abort()
			return
		}

		if !optionalHeaderMatches(c.GetHeader("X-User-ID"), userID) {
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "forbidden",
				"details": "User mismatch with authenticated context.",
			})
			c.Abort()
			return
		}

		c.Set(TenantIDContextKey, tenantID)
		c.Set(UserIDContextKey, userID)
		c.Next()
	}
}

func verifyBearerAccessToken(authHeader string, auth AuthConfig) (*AccessClaims, error) {
	if strings.TrimSpace(auth.SigningSecret) == "" {
		return nil, errors.New("jwt signing secret is not configured")
	}

	authHeader = strings.TrimSpace(authHeader)
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return nil, errors.New("missing bearer token")
	}

	tokenString := strings.TrimSpace(authHeader[len("Bearer "):])
	if tokenString == "" {
		return nil, errors.New("empty bearer token")
	}

	claims := &AccessClaims{}

	options := []jwt.ParserOption{}
	if strings.TrimSpace(auth.Issuer) != "" {
		options = append(options, jwt.WithIssuer(strings.TrimSpace(auth.Issuer)))
	}
	if strings.TrimSpace(auth.Audience) != "" {
		options = append(options, jwt.WithAudience(strings.TrimSpace(auth.Audience)))
	}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected jwt signing method")
		}
		return []byte(auth.SigningSecret), nil
	}, options...)

	if err != nil {
		return nil, err
	}
	if token == nil || !token.Valid {
		return nil, errors.New("invalid jwt")
	}

	return claims, nil
}

func optionalHeaderMatches(headerValue, verifiedValue string) bool {
	headerValue = strings.ToLower(strings.TrimSpace(headerValue))
	if headerValue == "" {
		return true
	}
	return headerValue == strings.ToLower(strings.TrimSpace(verifiedValue))
}
