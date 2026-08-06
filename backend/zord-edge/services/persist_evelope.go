package services

import (
	"context"
	"database/sql"
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

func CheckBatchIDExists(ctx context.Context, tenantID uuid.UUID, batchID *string) (bool, error) {
	if batchID == nil {
		return false, nil
	}
	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM ingress_envelopes WHERE tenant_id = $1 AND batchid = $2)`
	err := db.DB.QueryRowContext(ctx, query, tenantID, *batchID).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}
func UpsertArtifact(ctx context.Context, forcereprocess bool, input model.Artifact) (bool, uuid.UUID, uuid.UUID, error) {

	var existingArtifactId, existingArtifactVerId, artifactID, artifactVersionId uuid.UUID

	if !forcereprocess {
		query := `SELECT artifact_id,artifact_version_id FROM artifacts WHERE tenant_id=$1 AND file_hash=$2`
		err := db.DB.QueryRowContext(ctx, query, input.TenantId, input.FileHash).Scan(&existingArtifactId, &existingArtifactVerId)
		if err == nil {
			logger.Log.Info("artifact already exist",
				slog.String("artifactId", existingArtifactId.String()),
				slog.String("tenant_id", input.TenantId.String()))
			return true, existingArtifactId, existingArtifactVerId, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			logger.Log.Error("artifact lookup failed",
				slog.String("tenant_id", input.TenantId.String()),
				slog.String("error", err.Error()))
			return false, uuid.Nil, uuid.Nil, err
		}
	}
	artifactID = uuid.Must(uuid.NewV7())
	artifactVersionId = uuid.Must(uuid.NewV7())
	if forcereprocess {
		query := `SELECT artifact_id FROM artifacts WHERE tenant_id=$1 AND file_hash=$2`
		err := db.DB.QueryRowContext(ctx, query, input.TenantId, input.FileHash).Scan(&existingArtifactId)
		if err == nil {
			logger.Log.Info("artifact already exist",
				slog.String("artifactId", existingArtifactId.String()),
				slog.String("tenant_id", input.TenantId.String()))
			artifactID = existingArtifactId
		} else if !errors.Is(err, sql.ErrNoRows) {
			logger.Log.Error("artifact lookup failed",
				slog.String("tenant_id", input.TenantId.String()),
				slog.String("error", err.Error()))
			return false, uuid.Nil, uuid.Nil, err
		}
	}

	query := `INSERT INTO artifacts(artifact_id,artifact_version_id,tenant_id,file_hash,file_name,
			file_size_bytes,row_count_estimate,object_ref,batch_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`

	_, err := db.DB.ExecContext(ctx, query,
		artifactID.String(),
		artifactVersionId.String(),
		input.TenantId,
		input.FileHash,
		input.FileName,
		input.FileSizeByte,
		input.RowCountEstimate,
		input.ObjectRef,
		input.BatchId,
	)
	if err != nil {
		logger.Log.Error("error in artifact persist",
			slog.String("tenat_id", string(input.TenantId.String())),
			slog.String("file_name", *input.FileName),
			slog.String("Error", err.Error()),
		)
		return false, uuid.Nil, uuid.Nil, err
	}
	return false, artifactID, artifactVersionId, nil
}
