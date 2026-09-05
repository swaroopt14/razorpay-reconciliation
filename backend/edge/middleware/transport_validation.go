package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

var allowedContentTypes = map[string]bool{
	"application/json":    true,
	"text/csv":            true,
	"multipart/form-data": true,
}

func TransportValidation() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Content-Type Check
		contentType := c.GetHeader("Content-Type")
		baseContentType := strings.Split(contentType, ";")[0]
		baseContentType = strings.TrimSpace(baseContentType)

		if baseContentType == "" || !allowedContentTypes[baseContentType] {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{
				"error": "Unsupported Content-Type. Allowed types: application/json, text/csv, multipart/form-data",
				"code":  "UNSUPPORTED_MEDIA_TYPE",
			})
			c.Abort()
			return
		}
		SourceType := c.GetHeader("X-Zord-Source-Type")
		if SourceType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"Error": "X-Zord-Source-Type header is required"})
			c.Abort()
			return
		}
		validSources := map[string]bool{
			"REST":        true,
			"CSV":         true,
			"PROMPT":      true,
			"WEBHOOK":     true,
			"FILE_UPLOAD": true,
		}
		if !validSources[SourceType] {
			c.JSON(http.StatusBadRequest, gin.H{"Error": "Invalid Source-Type"})
			c.Abort()
			return
		}

		sourceClass := c.GetHeader("X-Zord-Source-Class")
		if sourceClass == "" {
			c.JSON(http.StatusBadRequest, gin.H{"Error": "X-Zord-Source-Class header is required"})
			c.Abort()
			return
		}

		validSourceClasses := map[string]bool{
			"INTENT":   true,
			"OUTCOME":  true,
			"FILE":     true,
			"CALLBACK": true,
		}

		if !validSourceClasses[sourceClass] {
			c.JSON(http.StatusBadRequest, gin.H{"Error": "Invalid Source-Class"})
			c.Abort()
			return
		}

		c.Set("source_type", SourceType)
		c.Set("source_class", sourceClass)

		c.Next()
	}
}
