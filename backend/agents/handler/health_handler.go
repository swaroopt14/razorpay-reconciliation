package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type HealthHandler struct {
	ServiceName string
}

func NewHealthHandler(serviceName string) *HealthHandler {
	return &HealthHandler{ServiceName: serviceName}
}

func (h *HealthHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": h.ServiceName,
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}
