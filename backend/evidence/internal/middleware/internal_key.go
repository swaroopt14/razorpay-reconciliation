package middleware

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

const internalKeyHeader = "X-Internal-Key"

// RequireInternalKey returns a Gin middleware that enforces the presence of a
// correct X-Internal-Key header.  Any request missing the header or carrying
// the wrong value is rejected with 403 before the handler runs.
//
// The key value is never logged; only the caller IP and rejection fact are.
func RequireInternalKey(key string) gin.HandlerFunc {
	return func(c *gin.Context) {
		provided := c.GetHeader(internalKeyHeader)
		if provided == "" {
			log.Printf("internal_key.missing caller=%s path=%s", c.ClientIP(), c.FullPath())
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "missing " + internalKeyHeader + " header",
			})
			return
		}
		if provided != key {
			log.Printf("internal_key.invalid caller=%s path=%s", c.ClientIP(), c.FullPath())
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "invalid " + internalKeyHeader,
			})
			return
		}
		c.Next()
	}
}
