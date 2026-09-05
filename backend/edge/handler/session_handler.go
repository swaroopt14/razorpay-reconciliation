package handler

import (
	"net/http"
	"time"

	"zord-edge/db"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RegisterSessionRoutes registers the endpoints for managing sessions.
func RegisterSessionRoutes(router *gin.RouterGroup) {
	router.GET("/session/status", GetSessionStatus)
	router.POST("/session/refresh", RefreshSessionEndpoint)
	router.POST("/session/logout-all", LogoutAllSessions)
}

func GetSessionStatus(c *gin.Context) {
	sessionIDVal, existsSessionID := c.Get("session_id")
	if !existsSessionID {
		c.JSON(http.StatusUnauthorized, gin.H{"code": "UNAUTHORIZED", "message": "missing session context"})
		return
	}
	sessionID := sessionIDVal.(uuid.UUID)

	var (
		revokedAt       *time.Time
		idleExpiresAt   time.Time
		absoluteExpires time.Time
	)

	err := db.DB.QueryRowContext(c.Request.Context(), `
		SELECT revoked_at, idle_expires_at, absolute_expires_at
		FROM auth_refresh_tokens
		WHERE session_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, sessionID).Scan(&revokedAt, &idleExpiresAt, &absoluteExpires)

	if err != nil || revokedAt != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": "SESSION_EXPIRED", "message": "Session is expired or invalid"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id":          sessionID.String(),
		"idle_expires_at":     idleExpiresAt.UTC().Format(time.RFC3339),
		"absolute_expires_at": absoluteExpires.UTC().Format(time.RFC3339),
	})
}

func RefreshSessionEndpoint(c *gin.Context) {
	// Accept refresh token string either in JSON body or from standard refresh flow
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "REFRESH_TOKEN_REQUIRED", "message": err.Error()})
		return
	}

	bundle, err := services.RefreshSession(
		c.Request.Context(), db.DB,
		req.RefreshToken,
		c.ClientIP(), c.Request.UserAgent(),
	)
	if err != nil {
		writeAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, toEnvelope(bundle))
}

func LogoutAllSessions(c *gin.Context) {
	userIDVal, existsUserID := c.Get("user_id")
	tenantIDVal, existsTenantID := c.Get("tenant_id")
	if !existsUserID || !existsTenantID {
		c.JSON(http.StatusUnauthorized, gin.H{"code": "UNAUTHORIZED", "message": "missing auth context"})
		return
	}

	userID := userIDVal.(uuid.UUID)
	tenantID := tenantIDVal.(uuid.UUID)

	err := services.RevokeAllUserSessions(c.Request.Context(), db.DB, tenantID, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "INTERNAL", "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
