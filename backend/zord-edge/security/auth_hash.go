package security

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
)

func HashApiKey(key string) (string, error) {
	h := sha256.Sum256([]byte(key))
	return hex.EncodeToString(h[:]), nil
}

func CompareApiKey(hash string, rawkey string) error {
	expected, err := hex.DecodeString(hash)
	if err != nil {
		return err
	}
	actual := sha256.Sum256([]byte(rawkey))
	if subtle.ConstantTimeCompare(expected, actual[:]) != 1 {
		return errors.New("api key mismatch")
	}
	return nil
}
