package services

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"os"
	"strings"
)

type Signer struct {
	private ed25519.PrivateKey
}

// NewSigner initialises the signing key from a base64-encoded PKCS8 private key
// string or a ".pem" file path.
//
// Production behaviour (allowEphemeral = false):
//
//	Returns an error if privateKeyData is empty. No ephemeral key generation.
//	A misconfigured production service must not silently generate a throwaway key
//	that will be lost on restart, making all previously-signed packs unverifiable.
//
// Development behaviour (allowEphemeral = true):
//
//	Generates a random ephemeral key when privateKeyData is empty. Suitable only
//	for local dev or testing environments (APP_ENV != "production").
func NewSigner(privateKeyData string, allowEphemeral bool) (*Signer, error) {
	if strings.TrimSpace(privateKeyData) == "" {
		if !allowEphemeral {
			return nil, fmt.Errorf(
				"EVIDENCE_SIGNING_PRIVATE_KEY_BASE64 is required in production: " +
					"set it to a base64-encoded PKCS8 ed25519 private key, " +
					"or set APP_ENV=development to allow ephemeral keys (not for production use)",
			)
		}
		// Development only: generate a random ephemeral key.
		_, priv, err := ed25519.GenerateKey(nil)
		if err != nil {
			return nil, fmt.Errorf("generate ephemeral signing key: %w", err)
		}
		return &Signer{private: priv}, nil
	}

	if strings.HasSuffix(strings.ToLower(strings.TrimSpace(privateKeyData)), ".pem") {
		// Treat as a file path.
		b, err := os.ReadFile(privateKeyData)
		if err != nil {
			return nil, fmt.Errorf("read pem file: %w", err)
		}
		block, _ := pem.Decode(b)
		if block == nil {
			return nil, fmt.Errorf("failed to decode PEM block from %s", privateKeyData)
		}
		priv, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("parse pkcs8 key: %w", err)
		}
		edPriv, ok := priv.(ed25519.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("key in pem is not an ed25519 private key")
		}
		return &Signer{private: edPriv}, nil
	}

	// Treat as a base64-encoded raw PKCS8 private key.
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(privateKeyData))
	if err != nil {
		return nil, fmt.Errorf("decode private key base64: %w", err)
	}
	if len(raw) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("invalid private key length: got %d bytes, want %d", len(raw), ed25519.PrivateKeySize)
	}
	return &Signer{private: ed25519.PrivateKey(raw)}, nil
}

// Sign produces a base64-encoded ed25519 signature over payload, prefixed with "ZORD".
func (s *Signer) Sign(payload string) string {
	sig := ed25519.Sign(s.private, []byte(payload))
	return "ZORD" + base64.StdEncoding.EncodeToString(sig)
}
