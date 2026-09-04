package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"
)

// Encrypt seals plaintext with AES-256-GCM, binding tenant/artifact context as AAD.
func Encrypt(ctx EncryptionContext, plaintext []byte) (EncryptResult, error) {
	if len(encryptionKey) == 0 {
		return EncryptResult{}, errors.New("vault is not initialized")
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return EncryptResult{}, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return EncryptResult{}, err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return EncryptResult{}, err
	}

	sealed := aesGCM.Seal(nil, nonce, plaintext, ctx.AAD())
	out := make([]byte, 0, 1+len(nonce)+len(sealed))
	out = append(out, ciphertextBoundMarker)
	out = append(out, nonce...)
	out = append(out, sealed...)

	return EncryptResult{
		Ciphertext: out,
		KeyID:      activeKeyID,
		KeyVersion: activeVersion,
	}, nil
}
