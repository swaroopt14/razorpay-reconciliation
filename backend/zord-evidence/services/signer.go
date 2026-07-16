package services

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"os"
	"strings"
)

type Signer struct {
	private ed25519.PrivateKey
}

// NewSigner initialises the signing key from a PKCS#8 PEM file. The key must be
// configured because restart would invalidate all prior pack signatures.
func NewSigner(privateKeyPath string) (*Signer, error) {
	privateKeyPath = strings.TrimSpace(privateKeyPath)
	if privateKeyPath == "" {
		return nil, fmt.Errorf("signing key PEM path is required")
	}

	b, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("read signing key PEM file: %w", err)
	}

	block, _ := pem.Decode(b)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block from %s", privateKeyPath)
	}

	priv, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse pkcs8 signing key: %w", err)
	}

	edPriv, ok := priv.(ed25519.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("key in %s is not an ed25519 private key", privateKeyPath)
	}

	return &Signer{private: edPriv}, nil
}

// KeyID returns a stable identifier for the active signing public key.
func (s *Signer) KeyID() string {
	return "ed25519:" + hex.EncodeToString(s.PublicKey())
}

// PublicKey returns the active signing key's public half — the trusted
// verification key. Independent signature re-verification must use this
// (the deployment's own configured key), not a key_id read back from the
// row being verified, otherwise a compromised DB could swap both the
// payload and key_id together and still "verify".
func (s *Signer) PublicKey() ed25519.PublicKey {
	return s.private.Public().(ed25519.PublicKey)
}

// Sign produces a base64-encoded ed25519 signature over payload, prefixed with "ZORD".
func (s *Signer) Sign(payload string) string {
	sig := ed25519.Sign(s.private, []byte(payload))
	return "ZORD" + base64.StdEncoding.EncodeToString(sig)
}
