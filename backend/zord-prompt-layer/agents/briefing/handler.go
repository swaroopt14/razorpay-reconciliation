package briefing

import (
	"net/http"

	plmiddleware "zord-prompt-layer/middleware"
	"zord-prompt-layer/tools"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	Client      *tools.OutcomeClient
	ConnectorID string
	Rewrite     Rewriter
}

func NewHandler(c *tools.OutcomeClient, connectorID string, rewrite Rewriter) *Handler {
	return &Handler{Client: c, ConnectorID: connectorID, Rewrite: rewrite}
}

func (h *Handler) Create(c *gin.Context) {
	ctxTenant, ok := c.Get(plmiddleware.TenantIDContextKey)
	if !ok {
		plmiddleware.SafeError(c, http.StatusUnauthorized, "unauthorized", "Missing tenant context.")
		return
	}
	tenantID, _ := ctxTenant.(string)
	var body struct {
		TenantID    string `json:"tenant_id"`
		ConnectorID string `json:"connector_id"`
		CloseRunID  string `json:"close_run_id"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.TenantID == "" {
		body.TenantID = tenantID
	}
	if body.ConnectorID == "" {
		body.ConnectorID = h.ConnectorID
	}
	rep := Report{}
	if h.Client != nil {
		sum, _ := h.Client.GetReconSummary(body.TenantID, body.ConnectorID)
		rep.Records = asInt(sum["scored_count"])
		rep.Matched = asInt(sum["matched_count"])
		rep.UnresolvedExposureMinor = asInt64(sum["exposure_minor"])
		if rep.Records > 0 {
			rep.MatchRate = float64(rep.Matched) / float64(rep.Records)
			rep.Exceptions = rep.Records - rep.Matched
		}
	}
	c.JSON(http.StatusOK, Write(rep, h.Rewrite))
}

func asInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	default:
		return 0
	}
}

func asInt64(v any) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int:
		return int64(n)
	case int64:
		return n
	default:
		return 0
	}
}
