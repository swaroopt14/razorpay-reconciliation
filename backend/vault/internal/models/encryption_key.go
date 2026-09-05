package models

import "time"

type EncryptionKey struct {
	KeyID      string
	TenantID   string
	Version    int
	RawKey     []byte // always the genuine, usable AES-256 key -- keymanager unwraps before returning
	Wrapped    bool   // DB storage format: true = encrypted_key is a KMS CiphertextBlob, false = legacy raw DEK (TOK-03)
	KMSKeyID   string // which CMK wrapped this key, empty when Wrapped=false
	Status     string
	ActiveFrom time.Time
}
