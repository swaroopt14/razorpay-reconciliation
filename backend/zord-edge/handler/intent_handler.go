package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"zord-edge/db"
	"zord-edge/model"
	"zord-edge/services"
	"zord-edge/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *Handler) IntentHandler(context *gin.Context) {

	tenantID := context.MustGet("tenant_id").(uuid.UUID)
	idempotencyKey := context.GetString("idempotency_key")

	rawPayloadAny, ok := context.Get("raw_payload")
	if !ok {
		context.JSON(http.StatusBadRequest, gin.H{"error": "raw_payload missing"})
		return
	}
	rawPayload := rawPayloadAny.([]byte)

	// Compute fingerprint: Hash(payload + idempotencyKey + tenantID)
	fingerprintInput := append(rawPayload, []byte(idempotencyKey+tenantID.String())...)
	fingerprintSum := sha256.Sum256(fingerprintInput)
	fingerprint := hex.EncodeToString(fingerprintSum[:])

	rawIntent := model.RawIntentMessage{
		TenantID:           tenantID.String(),
		IdempotencyKey:     idempotencyKey,
		Payload:            rawPayload,
		RequestFingerprint: fingerprint,
	}

	reqCtx := context.Request.Context()

	id, err := services.PersistIdempotency(reqCtx, rawIntent, db.DB)
	if err != nil {
		if errors.Is(err, services.ErrFingerprintMismatch) {
			context.JSON(http.StatusBadRequest, gin.H{
				"IdempotencyKey": idempotencyKey,
				"ErrorCode":      "IDEMPOTENCY_CONFLICT",
				"ErrorMsg":       "IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD",
				"HttpStatus":     http.StatusBadRequest,
			})
			return
		}
		if errors.Is(err, services.ErrIdempotencyInFlight) {
			context.JSON(http.StatusConflict, gin.H{
				"ErrorCode":  "IDEMPOTENCY_IN_FLIGHT",
				"ErrorMsg":   "request with this idempotency key is already being processed",
				"HttpStatus": http.StatusConflict,
			})
			return
		}
		log.Printf("Error persisting idempotency key: %v", err)
		context.JSON(http.StatusInternalServerError, gin.H{
			"ErrorCode":  "INTERNAL_SERVER_ERROR",
			"ErrorMsg":   "Failed to persist idempotency key.",
			"HttpStatus": http.StatusInternalServerError,
		})
		return
	}
	if id != uuid.Nil {
		log.Printf("Duplicate idempotency key detected for tenant_id=%s, idempotency_key=%s, Envelope_Id=%s", rawIntent.TenantID, rawIntent.IdempotencyKey, id)
		context.JSON(http.StatusConflict, gin.H{
			"ErrorCode":  "DUPLICATE_IDEMPOTENCY_KEY",
			"ErrorMsg":   "request already processed",
			"EnvelopeID": id.String(),
		})
		return
	}

	claimActive := rawIntent.IdempotencyKey != ""
	ingestOK := false
	defer func() {
		if claimActive && !ingestOK {
			services.ReleaseIdempotencyClaim(reqCtx, db.DB, rawIntent.TenantID, rawIntent.IdempotencyKey, fingerprint)
		}
	}()

	//traceID := context.GetString("trace_id")
	traceID := uuid.Must(uuid.NewV7()).String()
	payloadSize := len(rawPayload)
	contentType := context.ContentType()
	sourceType := context.GetString("source_type")
	sourceSystem := context.GetHeader("X-Zord-Source-System")
	if sourceSystem == "" {
		sourceSystem = "UNKNOWN"
	}
	tenantName := context.GetString("tenant_name")

	envelopeID := uuid.Must(uuid.NewV7()).String()
	receivedAt := time.Now().UTC()
	// A single-intent submission has no separate "file" artifact — it is its
	// own artifact, so we mint one id per request (mirrors bulk file-level ingest).
	artifactID := uuid.Must(uuid.NewV7()).String()
	artifactVersionID := "ART_V1"

	headersBytes, _ := json.Marshal(context.Request.Header)
	headersHashSum := sha256.Sum256(headersBytes)
	headersHash := headersHashSum[:]

	encryptedPayload, err := vault.Encrypt(rawPayload)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt payload"})
		return
	}

	rawIntent.TraceID = traceID
	rawIntent.PayloadSize = payloadSize
	rawIntent.Payload = encryptedPayload // Replace raw payload with encrypted one for further stages
	rawIntent.ContentType = contentType
	rawIntent.SourceType = sourceType
	rawIntent.SourceClass = context.GetString("source_class")
	rawIntent.SourceSystem = sourceSystem
	rawIntent.TenantName = tenantName
	rawIntent.RequestHeadersHash = headersHash
	rawIntent.SchemaHint = nil

	// Hardcoded values
	rawIntent.ObjectEncryptionAlg = "AES256"
	rawIntent.KMSKeyVersion = "v1"
	rawIntent.IngressAPIVersion = "v1"
	rawIntent.RetentionPolicyClass = "STANDARD"
	rawIntent.EventType = "Envelope.Created"
	//Need to replace Hashed payload with Encrypted Payload before sending to S3

	storageAck, err := services.ProcessRawIntent(reqCtx, rawIntent, h.S3store, envelopeID, receivedAt)
	if err != nil {
		log.Printf("Error processing intent: %v", err)
		context.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":   rawIntent.TraceID,
			"ErrorCode": "INTERNAL_ERROR",
			"ErrorMsg":  err.Error(),
		})
		return
	}

	if storageAck == nil {
		log.Printf("S3 Data is nil for trace_id=%s", rawIntent.TraceID)
		context.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":   rawIntent.TraceID,
			"ErrorCode": "INTERNAL_ERROR",
			"ErrorMsg":  "S3 data is nil",
		})
		return
	}
	storageAck.ArtifactId = artifactID
	storageAck.ArtifactVersionId = artifactVersionID

	//Hash Payload Using SHA256
	payloadHashSum := sha256.Sum256(rawPayload)
	payloadHash := payloadHashSum[:]

	rawIntent.PayloadHash = payloadHash

	rawRowHash, err := services.ComputeRawRowHash(rawPayload)
	if err != nil {
		log.Printf("Error computing raw_row_hash for trace_id=%s: %v", rawIntent.TraceID, err)
		context.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":    rawIntent.TraceID,
			"ErrorCode":  "INTERNAL_SERVER_ERROR",
			"ErrorMsg":   "Failed to compute raw_row_hash.",
			"HttpStatus": http.StatusInternalServerError,
		})
		return
	}
	rawIntent.RawRowHash = rawRowHash

	if err := services.RawIntent(reqCtx, rawIntent, storageAck); err != nil {
		log.Printf("Error persisting raw intent: %v", err)
		context.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":    rawIntent.TraceID,
			"ErrorCode":  "INTERNAL_SERVER_ERROR",
			"ErrorMsg":   "Failed to persist raw intent.",
			"HttpStatus": http.StatusInternalServerError,
		})
		return
	}

	ingestOK = true
	context.JSON(http.StatusAccepted, gin.H{
		"EnvelopeID":  storageAck.EnvelopeId,
		"Trace_id":    rawIntent.TraceID,
		"Status":      "Accepted",
		"Received_At": storageAck.ReceivedAt,
	})
}
