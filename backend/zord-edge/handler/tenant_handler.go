package handler

import (
	"net/http"
	"strconv"

	"zord-edge/db"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
)

// ListTenants handles GET /v1/tenants
//
// Query params (all optional):
//   - page      : page number (default 1)
//   - page_size : items per page (default 50, max 100)
//   - status    : filter by "ACTIVE" or "DISABLED"
//
// Why strconv.Atoi with DefaultQuery: Gin gives us the query param as a string.
// We convert to int and use sensible defaults if missing or invalid.
// The max 100 limit prevents a frontend bug or attack from dumping the entire table.

func ListTenants(c *gin.Context) {
	// Parse pagination params with defaults
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}

	pageSize, err := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if err != nil || pageSize < 1 {
		pageSize = 50
	}
	if pageSize > 100 {
		pageSize = 100
	}

	// Optional status filter
	status := c.Query("status") // "" if not provided

	// Call service layer (does the actual DB query)
	result, err := services.ListTenants(c.Request.Context(), db.DB, page, pageSize, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch tenants",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetTenantByID handles GET /v1/tenants/:tenant_id
//
// Why we check for nil separately: The service returns nil when no tenant is found
// (sql.ErrNoRows). This lets us send a clean 404 instead of a generic 500.

func GetTenantByID(c *gin.Context) {
	tenantID := c.Param("tenant_id")

	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "tenant_id is required",
		})
		return
	}

	tenant, err := services.GetTenantByID(c.Request.Context(), db.DB, tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch tenant",
			"details": err.Error(),
		})
		return
	}

	if tenant == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Tenant not found",
		})
		return
	}

	c.JSON(http.StatusOK, tenant)
}
