package operator

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"zord-relay/services"
)

type FailureHandler struct {
	repo          *services.PublishFailureRepo
	replayService *services.FailureReplayService
	authToken     string
}

func NewFailureHandler(repo *services.PublishFailureRepo, replayService *services.FailureReplayService, authToken string) *FailureHandler {
	return &FailureHandler{
		repo:          repo,
		replayService: replayService,
		authToken:     authToken,
	}
}

func (h *FailureHandler) Register(router *gin.RouterGroup) {
	failures := router.Group("/publish-failures")
	{
		failures.GET("", h.List)
		failures.GET("/:id", h.Detail)
		failures.POST("/:id/replay", h.Replay)
	}
}

func (h *FailureHandler) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("X-Relay-Token")
		if token == "" || token != h.authToken {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func (h *FailureHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	filter := services.ListFilter{
		SourceService: c.Query("source_service"),
		ReplayStatus:  c.Query("replay_status"),
		FailureClass:  c.Query("failure_class"),
		TenantID:      c.Query("tenant_id"),
		Limit:         limit,
		Offset:        offset,
	}

	failures, err := h.repo.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, failures)
}

func (h *FailureHandler) Detail(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	detail, err := h.repo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if detail == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	c.JSON(http.StatusOK, detail)
}

type replayRequest struct {
	OperatorID string `json:"operator_id" binding:"required"`
	Reason     string `json:"reason" binding:"required"`
}

func (h *FailureHandler) Replay(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req replayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err = h.replayService.Replay(c.Request.Context(), id, req.OperatorID, req.Reason)
	if err != nil {
		if err == services.ErrAlreadyReplayed {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		if err == services.ErrHashMismatch {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusAccepted)
}
