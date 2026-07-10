package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
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
	switch len(raw) {
	case 16, 24, 32:
		// Valid AES-128, AES-192, or AES-256 key lengths.
	default:
		return nil, fmt.Errorf("invalid archive encryption key length: got %d bytes, want 16, 24, or 32", len(raw))
	}
	return &ArchiveCrypto{key: raw}, nil
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
