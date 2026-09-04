package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HealthCheck handles GET /health requests to check service status
func HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"service": "zord-edge",
		"version": "1.0.0",
	})
}
