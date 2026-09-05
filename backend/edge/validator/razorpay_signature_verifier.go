package validator

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

// ErrInvalidRazorpaySignature is returned when the webhook signature does not match.
var ErrInvalidRazorpaySignature = errors.New("invalid Razorpay webhook signature")

// VerifyRazorpaySignature verifies the X-Razorpay-Signature header.
//
// Razorpay computes HMAC-SHA256 of the raw request body using the webhook secret,
// then sends the hex digest in the X-Razorpay-Signature header.
//
// This function uses hmac.Equal for timing-safe comparison to prevent side-channel attacks.
//
// Reference: https://razorpay.com/docs/webhooks/validate-test/
func VerifyRazorpaySignature(rawBody []byte, receivedHex string, webhookSecret string) error {
	if len(rawBody) == 0 || receivedHex == "" || webhookSecret == "" {
		return ErrInvalidRazorpaySignature
	}

	// Compute expected HMAC-SHA256 of the raw body
	mac := hmac.New(sha256.New, []byte(webhookSecret))
	_, _ = mac.Write(rawBody)
	expected := mac.Sum(nil)

	// Decode the received hex signature
	received, err := hex.DecodeString(receivedHex)
	if err != nil {
		return ErrInvalidRazorpaySignature
	}

	// Timing-safe comparison — never leaks through timing
	if !hmac.Equal(expected, received) {
		return ErrInvalidRazorpaySignature
	}

	return nil
}

// SignRazorpayWebhook computes the X-Razorpay-Signature for a given body and secret.
// Used in tests and mock servers.
func SignRazorpayWebhook(body []byte, webhookSecret string) string {
	mac := hmac.New(sha256.New, []byte(webhookSecret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}
