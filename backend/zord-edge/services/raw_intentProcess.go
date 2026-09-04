package services

import (
	"context"
	"log/slog"
	"time"

	"zord-edge/logger"
	"zord-edge/model"
	"zord-edge/storage"
)

func ProcessRawIntent(
	ctx context.Context,
	rawIntent model.RawIntentMessage,
	s3store *storage.S3Store,
	envelopeID string,
	receivedAt time.Time,
) (*model.AckMessage, error) {

	objRef, err := s3store.StoreRawPayload(
		ctx,
		envelopeID,
		receivedAt,
		[]byte(rawIntent.Payload),
		rawIntent.TenantID,
		rawIntent.TenantName,
		rawIntent.ContentType,
	)
	if err != nil {
		logger.Log.Error("S3 Upload Failed",
			slog.String("tenant_id", rawIntent.TenantID),
			slog.String("envelope_id", envelopeID),
			slog.String("error", err.Error()))
		return nil, err
	}

	return &model.AckMessage{
		EnvelopeId: envelopeID,
		ReceivedAt: receivedAt,
		ObjectRef:  objRef,
	}, nil
}
