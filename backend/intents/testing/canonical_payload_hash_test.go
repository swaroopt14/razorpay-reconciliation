package audittests

// Fix (not an audit ticket): Relay's payload-integrity check was comparing
// SHA-256 of the outbox row's canonical `payload` against `payload_hash` --
// which is SHA-256 of the raw, pre-canonicalization payload, verified at
// ingest time as a security gate (internal/services/intent_service.go's
// ingest-time recompute-and-compare, ~line 1422) before the canonical
// payload even exists. Those are hashes of two different byte sequences by
// construction, so the comparison always failed once payload_hash actually
// started reaching Relay (a separate fix, "INT-02").
//
// The fix adds a second field, canonical_payload_hash, computed from the
// exact bytes stored in the outbox row's `payload` column.
//
// It is deliberately a Postgres GENERATED ALWAYS AS ... STORED column (see
// db/migrations/20260812150000_add_canonical_payload_hash_to_outbox.sql),
// not a value computed in Go before insert. `payload` is JSONB, and
// Postgres reformats JSON on storage (e.g. whitespace); a hash computed
// from the pre-insert Go []byte was verified (against a real Postgres
// instance during development) to NOT match a hash recomputed later from
// what Postgres actually stores and returns. Deriving the hash inside the
// database, from the stored representation, guarantees it always matches
// exactly what a reader (e.g. Relay, via the lease response) will receive.
// payload_hash's existing meaning and ingest-time security check are
// untouched.
//
// Because canonical_payload_hash is a generated column, the application
// must never attempt to write to it -- Postgres rejects any INSERT that
// references a generated column.
//
// Run with: go test ./testing/... -run TestCanonicalPayloadHash -v

import (
	"testing"

	"zord-intent-engine/internal/persistence"
)

// TestCanonicalPayloadHashColumnNeverAppInserted proves the app-managed
// INSERT column list never references canonical_payload_hash. If it did,
// every outbox INSERT would fail outright (Postgres: "cannot insert into
// column ... it is a generated column").
func TestCanonicalPayloadHashColumnNeverAppInserted(t *testing.T) {
	for _, col := range persistence.OutboxInsertColumns {
		if col == "canonical_payload_hash" {
			t.Fatalf("OutboxInsertColumns includes %q, but it is a Postgres GENERATED column -- the database rejects explicit INSERTs into it", col)
		}
	}
	t.Log("CONFIRMED: canonical_payload_hash is absent from OutboxInsertColumns, as required for a generated column.")
}

// TestCanonicalPayloadHashColumnIsLeaseExposed proves the lease projection
// still selects canonical_payload_hash -- generated columns are freely
// readable, and Relay needs this field to verify payload integrity.
func TestCanonicalPayloadHashColumnIsLeaseExposed(t *testing.T) {
	found := false
	for _, col := range persistence.OutboxLeaseColumnAliases() {
		if col == "canonical_payload_hash" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("canonical_payload_hash is not exposed in the lease response -- Relay has no way to verify payload integrity without it")
	}
	t.Log("CONFIRMED: canonical_payload_hash is selected by the lease projection.")
}
