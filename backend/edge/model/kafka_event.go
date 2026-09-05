package model

import (
	"time"

	"github.com/google/uuid"
)

type Event struct {
	TraceID          uuid.UUID
	EnvelopeID       uuid.UUID
	TenantID         uuid.UUID
	ObjectRef        string
	ReceivedAt       time.Time
	Source           string
	IdempotencyKey   string
	EncryptedPayload []byte
	PayloadHash      string
}
