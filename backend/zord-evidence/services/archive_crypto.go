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
// base64-encoded string.
//
// Production behaviour (allowEphemeral = false):
//
//	Returns an error if keyB64 is empty. No ephemeral key generation.
//	A misconfigured production service must not silently generate a throwaway
//	encryption key that will be lost on restart, making all existing archives
//	permanently undecryptable.
//
// Development behaviour (allowEphemeral = true):
//
//	Generates a random 32-byte (AES-256) ephemeral key when keyB64 is empty.
//	Suitable only for local dev or testing environments.
func NewArchiveCrypto(keyB64 string, allowEphemeral bool) (*ArchiveCrypto, error) {
	if strings.TrimSpace(keyB64) == "" {
		if !allowEphemeral {
			return nil, fmt.Errorf(
				"EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64 is required in production: " +
					"set it to a base64-encoded 32-byte (AES-256) key, " +
					"or set APP_ENV=development to allow ephemeral keys (not for production use)",
			)
		}
		// Development only: generate a random ephemeral 32-byte key.
		raw := make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, raw); err != nil {
			return nil, fmt.Errorf("generate ephemeral archive encryption key: %w", err)
		}
		return &ArchiveCrypto{key: raw}, nil
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
