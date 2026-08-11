package routes

import (
	"zord-prompt-layer/handler"
	plmiddleware "zord-prompt-layer/middleware"

	"github.com/gin-gonic/gin"
)

func Register(router *gin.Engine, healthHandler *handler.HealthHandler, queryHandler *handler.QueryHandler, authCfg plmiddleware.AuthConfig) {
	router.GET("/health", healthHandler.Health)

	protected := router.Group("/")
	protected.Use(plmiddleware.TenantContextMiddleware(authCfg))
	{
		protected.POST("/query", queryHandler.Query)
	}
}
