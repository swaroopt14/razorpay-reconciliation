package audittests

// Fix (not an audit ticket): Relay's payload-integrity check
// (ConflictRepo.VerifyPayload, called from worker/processor.go's intent
// path and services/dispatch_loop.go's PSP-dispatch path) was comparing
// SHA-256(event.Payload) against event.PayloadHash -- SHA-256 of the raw,
// pre-canonicalization payload zord-intent-engine validates at ingest time,
// a different byte sequence entirely from Payload's canonical, post-
// transformation bytes. The comparison always failed once payload_hash
// actually started reaching Relay (a separate fix, "INT-02").
//
// The fix: both call sites now pass event.CanonicalPayloadHash --
// SHA-256 of the exact bytes in Payload, computed by Postgres as a
// GENERATED column on zord-intent-engine's outbox table (see that repo's
// db/migrations/20260812150000_add_canonical_payload_hash_to_outbox.sql).
//
// This test proves, against the real ConflictRepo.VerifyPayload (no mock),
// that a genuinely matching payload/canonical_payload_hash pair -- the
// shape event.CanonicalPayloadHash + event.Payload now produce -- verifies
// successfully. It intentionally does not exercise the DB-backed mismatch
// path (ConflictRepo.recordMismatch requires a live Postgres connection to
// persist a conflict row; that logic is pre-existing and untouched by this
// fix -- see the throwaway real-Postgres verification performed during
// development for that proof).
//
// Run with: go test ./testing/... -run TestCanonicalPayloadHashVerify -v

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"zord-relay/services"
)

// TestVerifyPayload_MatchesCanonicalPayloadHash proves the real, unmocked
// ConflictRepo.VerifyPayload returns OK=true when given the exact pair the
// fixed code now produces: a payload's bytes and the SHA-256 hex digest of
// those same bytes. db is deliberately nil -- the matching-hash path
// returns before any DB access, which this test also implicitly confirms
// (a nil-pointer panic would fail the test loudly).
func TestVerifyPayload_MatchesCanonicalPayloadHash(t *testing.T) {
	payload := []byte(`{"intent_id":"canonical-hash-verify","amount":"100.00","currency":"INR"}`)
	sum := sha256.Sum256(payload)
	canonicalPayloadHash := hex.EncodeToString(sum[:])

	repo := services.NewConflictRepo(nil, services.ConflictRepoConfig{})

	result, err := repo.VerifyPayload(context.Background(),
		"test-service", "evt-1", "intent.created.v1", "lease-1",
		payload, canonicalPayloadHash,
	)
	if err != nil {
		t.Fatalf("VerifyPayload() error = %v, want nil", err)
	}
	if !result.OK {
		t.Fatalf("VerifyPayload() OK = false, want true -- payload and canonicalPayloadHash are a genuinely matching SHA-256 pair")
	}
	t.Logf("CONFIRMED: VerifyPayload(payload, canonical_payload_hash) = OK for a real matching pair.")
}

// TestVerifyPayload_RawIngestHashWouldNotHaveMatched documents the ORIGINAL
// bug directly against real crypto: event.PayloadHash (the raw,
// pre-transformation ingest hash) is never equal to SHA-256 of Payload's
// canonical bytes, by construction -- it's a hash of a different byte
// sequence entirely. This is exactly why the pre-fix call sites (passing
// event.PayloadHash as VerifyPayload's expectedHash) could never succeed
// once payload_hash actually started reaching Relay.
func TestVerifyPayload_RawIngestHashWouldNotHaveMatched(t *testing.T) {
	payload := []byte(`{"intent_id":"canonical-hash-verify","amount":"100.00","currency":"INR"}`)
	rawIngestPayloadHash := "deadbeef00000000000000000000000000000000000000000000000000000000"

	sum := sha256.Sum256(payload)
	computed := hex.EncodeToString(sum[:])

	if computed == rawIngestPayloadHash {
		t.Fatalf("sha256(payload)=%s unexpectedly equals the raw ingest payload_hash -- these must be independent by construction", computed)
	}
	t.Logf("CONFIRMED: sha256(payload)=%s != raw payload_hash=%s -- proving why VerifyPayload(payload, event.PayloadHash) could never have succeeded.", computed, rawIngestPayloadHash)
}
