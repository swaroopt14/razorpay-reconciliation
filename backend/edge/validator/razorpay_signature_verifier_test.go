package validator

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestVerifyRazorpaySignatureValid(t *testing.T) {
	body := []byte(`{"event":"payment.captured","payload":{}}`)
	secret := "test_webhook_secret_123"

	// Compute expected signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	if err := VerifyRazorpaySignature(body, sig, secret); err != nil {
		t.Errorf("valid signature should pass, got: %v", err)
	}
}

func TestVerifyRazorpaySignatureRejectsChangedBody(t *testing.T) {
	original := []byte(`{"event":"payment.captured","amount":50000}`)
	modified := []byte(`{"event":"payment.captured","amount":50001}`)
	secret := "test_secret"

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(original)
	sig := hex.EncodeToString(mac.Sum(nil))

	if err := VerifyRazorpaySignature(modified, sig, secret); err == nil {
		t.Error("changed body should be rejected")
	}
}

func TestVerifyRazorpaySignatureRejectsWrongSecret(t *testing.T) {
	body := []byte(`{"event":"payment.captured"}`)
	correctSecret := "real_secret"
	wrongSecret := "wrong_secret"

	mac := hmac.New(sha256.New, []byte(correctSecret))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	if err := VerifyRazorpaySignature(body, sig, wrongSecret); err == nil {
		t.Error("wrong secret should be rejected")
	}
}

func TestVerifyRazorpaySignatureRejectsMalformedHex(t *testing.T) {
	body := []byte(`{"event":"test"}`)
	if err := VerifyRazorpaySignature(body, "not-hex-at-all!", "secret"); err == nil {
		t.Error("malformed hex should be rejected")
	}
}

func TestVerifyRazorpaySignatureRejectsMissingInputs(t *testing.T) {
	tests := []struct {
		name    string
		body    []byte
		sig     string
		secret  string
	}{
		{"empty body", nil, "abc", "secret"},
		{"empty signature", []byte("body"), "", "secret"},
		{"empty secret", []byte("body"), "abc", ""},
		{"all empty", nil, "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := VerifyRazorpaySignature(tt.body, tt.sig, tt.secret); err == nil {
				t.Error("should reject missing inputs")
			}
		})
	}
}

func TestVerifyRazorpaySignatureUsesRawBytes(t *testing.T) {
	secret := "raw_bytes_test_secret"

	// Sign with specific whitespace
	bodyWithSpaces := []byte(`{"event": "payment.captured", "amount": 50000}`)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(bodyWithSpaces)
	sig := hex.EncodeToString(mac.Sum(nil))

	// Same content without spaces — should FAIL (raw bytes matter)
	bodyNoSpaces := []byte(`{"event":"payment.captured","amount":50000}`)
	if err := VerifyRazorpaySignature(bodyNoSpaces, sig, secret); err == nil {
		t.Error("changing whitespace should fail — raw bytes must match exactly")
	}

	// Same exact bytes — should PASS
	if err := VerifyRazorpaySignature(bodyWithSpaces, sig, secret); err != nil {
		t.Errorf("exact same bytes should pass, got: %v", err)
	}
}

func TestSignRazorpayWebhook(t *testing.T) {
	body := []byte(`{"event":"payment.captured"}`)
	secret := "test_secret"

	sig := SignRazorpayWebhook(body, secret)

	// Verify the signed result is valid
	if err := VerifyRazorpaySignature(body, sig, secret); err != nil {
		t.Errorf("SignRazorpayWebhook output should verify, got: %v", err)
	}

	// Verify hex format
	if _, err := hex.DecodeString(sig); err != nil {
		t.Errorf("signature should be valid hex, got: %v", err)
	}
}

func TestVerifyRazorpaySignatureRejectsEmptySignature(t *testing.T) {
	body := []byte(`{"event":"test"}`)
	if err := VerifyRazorpaySignature(body, "", "secret"); err == nil {
		t.Error("empty signature should be rejected")
	}
}

func TestVerifyRazorpaySignatureRejectsTruncatedSignature(t *testing.T) {
	body := []byte(`{"event":"test"}`)
	secret := "test_secret"

	sig := SignRazorpayWebhook(body, secret)
	// Truncate to half length
	truncated := sig[:len(sig)/2]

	if err := VerifyRazorpaySignature(body, truncated, secret); err == nil {
		t.Error("truncated signature should be rejected")
	}
}
