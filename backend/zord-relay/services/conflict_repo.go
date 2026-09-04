package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
)

const (
	DefaultMaxConflictRetries = 3
	defaultPayloadSnippetLen  = 256
)

// ErrHashMismatch is the sentinel returned by HashVerifier.VerifyPayload
// when the recomputed SHA-256 does not match the upstream payload_hash.
// Callers MUST use errors.Is(..., ErrHashMismatch) to detect this case,
// rather than string-matching.
var ErrHashMismatch = errors.New("payload hash verification failed: mismatch between upstream payload_hash and recomputed SHA-256")

// HashVerificationDecision tells the caller how to handle a failed verification.
type HashVerificationDecision int

const (
	// DecisionNack means: do not publish, NACK the upstream lease.
	// The event will be re-leasable in a future cycle (we hope upstream fixed it).
	DecisionNack HashVerificationDecision = iota

	// DecisionAckPermanent means: we have NACKed this event enough times.
	// Do not publish. ACK it out of the upstream outbox to break the infinite
	// NACK loop. The conflict row has is_permanent=true for audit trail.
	DecisionAckPermanent
)

// HashVerificationResult is the outcome of VerifyPayload.
type HashVerificationResult struct {
	// OK is true iff the hash matched (or was skipped because empty + !strict).
	OK bool

	// Decision is only valid when OK=false.
	Decision HashVerificationDecision

	// The following fields are always populated on mismatch for logging.
	ExpectedHash  string
	ComputedHash  string
	ConflictCount int
}

// PayloadHashVerifier is the narrow interface consumed by worker/processor.
// It is safe for concurrent use.
type PayloadHashVerifier interface {
	// VerifyPayload re-hashes rawPayload bytes and compares to expectedHash.
	//
	// - serviceName, eventID, eventType, leaseID are used for persistence + metrics.
	// - If expectedHash is empty: returns OK=true with warn-log semantics unless
	//   strict mode is enabled (strict=true treats empty as conflict).
	// - On mismatch: persists a conflict row, increments conflict counter for
	//   this event, and returns DecisionNack until the event hits
	//   MaxConflictRetries, at which point DecisionAckPermanent is returned so
	//   the caller can ACK it out of the lease loop.
	VerifyPayload(
		ctx context.Context,
		serviceName string,
		eventID string,
		eventType string,
		leaseID string,
		rawPayload []byte,
		expectedHash string,
	) (HashVerificationResult, error)
}

// ConflictRepo implements PayloadHashVerifier backed by Postgres.
type ConflictRepo struct {
	db                  *sql.DB
	strict              bool
	maxConflictRetries  int

	// recentConflicts is a short-lived in-memory LRU-style counter used as a
	// fast-path before we hit the DB for conflict_count. Avoids hammering the
	// conflict table on every NACK cycle for a genuinely corrupt event.
	// Keyed by "serviceName:eventID".
	recentMu       sync.Mutex
	recentCounts   map[string]int
	recentMaxItems int
}

// ConflictRepoConfig configures a ConflictRepo.
type ConflictRepoConfig struct {
	// Strict treats an empty upstream payload_hash as a mismatch.
	// Default false (skip + warn log) so new upstream services can ship
	// without breaking the relay; flip to true once all upstreams guarantee
	// a populated payload_hash on every outbox row.
	Strict bool

	// MaxConflictRetries is how many times we NACK a conflicting event
	// before giving up and ACKing it out of the upstream outbox as a
	// permanent conflict. Default DefaultMaxConflictRetries.
	MaxConflictRetries int
}

// NewConflictRepo constructs a ConflictRepo backed by db.
func NewConflictRepo(db *sql.DB, cfg ConflictRepoConfig) *ConflictRepo {
	maxR := cfg.MaxConflictRetries
	if maxR <= 0 {
		maxR = DefaultMaxConflictRetries
	}
	return &ConflictRepo{
		db:                 db,
		strict:             cfg.Strict,
		maxConflictRetries: maxR,
		recentCounts:       make(map[string]int),
		recentMaxItems:     10000,
	}
}

// VerifyPayload implements PayloadHashVerifier.
func (r *ConflictRepo) VerifyPayload(
	ctx context.Context,
	serviceName string,
	eventID string,
	eventType string,
	leaseID string,
	rawPayload []byte,
	expectedHash string,
) (HashVerificationResult, error) {
	result := HashVerificationResult{
		ExpectedHash: expectedHash,
	}

	// --- 1. Compute SHA-256 over raw payload bytes (Option A) ---
	sum := sha256.Sum256(rawPayload)
	computed := hex.EncodeToString(sum[:])
	result.ComputedHash = computed

	// --- 2. Empty hash handling ---
	if strings.TrimSpace(expectedHash) == "" {
		if r.strict {
			return r.recordMismatch(ctx, serviceName, eventID, eventType, leaseID,
				expectedHash, computed, rawPayload, result)
		}
		result.OK = true
		return result, nil
	}

	// --- 3. Constant-time-ish comparison; case-insensitive hex match ---
	if strings.EqualFold(strings.TrimSpace(expectedHash), computed) {
		// Clean up in-memory counter if any previous transient failure
		// magically self-resolved (e.g. upstream row update).
		r.recentMu.Lock()
		delete(r.recentCounts, conflictKey(serviceName, eventID))
		r.recentMu.Unlock()

		result.OK = true
		return result, nil
	}

	// --- 4. Mismatch: persist + decide NACK vs ACK-permanent ---
	return r.recordMismatch(ctx, serviceName, eventID, eventType, leaseID,
		expectedHash, computed, rawPayload, result)
}

