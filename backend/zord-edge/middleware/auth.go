package middleware

import (
	"net/http"
	"strings"

	"zord-edge/db"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
)

// Authenticate accepts either:
//   - a tenant API key in the legacy "prefix.secret" form (two segments), or
//   - a JWT access token issued by /v1/auth/login (three segments).
//
// Either way it sets tenant_id (and, for JWTs, user_id/email/role) on the request context.
func Authenticate() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "UNAUTHORIZED", "message": "missing bearer credentials"},
			})
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")

		// JWTs have three dot-separated segments; legacy API keys have one dot ("prefix.secret").
		if strings.Count(token, ".") == 2 {
			if claims, err := services.ParseAccessToken(token); err == nil {
				var tenantName string
				_ = db.DB.QueryRowContext(c.Request.Context(),
					`SELECT tenant_name FROM tenants WHERE tenant_id = $1`, claims.TenantID,
				).Scan(&tenantName)
				c.Set("tenant_id", claims.TenantID)
				c.Set("tenant_name", tenantName)
				c.Set("user_id", claims.UserID)
				c.Set("email", claims.Email)
				c.Set("role", claims.Role)
				c.Set(contextKeyPrincipalType, PrincipalUserSession)
				c.Next()
				return
			}
		}

		response, err := services.ValidateApiKey(c.Request.Context(), db.DB, token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "UNAUTHORIZED", "message": "invalid credentials"},
			})
			return
		}
		c.Set("tenant_id", response.TenantId)
		c.Set("tenant_name", response.TenantName)
		c.Set(contextKeyPrincipalType, PrincipalTenantAPIKey)
		c.Next()
	}
}
