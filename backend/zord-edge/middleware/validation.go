package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"zord-edge/validator"

	"github.com/gin-gonic/gin"
)

func ValidateIntentRequest() gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Failed to read request body",
				"code":  "INVALID_REQUEST_BODY",
			})
			c.Abort()
			return
		}

		var rawJSON json.RawMessage
		if err := json.Unmarshal(body, &rawJSON); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid JSON format",
				"code":  "INVALID_JSON",
			})
			c.Abort()
			return
		}

		if err := validator.ValidateIntentRequestJSON(rawJSON); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Request validation failed",
				"code":    "VALIDATION_ERROR",
				"details": err.Error(),
			})
			c.Abort()
			return
		}

		payloadSize := len(body)

		c.Set("raw_payload", body)
		c.Set("payload_size", payloadSize)

		c.Request.Body = io.NopCloser(bytes.NewBuffer(body))
		c.Next()
	}
}
