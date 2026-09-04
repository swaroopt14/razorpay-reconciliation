package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"strings"
)

type Crypto struct {
	key []byte
}

func NewCrypto(key []byte) *Crypto {
	return &Crypto{key: key}
}

func (c *Crypto) Encrypt(plaintext []byte) (ciphertext, nonce []byte, err error) {
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return nil, nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}

	nonce = make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}

	ciphertext = gcm.Seal(nil, nonce, plaintext, nil)
	return ciphertext, nonce, nil
}

func (c *Crypto) EncryptToToken(plaintext []byte) (string, error) {
	ciphertext, nonce, err := c.Encrypt(plaintext)
	if err != nil {
		return "", err
	}

	final := append(nonce, ciphertext...)
	return "tok_" + base64.StdEncoding.EncodeToString(final), nil
}

func (c *Crypto) DecryptFromToken(token string) ([]byte, error) {

	// 🔥 remove prefix
	token = strings.TrimPrefix(token, "tok_")

	data, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(c.key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()

	if len(data) < nonceSize {
		return nil, errors.New("invalid token")
	}

	nonce := data[:nonceSize]
	ciphertext := data[nonceSize:]

	return gcm.Open(nil, nonce, ciphertext, nil)
}

func (c *Crypto) Decrypt(ciphertext, nonce []byte) ([]byte, error) {
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	return gcm.Open(nil, nonce, ciphertext, nil)
}
