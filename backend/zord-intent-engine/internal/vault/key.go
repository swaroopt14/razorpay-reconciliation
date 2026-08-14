package vault

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"
)

const (
	defaultVaultKeyVersion = "v1"
	ciphertextBoundMarker   = byte(0x01)
)

var (
	encryptionKey []byte
	activeKeyID   string
	activeVersion string
)

// InitVault loads the single active vault key used for decrypt.
//
// Required: ZORD_VAULT_KEY (base64, 32 bytes)
// Optional: VAULT_KEY_ID, VAULT_KEY_VERSION (metadata stamps only — not rotation)
func InitVault() error {
	activeKeyB64 := strings.TrimSpace(os.Getenv("ZORD_VAULT_KEY"))
	if activeKeyB64 == "" {
		return errors.New("ZORD_VAULT_KEY is required")
	}

	activeVersion = strings.TrimSpace(os.Getenv("VAULT_KEY_VERSION"))
	if activeVersion == "" {
		activeVersion = defaultVaultKeyVersion
	}

	activeKeyID = strings.TrimSpace(os.Getenv("VAULT_KEY_ID"))
	if activeKeyID == "" {
		activeKeyID = "local-dev-key"
	}

	key, err := decodeVaultKey(activeKeyB64)
	if err != nil {
		return fmt.Errorf("invalid ZORD_VAULT_KEY: %w", err)
	}

	encryptionKey = key
	return nil
}

func InitVaultKey(base64Key string) error {
	if err := os.Setenv("ZORD_VAULT_KEY", base64Key); err != nil {
		return err
	}
	return InitVault()
}

func decodeVaultKey(base64Key string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(base64Key))
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, errors.New("vault key must be 32 bytes")
	}
	return key, nil
}
