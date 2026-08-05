package services

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"log"
	"os"

	"zord-edge/db"
	"zord-edge/model"
	"zord-edge/vault"

	"github.com/google/uuid"
)

func RawIntent(ctx context.Context,
	rawIntent model.RawIntentMessage, storageAck *model.AckMessage) error {

	envelopeID, err := uuid.Parse(storageAck.EnvelopeId)
	if err != nil {
		log.Printf("Invalid EnvelopeId: %s", storageAck.EnvelopeId)
		return err
	}
	artifactId, err := uuid.Parse(storageAck.ArtifactId)
	if err != nil {
		log.Printf("Invalid ArtifactId: %s", storageAck.ArtifactId)
		return err
	}
	traceID, err := uuid.Parse(rawIntent.TraceID)
	if err != nil {
		log.Printf("Invalid TraceID: %s", rawIntent.TraceID)
		return err
	}
	tenantID, err := uuid.Parse(rawIntent.TenantID)
	if err != nil {
		log.Printf("Invalid TenantId: %s", rawIntent.TenantID)
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
