package routes

import (
	"github.com/gin-gonic/gin"

	"zord-edge/handler"
	"zord-edge/middleware"
	"zord-edge/validator"
)

func Routes(router *gin.Engine, h *handler.Handler) {
	handler.RegisterPublicAuthRoutes(router)

	public := router.Group("/v1")
	{
		public.GET("/health", handler.HealthCheck)
	}

	// Admin routes (Secured by AdminAuthMiddleware)
	admin := router.Group("/v1/admin")
	admin.Use(middleware.AdminAuthMiddleware())
	{
		admin.POST("/tenantReg", handler.Tenant_Registry)
		admin.GET("/tenants", handler.ListTenants)
		admin.GET("/tenants/:tenant_id", handler.GetTenantByID)
	}

	// Webhook routes
	webhooks := router.Group("/v1/raw/envelopes")
	webhooks.Use(middleware.VerifyWebhookSignature(), middleware.TransportValidation()) //Need to check with sudarshan
	{
		webhooks.POST("/webhooks/:provider/:connectorID", h.WebhookHandler)
	}

	if err := validator.InitSchemaValidator(); err != nil {
		panic("Failed to initialize schema validator: " + err.Error())
	}

	protected := router.Group("/v1")
	protected.Use(
		middleware.Authenticate(),
		//middleware.TraceMiddleware(),
		middleware.TransportValidation(),
	)

	// JSON ingest (needs JSON validation + idempotency header)
	protected.POST(
		"/ingest",
		middleware.ValidateIntentRequest(),
		middleware.GetIdempotencyKey(),
		h.IntentHandler,
	)

	// Bulk ingest (multipart, so no JSON validation, no header idempotency)
	protected.POST(
		"/bulk-ingest",
		h.BulkIntentHandler,
	)

	// Console / JWT-protected routes (e.g. Session check, Session status)
	jwtProtected := router.Group("/v1")
	jwtProtected.Use(
		middleware.JWTAuthenticate(),
		middleware.SessionActivityMiddleware(),
	)
	{
		handler.RegisterSessionRoutes(jwtProtected)
	}
}
