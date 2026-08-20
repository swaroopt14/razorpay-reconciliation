package middleware

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxIngestBodyBytes is the default request body cap for JSON / webhook ingest.
const MaxIngestBodyBytes int64 = 1000 * 1024 // 1000 KB

// MaxRequestBodyBytes enforces a request body size limit on the route it is attached to.
func MaxRequestBodyBytes(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > limit {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": fmt.Sprintf("Payload size exceeds maximum allowed limit %d bytes", limit),
				"code":  "PAYLOAD_TOO_LARGE",
			})
			c.Abort()
			return
		}

		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Set("PayloadSize", c.Request.ContentLength)
		c.Next()
	}
}
