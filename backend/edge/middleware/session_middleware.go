package middleware

import (
	"net/http"
	"time"

	"zord-edge/db"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// SessionActivityMiddleware checks the session's server-side idle/absolute timeouts and
// triggers background rate-limited updates to the session's activity timestamps.
func SessionActivityMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDVal, existsUserID := c.Get("user_id")
		tenantIDVal, existsTenantID := c.Get("tenant_id")
		sessionIDVal, existsSessionID := c.Get("session_id")

		if !existsUserID || !existsTenantID || !existsSessionID {
			c.Next()
			return
		}

		userID := userIDVal.(uuid.UUID)
		tenantID := tenantIDVal.(uuid.UUID)
		sessionID := sessionIDVal.(uuid.UUID)

		// 1. Fetch the session info from the database to enforce server-side validation.
		var (
			revokedAt       *time.Time
			idleExpiresAt   time.Time
			absoluteExpires time.Time
		)

		err := db.DB.QueryRowContext(c.Request.Context(), `
			SELECT revoked_at, idle_expires_at, absolute_expires_at
			FROM auth_refresh_tokens
			WHERE session_id = $1 AND user_id = $2 AND tenant_id = $3
			ORDER BY created_at DESC
			LIMIT 1
		`, sessionID, userID, tenantID).Scan(&revokedAt, &idleExpiresAt, &absoluteExpires)

		if err != nil {
			// If session doesn't exist, block access.
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "SESSION_EXPIRED",
					"message": "Your session is invalid or does not exist",
				},
			})
			return
		}

		if revokedAt != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "SESSION_EXPIRED",
					"message": "Your session has been revoked",
				},
			})
			return
		}

		now := time.Now().UTC()
		if idleExpiresAt.Before(now) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "SESSION_EXPIRED",
					"message": "Your session has expired due to inactivity",
				},
			})
			return
		}

		if absoluteExpires.Before(now) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "SESSION_EXPIRED",
					"message": "Your session has reached its absolute maximum lifetime",
				},
			})
			return
		}

		// 2. Perform rate-limited update of the session activity (non-blocking goroutine).
		// Skip for /v1/session/status — that is a passive poll and must NOT reset the idle timer.
		if c.Request.URL.Path != "/v1/session/status" {
			go func(sID uuid.UUID) {
				// Use background context to ensure this writes even if client closes request.
				_ = services.RecordSessionActivity(c.Request.Context(), db.DB, sID)
			}(sessionID)
		}

		c.Next()
	}
}
