package middleware

import (
	"log/slog"

	"zord-edge/logger"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func GetIdempotencyKey() gin.HandlerFunc {
	return func(context *gin.Context) {
		{
			idempotencyKey := context.GetHeader("X-Idempotency-Key")
			if idempotencyKey == "" {
				idempotencyKey = uuid.Must(uuid.NewV7()).String()
				logger.Log.Debug("generated idempotency key",
					slog.String("idempotency_key", idempotencyKey))
			} else {
				logger.Log.Debug("received idempotency key",
					slog.String("idempotency_key", idempotencyKey))
			}
			context.Set("idempotency_key", idempotencyKey)
			context.Next()

		}
	}
}
