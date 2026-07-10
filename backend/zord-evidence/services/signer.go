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

// NewSigner initialises the signing key from a base64-encoded ed25519 private key
// or a ".pem" file path. The key must be configured — ephemeral key generation
// is not supported because restart would invalidate all prior pack signatures.
func NewSigner(privateKeyData string) (*Signer, error) {
	if strings.TrimSpace(privateKeyData) == "" {
		return nil, fmt.Errorf(
			"EVIDENCE_SIGNING_PRIVATE_KEY_BASE64 is required: " +
				"set it to a base64-encoded ed25519 private key (32 bytes raw)",
		)
	}

	if strings.HasSuffix(strings.ToLower(strings.TrimSpace(privateKeyData)), ".pem") {
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

	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(privateKeyData))
	if err != nil {
		return nil, fmt.Errorf("decode private key base64: %w", err)
	}
	if len(raw) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("invalid private key length: got %d bytes, want %d", len(raw), ed25519.PrivateKeySize)
	}
	return &Signer{private: ed25519.PrivateKey(raw)}, nil
}

// KeyID returns a stable identifier for the active signing public key.
func (s *Signer) KeyID() string {
	pub := s.private.Public().(ed25519.PublicKey)
	return "ed25519:" + hex.EncodeToString(pub)
}

// Sign produces a base64-encoded ed25519 signature over payload, prefixed with "ZORD".
func (s *Signer) Sign(payload string) string {
	sig := ed25519.Sign(s.private, []byte(payload))
	return "ZORD" + base64.StdEncoding.EncodeToString(sig)
}
