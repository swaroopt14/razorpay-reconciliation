package models

import (
	"time"

	"github.com/google/uuid"
)

type BusinessIdempotencyEntry struct {
	TenantID               uuid.UUID `json:"tenant_id" db:"tenant_id"`
	BusinessIdempotencyKey string    `json:"business_idempotency_key" db:"business_idempotency_key"`
	IntentID               uuid.UUID `json:"intent_id" db:"intent_id"`
	BeneficiaryFingerprint string    `json:"beneficiary_fingerprint" db:"beneficiary_fingerprint"`
	AmountMinor            int64     `json:"amount_minor" db:"amount_minor"`
	CurrencyCode           string    `json:"currency_code" db:"currency_code"`
	TimeBucket             string    `json:"time_bucket" db:"time_bucket"`
	DuplicateReasonCode    string    `json:"duplicate_reason_code" db:"duplicate_reason_code"`
	CreatedAt              time.Time `json:"created_at" db:"created_at"`
}
