package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"errors"
)

// DecryptPayload opens context-bound ciphertext produced by zord-edge.
// Legacy blobs without the bound marker are opened with nil AAD (pre-EDGE-06).
func DecryptPayload(ctx EncryptionContext, ciphertext []byte, _ string) ([]byte, error) {
	if len(encryptionKey) == 0 {
		return nil, errors.New("vault is not initialized")
	}
	if len(ciphertext) == 0 {
		return nil, errors.New("ciphertext is empty")
	}

	if ciphertext[0] == ciphertextBoundMarker {
		return open(ciphertext[1:], ctx.AAD())
	}
	return open(ciphertext, nil)
}

func open(ciphertext, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(ciphertext) < aesGCM.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}

	nonce := ciphertext[:aesGCM.NonceSize()]
	encryptedData := ciphertext[aesGCM.NonceSize():]
	return aesGCM.Open(nil, nonce, encryptedData, aad)
}
