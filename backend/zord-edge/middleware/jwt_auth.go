package middleware

import (
	"net/http"
	"strings"

	"zord-edge/services"

	"github.com/gin-gonic/gin"
)

// JWTAuthenticate validates a Bearer access token (JWT) and sets user/tenant context.
// Use this on user-facing routes (the console). API-key routes keep using Authenticate().
func JWTAuthenticate() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "UNAUTHORIZED", "message": "missing bearer token"},
			})
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		claims, err := services.ParseAccessToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "UNAUTHORIZED", "message": "invalid or expired token"},
			})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("tenant_id", claims.TenantID)
		c.Set("email", claims.Email)
		c.Set("role", claims.Role)
		c.Set("session_id", claims.SessionID)
		c.Next()
	}
}
