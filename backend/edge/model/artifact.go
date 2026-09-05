package model

import (
	"time"

	"github.com/google/uuid"
)

type Artifact struct {
	BatchID          string     `json:"batch+id" db:"batch_id"`
	TenantId         uuid.UUID  `json:"tenant_id" db:"tenant_id"`
	FileEnvelopeId   *uuid.UUID `json:"file_envelope_id" db:"file_envelope_id"`
	FileHash         string     `json:"file_hash" db:"file_hash"`
	FileName         *string    `json:"file_name" db:"file_name"`
	FileSizeByte     *int64     `json:"file_size_bytes" db:"file_size_bytes"`
	RowCountEstimate int        `json:"row_count_estimate" db:"row_count_estimate"`
	ObjectRef        *string    `json:"object_ref" db:"object_ref"`
	Status           string     `json:"status" db:"status"`
	BatchId          *string    `json:"batch_id" db:"batch_id"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time  `db:"updated_at"`
}