func (r *ConflictRepo) recordMismatch(
	ctx context.Context,
	serviceName, eventID, eventType, leaseID,
	expectedHash, computedHash string,
	rawPayload []byte,
	result HashVerificationResult,
) (HashVerificationResult, error) {
	key := conflictKey(serviceName, eventID)

	// Fast-path count via in-memory tracker.
	r.recentMu.Lock()
	memCount, ok := r.recentCounts[key]
	if ok {
		memCount++
	} else {
		memCount = 1
	}
	// Bound the map size; drop oldest entries on overflow (FIFO-ish — we don't
	// care much which ones, it's only a performance cache).
	if len(r.recentCounts) > r.recentMaxItems {
		for k := range r.recentCounts {
			delete(r.recentCounts, k)
			break
		}
	}
	r.recentCounts[key] = memCount
	r.recentMu.Unlock()

	// --- DB: UPSERT conflict row, increment conflict_count ---
	var (
		dbConflictCount int
		isPermanent     bool
	)
	const upsertSQL = `
		INSERT INTO relay_payload_conflicts
			(service_name, event_id, event_type, lease_id, expected_hash, computed_hash, payload_snippet, conflict_count, detected_at)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, 1, now())
		ON CONFLICT (service_name, event_id) DO UPDATE SET
			event_type      = EXCLUDED.event_type,
			lease_id        = EXCLUDED.lease_id,
			expected_hash   = EXCLUDED.expected_hash,
			computed_hash   = EXCLUDED.computed_hash,
			payload_snippet = EXCLUDED.payload_snippet,
			conflict_count  = relay_payload_conflicts.conflict_count + 1,
			detected_at     = now()
		RETURNING conflict_count, is_permanent
	`
	snippet := payloadSnippet(rawPayload)
	err := r.db.QueryRowContext(ctx, upsertSQL,
		serviceName,
		nullIfEmpty(eventID),
		nullIfEmpty(eventType),
		nullIfEmpty(leaseID),
		expectedHash,
		computedHash,
		snippet,
	).Scan(&dbConflictCount, &isPermanent)
	if err != nil {
		// Even if DB write fails, we should not publish — return the
		// mismatch decision using the memory-only count. Better safe than
		// sorry on an integrity check.
		result.OK = false
		if memCount > r.maxConflictRetries {
			result.Decision = DecisionAckPermanent
		} else {
			result.Decision = DecisionNack
		}
		result.ConflictCount = memCount
		return result, fmt.Errorf("conflict persistence query failed: %w", err)
	}

	// Use the authoritative DB count.
	result.OK = false
	result.ConflictCount = dbConflictCount

	// If the event was already marked permanent in a previous cycle, keep it so.
	if isPermanent || dbConflictCount >= r.maxConflictRetries {
		result.Decision = DecisionAckPermanent
		// Mark permanent in the DB (idempotent).
		if !isPermanent {
			const markPermSQL = `
				UPDATE relay_payload_conflicts
				SET is_permanent = true,
				    resolved_at  = now()
				WHERE service_name = $1 AND event_id = $2
			`
			_, _ = r.db.ExecContext(ctx, markPermSQL, serviceName, nullIfEmpty(eventID))
		}
	} else {
		result.Decision = DecisionNack
	}

	return result, nil
}

// MarkResolved can be called if a previously-conflicting event later succeeds
// (e.g. upstream fixed the payload_hash between cycles). Keeps the audit row
// but stamps resolved_at so the alerting query can filter it out.
func (r *ConflictRepo) MarkResolved(ctx context.Context, serviceName, eventID string) error {
	const sql = `
		UPDATE relay_payload_conflicts
		SET resolved_at = now()
		WHERE service_name = $1
		  AND event_id   = $2
		  AND resolved_at IS NULL
	`
	_, err := r.db.ExecContext(ctx, sql, serviceName, nullIfEmpty(eventID))
	return err
}

func conflictKey(serviceName, eventID string) string {
	return serviceName + "|" + eventID
}

func nullIfEmpty(s string) string {
	if s == "" {
		return ""
	}
	return s
}

func payloadSnippet(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	n := len(raw)
	if n > defaultPayloadSnippetLen {
		n = defaultPayloadSnippetLen
	}
	return string(raw[:n])
}

// Compile-time guard.
var _ PayloadHashVerifier = (*ConflictRepo)(nil)
