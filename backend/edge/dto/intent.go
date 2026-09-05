package dto

import (
	"time"

	"github.com/google/uuid"
)

type IncomingIntentRequestV1 struct {
	Tenant_id      uuid.UUID `json:"tenant_id"`
	IdempotencyKey string    `json:"idempotency_key"`
	Source         string    `json:"source"`
	SourceSystem   string    `json:"source_system"`
	PayloadHash    string    `json:"payload_hash"`
	ObjectRef      string    `json:"object_ref"`
	Signature      *string   `json:"signature"`

	IntentType  string            `json:"intent_type"`
	Amount      Amount            `json:"amount"`
	Deadline_At *time.Time        `json:"deadline_at"`
	Constraints IntentConstraints `json:"constraints"`
	Beneficiary Beneficiary       `json:"beneficiary"`
}

type IntentConstraints struct {
	Caps         *int64  `json:"caps,omitempty"`
	Corridor     *string `json:"corridor,omitempty"`
	AllowPartial bool    `json:"allow_partial"`
}
type Beneficiary struct {
	Type            string     `json:"type,omitempty"`
	Instrument      Instrument `json:"instrument" binding:"required"`
	NameTokenRef    string     `json:"name_token_ref,omitempty"`
	AddressTokenRef string     `json:"address_token_ref,omitempty"`
	Country         string     `json:"country,omitempty" binding:"len=2"`
}
type Amount struct {
	Value    string `json:"value" binding:"required"`
	Currency string `json:"currency" binding:"required,len=3"`
}
type Instrument struct {
	Kind               string `json:"kind" binding:"required"`
	InstrumentTokenRef string `json:"instrument_token_ref,omitempty"`
}
