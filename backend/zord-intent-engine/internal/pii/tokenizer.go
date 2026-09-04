package pii

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base32"
	"errors"
	"strings"
)

// Tokenizer handles PII token generation
type Tokenizer struct {
	secret []byte
}

// NewTokenizer creates a tokenizer with a secret key
func NewTokenizer(secret string) (*Tokenizer, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, errors.New("tokenization secret cannot be empty")
	}
	return &Tokenizer{secret: []byte(secret)}, nil
}

// TokenizeAccountNumber generates a deterministic token_ref
// for an account number using HMAC-SHA256
func (t *Tokenizer) TokenizeAccountNumber(accountNumber string) (string, error) {
	accountNumber = strings.TrimSpace(accountNumber)
	if accountNumber == "" {
		return "", errors.New("account_number is empty")
	}

	h := hmac.New(sha256.New, t.secret)
	h.Write([]byte(accountNumber))
	sum := h.Sum(nil)

	// Base32 encoding (URL-safe, readable)
	encoded := base32.StdEncoding.
		WithPadding(base32.NoPadding).
		EncodeToString(sum)

	// Shorten token for storage friendliness
	token := encoded[:20]

	return "tok_acc_" + token, nil
}
