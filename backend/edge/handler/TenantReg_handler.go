package handler

import (
	"log/slog"
	"net/http"

	"zord-edge/db"
	"zord-edge/logger"
	"zord-edge/model"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
)

func Tenant_Registry(context *gin.Context) {
	var req model.MerchantRequest
	err := context.ShouldBindJSON(&req)
	logger.Log.Debug("tenant registration request received",
		slog.String("name", req.Name))
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"Message": "Invalid Merchent Name", "Error": err})
		return
	}
	TenantId, FullApiKey, err := services.TenantReg(context.Request.Context(), db.DB, req.Name)
	if err != nil {
		logger.Log.Error("tenant registration failed",
			slog.String("name", req.Name),
			slog.String("error", err.Error()))
		context.JSON(http.StatusInternalServerError, gin.H{
			"error":   "tenant registration failed",
			"details": err.Error(), // TEMPORARY for debugging
		})
		return
	}
	logger.Log.Info("tenant registered successfully",
		slog.String("tenant_id", TenantId.String()),
		slog.String("name", req.Name))
	context.JSON(http.StatusCreated, gin.H{"Message": "Merchent Registered",
		"TenantId": TenantId,
		"APIKEY":   FullApiKey})
}
