package services

// signer_test.go — Phase 5 (refactor) unit tests for DevSigner: the
// "internal verification test" clarification §5 lists as in-scope for
// signing's Phase 1. No DB required.

import (
	"context"
	"testing"
)

func TestDevSigner_SignVerify_RoundTrip(t *testing.T) {
	s := NewDevSigner()
	ctx := context.Background()

	result, err := s.Sign(ctx, "somepayloadhash")
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if result.Signature == "" {
		t.Fatal("Sign returned empty signature")
	}
	if result.Algorithm != devSignerAlgorithm {
		t.Errorf("Algorithm = %q, want %q", result.Algorithm, devSignerAlgorithm)
	}
	if result.SignedAt.IsZero() {
		t.Error("SignedAt was not set")
	}

	ok, err := s.Verify(ctx, "somepayloadhash", result.Signature, result.KeyID)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !ok {
		t.Fatal("Verify returned false for a signature just produced by Sign")
	}
}

func TestDevSigner_Verify_RejectsTamperedSignature(t *testing.T) {
	s := NewDevSigner()
	ctx := context.Background()

	result, err := s.Sign(ctx, "somepayloadhash")
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	ok, err := s.Verify(ctx, "somepayloadhash", result.Signature+"tampered", result.KeyID)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if ok {
		t.Fatal("Verify accepted a tampered signature")
	}
}

func TestDevSigner_Verify_RejectsWrongPayloadHash(t *testing.T) {
	s := NewDevSigner()
	ctx := context.Background()

	result, err := s.Sign(ctx, "originalhash")
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	// Same signature, but verifying against a DIFFERENT payload hash than
	// what was actually signed — must fail (this is what makes the
	// signature bind to the payload, not just to the key).
	ok, err := s.Verify(ctx, "differenthash", result.Signature, result.KeyID)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if ok {
		t.Fatal("Verify accepted a signature against a different payload hash than what was signed")
	}
}
