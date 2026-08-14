package audittests

// TOK-06: "Replace runtime schema creation with migrations and tests."
// This file covers the crypto half of the acceptance test -- "tests cover
// tenant isolation, deterministic tokens" -- at the algorithm level (see
// tok06_repository_integration_test.go for the same properties proven
// against a real database).
//
// Run with: go test ./testing/... -run TestTOK06_Crypto -v

import (
	"bytes"
	"testing"

	"zord-token-enclave/internal/crypto"
)

// TestTOK06_CryptoDeterministicTokenIsStable proves GenerateDeterministicToken
// returns the exact same token for the exact same input, every time --
// required for detokenize lookups and duplicate-value detection to work at all.
func TestTOK06_CryptoDeterministicTokenIsStable(t *testing.T) {
	secret := []byte("stable-secret")
	a := crypto.GenerateDeterministicToken(secret, "tenant-1", "email", "same@example.com")
	b := crypto.GenerateDeterministicToken(secret, "tenant-1", "email", "same@example.com")
	if a != b {
		t.Fatalf("GenerateDeterministicToken produced different tokens for identical input: %q vs %q", a, b)
	}
}

// TestTOK06_CryptoTenantIsolation proves the same value under two different
// tenants produces two different tokens -- a leaked/guessed token from one
// tenant can never be correlated to another tenant's data.
func TestTOK06_CryptoTenantIsolation(t *testing.T) {
	secret := []byte("stable-secret")
	tokenA := crypto.GenerateDeterministicToken(secret, "tenant-A", "email", "same@example.com")
	tokenB := crypto.GenerateDeterministicToken(secret, "tenant-B", "email", "same@example.com")
	if tokenA == tokenB {
		t.Fatalf("GenerateDeterministicToken produced the SAME token for two different tenants (tenant-A, tenant-B) given the same value -- cross-tenant linkability")
	}
}

// TestTOK06_CryptoKindIsolation proves the same value tokenized as two
// different kinds (e.g. "phone" vs "email" columns that happen to hold the
// same string) produces different tokens -- prevents cross-field correlation.
func TestTOK06_CryptoKindIsolation(t *testing.T) {
	secret := []byte("stable-secret")
	tokenPhone := crypto.GenerateDeterministicToken(secret, "tenant-1", "phone", "same-value")
	tokenEmail := crypto.GenerateDeterministicToken(secret, "tenant-1", "email", "same-value")
	if tokenPhone == tokenEmail {
		t.Fatalf("GenerateDeterministicToken produced the SAME token for two different kinds given the same value")
	}
}

// TestTOK06_CryptoPinnedVector hardcodes a fixed secret/tenant/kind/value
// and its real, independently-verified output -- pins the algorithm so a
// future refactor of GenerateDeterministicToken can't silently change
// production token values without a test failing. The expected value below
// was computed by directly running the real function, not invented.
func TestTOK06_CryptoPinnedVector(t *testing.T) {
	secret := []byte("tok06-pinned-vector-secret-do-not-change")
	tenantID := "tenant-vector-fixed"
	kind := "account_number"
	value := crypto.NormalizeValue("  1234567890  ")

	const want = "d5ed25b30c233c54e3bb468ed0c9a0508a3c9dc3988d812e83f55210a9c23a31"
	got := crypto.GenerateDeterministicToken(secret, tenantID, kind, value)
	if got != want {
		t.Fatalf("GenerateDeterministicToken(...) = %q, want pinned vector %q -- the algorithm's output changed", got, want)
	}
}

// TestTOK06_CryptoAESGCMRoundTrip proves Encrypt -> Decrypt recovers the
// exact original plaintext.
func TestTOK06_CryptoAESGCMRoundTrip(t *testing.T) {
	key := make([]byte, 32) // AES-256
	for i := range key {
		key[i] = byte(i)
	}
	c := crypto.NewCrypto(key)

	plaintext := []byte("sensitive account number 1234567890")
	ciphertext, nonce, err := c.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt() error = %v", err)
	}

	got, err := c.Decrypt(ciphertext, nonce)
	if err != nil {
		t.Fatalf("Decrypt() error = %v", err)
	}
	if !bytes.Equal(got, plaintext) {
		t.Fatalf("Decrypt() = %q, want %q", got, plaintext)
	}
}

// TestTOK06_CryptoAESGCMNonceIsNeverReused proves two Encrypt calls on the
// identical plaintext produce different ciphertext and different nonces --
// GCM's security depends entirely on never reusing a nonce with the same key.
func TestTOK06_CryptoAESGCMNonceIsNeverReused(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	c := crypto.NewCrypto(key)

	plaintext := []byte("same plaintext both times")
	cipher1, nonce1, err := c.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt() #1 error = %v", err)
	}
	cipher2, nonce2, err := c.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt() #2 error = %v", err)
	}

	if bytes.Equal(nonce1, nonce2) {
		t.Fatal("two Encrypt() calls produced the SAME nonce -- catastrophic for AES-GCM (nonce reuse breaks confidentiality and authenticity)")
	}
	if bytes.Equal(cipher1, cipher2) {
		t.Fatal("two Encrypt() calls on identical plaintext produced identical ciphertext")
	}
}

// TestTOK06_CryptoAESGCMTamperDetection proves a corrupted ciphertext byte
// is rejected by Decrypt's AEAD integrity check rather than silently
// returning corrupted plaintext.
func TestTOK06_CryptoAESGCMTamperDetection(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	c := crypto.NewCrypto(key)

	ciphertext, nonce, err := c.Encrypt([]byte("authentic data"))
	if err != nil {
		t.Fatalf("Encrypt() error = %v", err)
	}

	tampered := append([]byte(nil), ciphertext...)
	tampered[0] ^= 0xFF // flip a bit

	if _, err := c.Decrypt(tampered, nonce); err == nil {
		t.Fatal("Decrypt() succeeded on a tampered ciphertext -- AEAD integrity check did not catch it")
	}
}
