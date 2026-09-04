package keymanager

import (
	"context"
	"crypto/rand"
	"fmt"

	"zord-token-enclave/internal/models"
	"zord-token-enclave/internal/repository"
)

type manager struct {
	repo      *repository.TokenRepository
	kmsClient KMSClient
	kmsKeyID  string
	cache     *ttlCache
}

func NewKeyManager(repo *repository.TokenRepository, kmsClient KMSClient, kmsKeyID string) KeyManager {
	return &manager{
		repo:      repo,
		kmsClient: kmsClient,
		kmsKeyID:  kmsKeyID,
		cache:     newTTLCache(),
	}
}

// encryptionContextFor builds the KMS EncryptionContext used on BOTH wrap
// and unwrap. One shared function, not inlined at each call site: KMS fails
// Decrypt hard and permanently on any context mismatch (case, whitespace,
// extra keys), and tenantID reaches this from different places (a service-
// layer parameter on wrap, a DB-scanned row.TenantID on unwrap) -- routing
// both through the same function is what keeps them provably identical.
func encryptionContextFor(tenantID string) map[string]string {
	return map[string]string{"tenant_id": tenantID}
}

func (m *manager) GetActiveKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error) {
	row, err := m.repo.GetActiveKey(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return m.resolve(ctx, row)
}

func (m *manager) GetKeyByID(ctx context.Context, keyID string) (*models.EncryptionKey, error) {
	row, err := m.repo.GetKeyByID(ctx, keyID)
	if err != nil {
		return nil, err
	}
	return m.resolve(ctx, row)
}

// GetRetiringKey closes the gap found during TOK-03 implementation:
// doMigrateKeys used to call repository.GetRetiringKey directly, bypassing
// unwrap entirely -- which would have hard-crashed the migration sweep the
// moment a tenant's RETIRING key was a KMS-wrapped blob instead of a raw
// 32-byte key (crypto.NewCrypto requires exactly 16/24/32 bytes).
func (m *manager) GetRetiringKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error) {
	row, err := m.repo.GetRetiringKey(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return m.resolve(ctx, row)
}

// resolve turns a DB row (encrypted_key may be raw or wrapped, per
// row.Wrapped) into an EncryptionKey whose RawKey is always the genuine,
// usable AES key.
func (m *manager) resolve(ctx context.Context, row *models.EncryptionKey) (*models.EncryptionKey, error) {
	if !row.Wrapped {
		// Legacy row, written before TOK-03: encrypted_key already IS the
		// raw DEK. No KMS call, exactly today's behavior -- these rows stay
		// readable until their next natural rotation wraps them.
		return row, nil
	}

	if dek, ok := m.cache.get(row.KeyID); ok {
		row.RawKey = dek
		return row, nil
	}

	dek, err := m.kmsClient.Decrypt(ctx, row.RawKey, row.KMSKeyID, encryptionContextFor(row.TenantID))
	if err != nil {
		return nil, fmt.Errorf("unwrap DEK for key %s: %w", row.KeyID, err)
	}

	m.cache.set(row.KeyID, dek)
	row.RawKey = dek
	return row, nil
}

// WrapNewDEK generates a fresh AES-256 DEK and wraps it in one call -- the
// raw DEK never exists outside this function's stack frame, never crosses
// a package boundary unwrapped.
func (m *manager) WrapNewDEK(ctx context.Context, tenantID string) ([]byte, string, error) {
	dek := make([]byte, 32)
	if _, err := rand.Read(dek); err != nil {
		return nil, "", err
	}
	defer zero(dek) // best-effort: this function's own copy is no longer needed once wrapped

	wrapped, err := m.kmsClient.Encrypt(ctx, dek, encryptionContextFor(tenantID))
	if err != nil {
		return nil, "", fmt.Errorf("wrap new DEK for tenant %s: %w", tenantID, err)
	}

	return wrapped, m.kmsKeyID, nil
}
