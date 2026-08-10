package services

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"os"

	"zord-edge/db"
	"zord-edge/logger"
	"zord-edge/model"
	"zord-edge/vault"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

const (
	ArtifactStatusProcessing = "PROCESSING"
	ArtifactStatusCompleted  = "COMPLETED"
	ArtifactStatusFailed     = "FAILED"
)

var (
	ErrBatchAlreadyProcessed = errors.New("batch already completed")
	ErrBatchInProgress       = errors.New("batch currently processing")
	ErrBatchFailedRetry      = errors.New("previous batch failed, retry allowed")
)

func RawIntent(ctx context.Context,
	rawIntent model.RawIntentMessage, storageAck *model.AckMessage) error {

	envelopeID, err := uuid.Parse(storageAck.EnvelopeId)
	if err != nil {
		logger.Log.Error("invalid EnvelopeId", slog.String("envelope_id", storageAck.EnvelopeId), slog.String("error", err.Error()))
		return err
	}
	artifactId, err := uuid.Parse(storageAck.ArtifactId)
	if err != nil {
		logger.Log.Error("invalid ArtifactId", slog.String("artifact_id", storageAck.ArtifactId), slog.String("error", err.Error()))
		return err
	}
	traceID, err := uuid.Parse(rawIntent.TraceID)
	if err != nil {
		logger.Log.Error("invalid TraceID", slog.String("trace_id", rawIntent.TraceID), slog.String("error", err.Error()))
		return err
	}
	tenantID, err := uuid.Parse(rawIntent.TenantID)
	if err != nil {
		logger.Log.Error("invalid TenantId", slog.String("tenant_id", rawIntent.TenantID), slog.String("error", err.Error()))
		return err
	}
	objectRef := storageAck.ObjectRef
	artifactVersionId := storageAck.ArtifactVersionId

	envelopeHash := BuildEnvelopeHash(rawIntent, storageAck)
	envelopeSignature := vault.SignEnvelopeHash(envelopeHash)
	encodedSignature := base64.StdEncoding.EncodeToString(envelopeSignature)
	storedSignature := "ZORD_" + encodedSignature

	envelope := model.IngressEnvelope{
		TraceID:                      traceID,
		EnvelopeID:                   envelopeID,
		ArtifactID:                   artifactId,
		ArtifactVersionID:            artifactVersionId,
		TenantID:                     tenantID,
		IngressChannel:               rawIntent.SourceType,
		SourceClass:                  rawIntent.SourceClass,
		SourceSystem:                 rawIntent.SourceSystem,
		ContentType:                  rawIntent.ContentType,
		IdempotencyKey:               rawIntent.IdempotencyKey,
		PayloadSize:                  rawIntent.PayloadSize,
		PayloadHash:                  hex.EncodeToString(rawIntent.PayloadHash),
		RawRowHash:                   rawIntent.RawRowHash,
		EnvelopeHash:                 hex.EncodeToString(envelopeHash),
		EnvelopeSignature:            storedSignature,
		RequestHeadersHash:           hex.EncodeToString(rawIntent.RequestHeadersHash),
		SchemaHint:                   rawIntent.SchemaHint,
		MappingProfileHint:           rawIntent.MappingProfileHint,
		ObjectEncryptionAlg:          rawIntent.ObjectEncryptionAlg,
		KMSKeyVersion:                rawIntent.KMSKeyVersion,
		ParserClassification:         rawIntent.ParserClassification,
		TransportRequestID:           rawIntent.TransportRequestID,
		ClientReferenceHint:          rawIntent.ClientReferenceHint,
		SourceSystemHint:             rawIntent.SourceSystemHint,
		IngressAPIVersion:            rawIntent.IngressAPIVersion,
		RetentionPolicyClass:         rawIntent.RetentionPolicyClass,
		WebhookProviderID:            rawIntent.WebhookProviderID,
		ConnectorBindingID:           rawIntent.ConnectorBindingID,
		EventType:                    rawIntent.EventType,
		CreatedAt:                    storageAck.ReceivedAt,
		EncryptionKeyID:              os.Getenv("VAULT_KEY_ID"),
		ObjectStoreVersion:           os.Getenv("OBJECT_STORE_VERSION"),
		IdempotencyReservationStatus: "RESERVED",
		PrincipalID:                  tenantID,
		AuthMethod:                   "API_KEY",
		ObjectRef:                    objectRef,
		Status:                       "RECEIVED",
		ReceivedAt:                   storageAck.ReceivedAt,
		Payload:                      rawIntent.Payload,
		FileName:                     rawIntent.FileName,
		FileSizeBytes:                rawIntent.FileSizeBytes,
		FileContentHash:              rawIntent.FileContentHash,
		RowCountEstimate:             rawIntent.RowCountEstimate,
		FileUploadChannel:            rawIntent.FileUploadChannel,
		SourceRowRef:                 rawIntent.SourceRowRef,
		BatchID:                      rawIntent.BatchID,
	}

	// Envolope.SaveRawIntent()
	err = SaveRawIntent(ctx,
		db.DB,
		&envelope,
	)
	if err != nil {
		return err
	}
	return nil
}

