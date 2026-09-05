package finance

import (
	"net/http"
	"strings"

	"zord-evidence/internal/middleware"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	Service *Service
}

func (h *Handler) tenant(c *gin.Context) (string, bool) {
	tid := middleware.GetTenantID(c)
	if tid == "" {
		tid = strings.TrimSpace(c.Query("tenant_id"))
	}
	if tid == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "tenant_id required"})
		return "", false
	}
	q := strings.TrimSpace(c.Query("tenant_id"))
	if q != "" && q != tid {
		c.JSON(http.StatusForbidden, gin.H{"error": "tenant_isolation"})
		return "", false
	}
	return tid, true
}

func (h *Handler) Ingest(c *gin.Context) {
	var ev DecisionEvent
	if err := c.ShouldBindJSON(&ev); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_payload"})
		return
	}
	list, err := h.Service.IngestDecision(c.Request.Context(), ev)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"evidence": list})
}

func (h *Handler) ListEntity(c *gin.Context) {
	tid, ok := h.tenant(c)
	if !ok {
		return
	}
	list, err := h.Service.GetEntity(c.Request.Context(), tid, c.Param("entityType"), c.Param("entityID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"entity_type": c.Param("entityType"), "entity_id": c.Param("entityID"), "evidence": list})
}

func (h *Handler) GetItem(c *gin.Context) {
	tid, ok := h.tenant(c)
	if !ok {
		return
	}
	ev, snap, found, err := h.Service.GetEvidence(c.Request.Context(), tid, c.Param("evidenceID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"evidence": ev, "snapshot": snap})
}

func (h *Handler) Verify(c *gin.Context) {
	tid, ok := h.tenant(c)
	if !ok {
		return
	}
	res, err := h.Service.Verify(c.Request.Context(), tid, c.Param("evidenceID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *Handler) GetPack(c *gin.Context) {
	tid, ok := h.tenant(c)
	if !ok {
		return
	}
	pack, found, err := h.Service.GetPack(c.Request.Context(), tid, c.Param("investigationID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, pack)
}

func (h *Handler) GetAudit(c *gin.Context) {
	tid, ok := h.tenant(c)
	if !ok {
		return
	}
	list, err := h.Service.GetAudit(c.Request.Context(), tid, c.Param("entityType"), c.Param("entityID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"audit": list})
}

func (h *Handler) GetDecisions(c *gin.Context) {
	tid, ok := h.tenant(c)
	if !ok {
		return
	}
	list, err := h.Service.GetDecisions(c.Request.Context(), tid, c.Param("entityType"), c.Param("entityID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"decisions": list})
}

func (h *Handler) GetCalculations(c *gin.Context) {
	tid, ok := h.tenant(c)
	if !ok {
		return
	}
	list, err := h.Service.GetCalculations(c.Request.Context(), tid, c.Param("entityType"), c.Param("entityID"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"calculations": list})
}

func RegisterRoutes(r *gin.Engine, h *Handler, jwtSecret, internalKey string) {
	internal := r.Group("/internal/finance-evidence")
	if internalKey != "" {
		internal.Use(middleware.RequireInternalKey(internalKey))
	}
	internal.POST("/ingest", h.Ingest)
	internal.GET("/entities/:entityType/:entityID", h.ListEntity)
	internal.GET("/entities/:entityType/:entityID/audit", h.GetAudit)
	internal.GET("/entities/:entityType/:entityID/decisions", h.GetDecisions)
	internal.GET("/entities/:entityType/:entityID/calculations", h.GetCalculations)
	internal.GET("/items/:evidenceID", h.GetItem)
	internal.POST("/items/:evidenceID/verify", h.Verify)
	internal.GET("/packs/:investigationID", h.GetPack)

	v1 := r.Group("/v1/finance-evidence")
	if jwtSecret != "" {
		v1.Use(middleware.RequireAuth(jwtSecret))
	}
	v1.GET("/entities/:entityType/:entityID", h.ListEntity)
	v1.GET("/entities/:entityType/:entityID/audit", h.GetAudit)
	v1.GET("/entities/:entityType/:entityID/decisions", h.GetDecisions)
	v1.GET("/entities/:entityType/:entityID/calculations", h.GetCalculations)
	v1.GET("/items/:evidenceID", h.GetItem)
	v1.POST("/items/:evidenceID/verify", h.Verify)
	v1.GET("/packs/:investigationID", h.GetPack)
}
