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

func NewSigner(privateKeyData string) (*Signer, error) {
	if strings.TrimSpace(privateKeyData) == "" {
		pub, priv, err := ed25519.GenerateKey(nil)
		if err != nil {
			return nil, err
		}
		_ = pub
		return &Signer{private: priv}, nil
	}

	if strings.HasSuffix(strings.ToLower(strings.TrimSpace(privateKeyData)), ".pem") {
		// Treat as file path
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

	raw, err := base64.StdEncoding.DecodeString(privateKeyData)
	if err != nil {
		return nil, fmt.Errorf("decode private key: %w", err)
	}
	if len(raw) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("invalid private key length: %d", len(raw))
	}
	return &Signer{private: ed25519.PrivateKey(raw)}, nil
}

func (s *Signer) Sign(payload string) string {
	sig := ed25519.Sign(s.private, []byte(payload))
	return "ZORD" + base64.StdEncoding.EncodeToString(sig)
}
