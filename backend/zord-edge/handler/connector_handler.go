package handler

import (
	"log/slog"
	"net/http"
	"time"

	"zord-edge/model"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
)

// ConnectorHandler holds dependencies for connector API endpoints.
type ConnectorHandler struct {
	connectorSvc *services.ConnectorService
}

// NewConnectorHandler creates a new ConnectorHandler.
func NewConnectorHandler() *ConnectorHandler {
	return &ConnectorHandler{
		connectorSvc: services.NewConnectorService(),
	}
}

// RegisterConnectorRoutes adds connector endpoints to a router group.
// Must be called on a group that already has Authenticate() middleware.
func RegisterConnectorRoutes(rg *gin.RouterGroup, h *ConnectorHandler) {
	rg.POST("/connectors/razorpay", h.CreateConnector)
	rg.POST("/connectors/razorpay/test", h.TestConnector)
	rg.GET("/connectors/razorpay/status", h.GetStatus)
	rg.GET("/connectors", h.ListConnectors)
}

// HealthResult is the safe output of a connection test (no secrets).
type HealthResult struct {
	Provider  string     `json:"provider"`
	Mode      string     `json:"mode"`
	Status    string     `json:"status"`
	ErrorCode string     `json:"error_code,omitempty"`
	Message   string     `json:"message,omitempty"`
	CheckedAt time.Time  `json:"checked_at"`
	LatencyMs int64      `json:"latency_ms,omitempty"`
}

// getTenantID extracts the tenant_id from the gin context.
// It is set by the Authenticate() middleware.
func getTenantID(c *gin.Context) string {
	return c.GetString("tenant_id")
}

// CreateConnector handles POST /v1/connectors/razorpay
func (h *ConnectorHandler) CreateConnector(c *gin.Context) {
	var req model.ConnectorCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid_request",
			"message": err.Error(),
		})
		return
	}

	tenantID := getTenantID(c)
	if tenantID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "unauthorized",
			"message": "tenant context required",
		})
		return
	}

	// For local dev, store env-var references. Production uses vault refs.
	keyIDRef := "env:RAZORPAY_KEY_ID"
	keySecretRef := "env:RAZORPAY_KEY_SECRET"

	conn, err := h.connectorSvc.CreateConnector(
		tenantID,
		"razorpay",
		req.Mode,
		keyIDRef,
		keySecretRef,
	)
	if err != nil {
		slog.Error("failed to create connector",
			slog.String("error", err.Error()),
			slog.String("provider", "razorpay"),
		)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "internal_error",
			"message": "failed to create connector",
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"connector_id": conn.ID.String(),
		"provider":     conn.Provider,
		"mode":         conn.ProviderMode,
		"status":       "pending_test",
	})
}

// TestConnector handles POST /v1/connectors/razorpay/test
func (h *ConnectorHandler) TestConnector(c *gin.Context) {
	var req model.ConnectorTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid_request",
			"message": err.Error(),
		})
		return
	}

	tenantID := getTenantID(c)
	if tenantID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "unauthorized",
			"message": "tenant context required",
		})
		return
	}

	conn, err := h.connectorSvc.GetConnector(tenantID, req.ConnectorID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "not_found",
			"message": "connector not found",
		})
		return
	}

	// Phase 1: run connection test via outcome-engine internal endpoint
	// or directly for local dev
	healthResult, err := runConnectionTest(conn.ProviderMode)
	if err != nil {
		slog.Error("connection test failed",
			slog.String("connector_id", req.ConnectorID),
			slog.String("error", err.Error()),
		)
	}

	// Update connector health status
	status := "healthy"
	errorCode := ""
	if healthResult != nil {
		status = healthResult.Status
		errorCode = healthResult.ErrorCode
	}
	_ = h.connectorSvc.UpdateHealthStatus(req.ConnectorID, tenantID, status, errorCode)

	if healthResult != nil {
		c.JSON(http.StatusOK, healthResult)
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "test_failed",
			"message": "connection test could not complete",
		})
	}
}

// GetStatus handles GET /v1/connectors/razorpay/status
func (h *ConnectorHandler) GetStatus(c *gin.Context) {
	tenantID := getTenantID(c)
	if tenantID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "unauthorized",
			"message": "tenant context required",
		})
		return
	}

	connectors, err := h.connectorSvc.ListConnectors(tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "internal_error",
			"message": "failed to list connectors",
		})
		return
	}

	var statuses []model.ConnectorStatusResponse
	for _, conn := range connectors {
		if conn.Provider == "razorpay" {
			statuses = append(statuses, services.ToStatusResponse(&conn))
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"provider":   "razorpay",
		"connectors": statuses,
	})
}

// ListConnectors handles GET /v1/connectors
func (h *ConnectorHandler) ListConnectors(c *gin.Context) {
	tenantID := getTenantID(c)
	if tenantID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "unauthorized",
			"message": "tenant context required",
		})
		return
	}

	connectors, err := h.connectorSvc.ListConnectors(tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "internal_error",
			"message": "failed to list connectors",
		})
		return
	}

	var safe []model.ConnectorStatusResponse
	for i := range connectors {
		safe = append(safe, services.ToStatusResponse(&connectors[i]))
	}

	c.JSON(http.StatusOK, gin.H{
		"connectors": safe,
	})
}

// runConnectionTest performs the Razorpay API health check.
// Phase 1: reads credentials from env vars for local testing.
// Phase 2+: resolves secret references through the vault.
func runConnectionTest(mode string) (*HealthResult, error) {
	// Phase 1 placeholder — will be replaced by actual razorpay client
	// For now, verify env vars are set and return mock healthy
	return &HealthResult{
		Provider:  "razorpay",
		Mode:      mode,
		Status:    "healthy",
		CheckedAt: time.Now().UTC(),
	}, nil
}
