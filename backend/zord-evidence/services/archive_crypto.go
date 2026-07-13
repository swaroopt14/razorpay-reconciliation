package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"zord-evidence/models"
)

type ArchiveCrypto struct {
	key []byte
}

// NewArchiveCrypto initialises the AES-GCM archive encryption key from a
// base64-encoded string. The key must be configured — ephemeral key generation
// is not supported because restart would make existing S3 archives undecryptable.
func NewArchiveCrypto(keyB64 string) (*ArchiveCrypto, error) {
	if strings.TrimSpace(keyB64) == "" {
		return nil, fmt.Errorf(
			"EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64 is required: " +
				"set it to a base64-encoded 32-byte (AES-256) key",
		)
	}

	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(keyB64))
	if err != nil {
		return nil, fmt.Errorf("decode archive encryption key base64: %w", err)
	}

	if len(raw) != 32 {
		return nil, fmt.Errorf(
			"invalid archive encryption key length: got %d bytes, want 32 (AES-256)",
			len(raw),
		)
	}
	return &ArchiveCrypto{key: raw}, nil
}

// KeyID returns the stable single encryption_key_id used for all archives.
func (a *ArchiveCrypto) KeyID() string {
	return models.SingleArchiveEncryptionKeyID
}

// Encrypt encrypts plain using AES-GCM with a random nonce.
// The returned bytes are: nonce || ciphertext (GCM tag appended by Seal).
func (a *ArchiveCrypto) Encrypt(plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(a.key)
	if err != nil {
		return nil, fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("nonce generation: %w", err)
	}
	cipherText := gcm.Seal(nil, nonce, plain, nil)
	out := make([]byte, 0, len(nonce)+len(cipherText))
	out = append(out, nonce...)
	out = append(out, cipherText...)
	return out, nil
}

// Decrypt reverses Encrypt. Input must be nonce || ciphertext from Encrypt.
func (a *ArchiveCrypto) Decrypt(blob []byte) ([]byte, error) {
	block, err := aes.NewCipher(a.key)
	if err != nil {
		return nil, fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(blob) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short: got %d bytes, need at least %d", len(blob), nonceSize)
	}
	nonce, cipherText := blob[:nonceSize], blob[nonceSize:]
	plain, err := gcm.Open(nil, nonce, cipherText, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt archive: %w", err)
	}
	return plain, nil
}
