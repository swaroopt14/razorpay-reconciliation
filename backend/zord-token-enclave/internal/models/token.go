package models

import "time"

type TokenRecord struct {
	TokenID         string
	TenantID        string
	Kind            string
	Ciphertext      []byte
	Nonce           []byte
	EncryptionKeyID string
	KeyVersion      int
	Status          string
	CreatedAt       time.Time
	Actor           string // who requested tokenization
	TraceID         string // trace ID from caller
}
