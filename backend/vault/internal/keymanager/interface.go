package keymanager

import (
	"context"
	"zord-token-enclave/internal/models"
)

// KeyManager is the sole boundary between the rest of this service and DEK
// storage/KMS (TOK-03). RawKey on every returned *models.EncryptionKey is
// ALWAYS the genuine, usable AES-256 key -- callers never see wrapped bytes
// and never need to know an unwrap (and, on cache miss, a KMS network round
// trip) happened underneath. Do not add a call path that reads
// token_encryption_keys.encrypted_key directly (via repository) anywhere
// else in this service -- that bypass is exactly the bug this ticket found
// and fixed in doMigrateKeys's old-key fetch.
type KeyManager interface {
	GetActiveKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error)
	GetKeyByID(ctx context.Context, keyID string) (*models.EncryptionKey, error)
	GetRetiringKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error)

	// WrapNewDEK generates a fresh 32-byte AES-256 DEK and wraps it under
	// this service's configured KMS key in one call -- the raw DEK never
	// exists outside this function's stack frame. Returns the wrapped
	// ciphertext blob (to store as encrypted_key) and the CMK ID/ARN used.
	WrapNewDEK(ctx context.Context, tenantID string) (wrapped []byte, kmsKeyID string, err error)
}