func ReserveArtifact(ctx context.Context, forceReprocess bool, input model.Artifact) (uuid.UUID, uuid.UUID, error) {

	artifactVersionID := uuid.Must(uuid.NewV7())
	artifactID := uuid.Must(uuid.NewV7())

	if forceReprocess {
		// reprocess — keep same artifact_id, new version_id
		var existingID uuid.UUID
		err := db.DB.QueryRowContext(ctx,
			`SELECT artifact_id FROM artifacts 
             WHERE tenant_id = $1 AND file_hash = $2 
             ORDER BY created_at DESC LIMIT 1`,
			input.TenantId, input.FileHash,
		).Scan(&existingID)
		if err == nil {
			artifactID = existingID
		}
	} else {
		// not reprocess — check if this exact file was already processed
		var existingStatus string
		err := db.DB.QueryRowContext(ctx,
			`SELECT status FROM artifacts 
             WHERE tenant_id = $1 AND file_hash = $2 
             ORDER BY created_at DESC LIMIT 1`,
			input.TenantId, input.FileHash,
		).Scan(&existingStatus)

		if err == nil {
			// file already exists — reject before touching S3
			logger.Log.Warn("duplicate file rejected",
				slog.String("file_hash", input.FileHash),
				slog.String("tenant_id", input.TenantId.String()),
				slog.String("existing_status", existingStatus))

			switch existingStatus {
			case ArtifactStatusProcessing:
				return uuid.Nil, uuid.Nil, ErrBatchInProgress
			case ArtifactStatusCompleted:
				return uuid.Nil, uuid.Nil, ErrBatchAlreadyProcessed
			case ArtifactStatusFailed:
				return uuid.Nil, uuid.Nil, ErrBatchFailedRetry
			}
		}
		// err == sql.ErrNoRows → genuinely new file, proceed to INSERT
	}

	_, err := db.DB.ExecContext(ctx, `
        INSERT INTO artifacts(
            artifact_id, artifact_version_id, tenant_id, file_hash,
            file_name, file_size_bytes, row_count_estimate, batch_id, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PROCESSING')`,
		artifactID,
		artifactVersionID,
		input.TenantId,
		input.FileHash,
		input.FileName,
		input.FileSizeByte,
		input.RowCountEstimate,
		input.BatchID,
	)

	if err != nil {
		pqErr, ok := err.(*pq.Error)
		if ok && pqErr.Code == "23505" {
			// DB constraint fired — only happens for batch_id conflict now
			var existingStatus string
			_ = db.DB.QueryRowContext(ctx,
				`SELECT status FROM artifacts WHERE tenant_id = $1 AND batch_id = $2`,
				input.TenantId, input.BatchID,
			).Scan(&existingStatus)

			logger.Log.Warn("duplicate batch_id rejected",
				slog.String("batch_id", input.BatchID),
				slog.String("tenant_id", input.TenantId.String()),
				slog.String("existing_status", existingStatus))

			switch existingStatus {
			case ArtifactStatusProcessing:
				return uuid.Nil, uuid.Nil, ErrBatchInProgress
			case ArtifactStatusCompleted:
				return uuid.Nil, uuid.Nil, ErrBatchAlreadyProcessed
			case ArtifactStatusFailed:
				return uuid.Nil, uuid.Nil, ErrBatchFailedRetry
			}
		}
		return uuid.Nil, uuid.Nil, err
	}

	logger.Log.Info("artifact reserved",
		slog.String("artifact_id", artifactID.String()),
		slog.String("artifact_version_id", artifactVersionID.String()),
		slog.String("batch_id", input.BatchID))

	return artifactID, artifactVersionID, nil
}
func MarkArtifactFailed(ctx context.Context, artifactVersionID uuid.UUID) {
	_, err := db.DB.ExecContext(ctx, `
        UPDATE artifacts SET status = 'FAILED', updated_at = now()
        WHERE artifact_version_id = $1`,
		artifactVersionID,
	)
	if err != nil {
		logger.Log.Error("artifact mark failed error",
			slog.String("artifact_version_id", artifactVersionID.String()),
			slog.String("error", err.Error()))
	}
}
func FinalizeArtifact(ctx context.Context, artifactVersionID uuid.UUID, objectRef string, fileEnvelopeID uuid.UUID) error {
	_, err := db.DB.ExecContext(ctx, `
        UPDATE artifacts
        SET status          = 'COMPLETED',
            object_ref      = $1,
            file_envelope_id = $2,
            updated_at      = now()
        WHERE artifact_version_id = $3`,
		objectRef,
		fileEnvelopeID,
		artifactVersionID,
	)
	if err != nil {
		logger.Log.Error("artifact finalize failed",
			slog.String("artifact_version_id", artifactVersionID.String()),
			slog.String("error", err.Error()))
		return err
	}

	logger.Log.Info("artifact finalized",
		slog.String("artifact_version_id", artifactVersionID.String()),
		slog.String("object_ref", objectRef))

	return nil
}
