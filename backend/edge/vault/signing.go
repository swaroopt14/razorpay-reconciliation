package vault

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"os"
)

var SigningKey ed25519.PrivateKey

func InitSigningKey(path string) error {
	keydata, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	block, _ := pem.Decode(keydata)
	if block == nil {
		return errors.New("failed to decode PEM block")
	}
	parsedkey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return err
	}
	privkey, ok := parsedkey.(ed25519.PrivateKey)
	if !ok {
		return errors.New("not an Ed25519 private key")
	}
	SigningKey = privkey
	return nil
}

func SignEnvelopeHash(hash []byte) []byte {
	return ed25519.Sign(SigningKey, hash)
}
