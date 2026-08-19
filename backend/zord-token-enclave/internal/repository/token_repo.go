package repository

import (
	"context"
	"database/sql"
	"fmt"

	"time"

	"zord-token-enclave/internal/models"

	"github.com/google/uuid"
)

type TokenRepository struct {
	db *sql.DB
}

func NewTokenRepository(db *sql.DB) *TokenRepository {
	return &TokenRepository{db: db}
}

// Insert stores a token record and writes a TOKENIZE audit row atomically.
// ON CONFLICT uses the composite primary key (tenant_id, kind, token_id) —
// idempotent re-tokenization of the same value for the same tenant+kind is safe.
func (r *TokenRepository) Insert(ctx context.Context, t models.TokenRecord) error {

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert token_map — conflict on composite PK (tenant_id, kind, token_id)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO token_map
		(token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at, normalization_version, secret_version)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (tenant_id, kind, token_id) DO NOTHING
	`,
		t.TokenID,
		t.TenantID,
		t.Kind,
		t.Ciphertext,
		t.Nonce,
		t.EncryptionKeyID,
		t.KeyVersion,
		t.Status,
		time.Now().UTC(),
		t.NormalizationVersion,
		t.SecretVersion,
	)
	if err != nil {
		return err
	}

	// Insert token_audit — all columns including new ones
	_, err = tx.ExecContext(ctx, `
		INSERT INTO token_audit
		(audit_id, token_id, tenant_id, actor, action, purpose, decision,
		 trace_id, caller, object_ref, purpose_code, correlation_id, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
	`,
		uuid.New().String(),
		t.TokenID,
		t.TenantID,
		t.Actor, // was hardcoded "service-2"
		"TOKENIZE",
		"INTENT_PROCESSING",
		"ALLOW",
		t.TraceID, // was hardcoded ""
		t.Actor,   // caller = same as actor for tokenize
		"",        // object_ref not applicable for tokenize
		"INTENT_PROCESSING",
		"", // correlation_id
		time.Now().UTC(),
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// Get fetches a token record and writes a detokenize audit entry atomically.
// caller, purposeCode, objectRef, correlationID are required for the audit.
// If the audit INSERT fails, Get returns an error — fail closed, never fail open.
func (r *TokenRepository) Get(
	ctx context.Context,
	tokenID string,
	tenantID string,
	caller string,
	purposeCode string,
	objectRef string,
	correlationID string,
) (*models.TokenRecord, error) {

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var rec models.TokenRecord
	err = tx.QueryRowContext(ctx, `
		SELECT token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at, normalization_version, secret_version
		FROM token_map
		WHERE token_id = $1 AND tenant_id = $2
	`, tokenID, tenantID).Scan(
		&rec.TokenID, &rec.TenantID, &rec.Kind,
		&rec.Ciphertext, &rec.Nonce,
		&rec.EncryptionKeyID, &rec.KeyVersion,
		&rec.Status, &rec.CreatedAt,
		&rec.NormalizationVersion, &rec.SecretVersion,
	)
	if err != nil {
		// Write DENY audit before returning — commit it even on select failure
		_ = r.writeAuditInTx(ctx, tx, tokenID, tenantID, caller, "DETOKENIZE",
			"DENY", purposeCode, objectRef, correlationID)
		_ = tx.Commit()
		return nil, err
	}

	// Write ALLOW audit — fail closed: if audit fails, detokenize fails
	if err := r.writeAuditInTx(ctx, tx, tokenID, tenantID, caller, "DETOKENIZE",
		"ALLOW", purposeCode, objectRef, correlationID); err != nil {
		return nil, err // intentionally fail closed
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &rec, nil
}

// WriteAuthzDenialAudit records a TOK-04 authorization denial -- an invalid/
// forged/expired service JWT, a purpose_code outside the caller's allowed
// scope, or a missing object_ref/correlation_id. Called from contexts with
// no token row (and often no verified tenant_id/caller either) to tie a
// transaction to, so it writes directly rather than through writeAuditInTx.
// Best-effort: logging a denial must never block or fail the denial itself,
// so callers should not treat a write error here as fatal.
func (r *TokenRepository) WriteAuthzDenialAudit(
	ctx context.Context,
	tenantID, caller, action, purposeCode, objectRef, correlationID, reason string,
) error {
	var tenantIDArg any
	if tenantID != "" {
		tenantIDArg = tenantID
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO token_audit
		(audit_id, token_id, tenant_id, actor, action, purpose, decision,
		 trace_id, caller, object_ref, purpose_code, correlation_id, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
	`,
		uuid.New().String(),
		"",
		tenantIDArg,
		caller,
		action,
		reason,
		"DENY",
		"",
		caller,
		objectRef,
		purposeCode,
		correlationID,
		time.Now().UTC(),
	)
	return err
}

func (r *TokenRepository) writeAuditInTx(
	ctx context.Context,
	tx *sql.Tx,
	tokenID, tenantID, caller, action, decision,
	purposeCode, objectRef, correlationID string,
) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO token_audit
		(audit_id, token_id, tenant_id, actor, action, purpose, decision,
		 trace_id, caller, object_ref, purpose_code, correlation_id, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
	`,
		uuid.New().String(),
		tokenID,
		tenantID,
		caller,
		action,
		purposeCode,
		decision,
		"",
		caller,
		objectRef,
		purposeCode,
		correlationID,
		time.Now().UTC(),
	)
	return err
}

func (r *TokenRepository) GetActiveKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error) {

	query := `
	SELECT key_id, tenant_id, key_version, encrypted_key, wrapped, kms_key_id, status, active_from
	FROM token_encryption_keys
	WHERE tenant_id = $1 AND status = 'ACTIVE'
	LIMIT 1
	`

	var k models.EncryptionKey
	var encryptedKey []byte
	var kmsKeyID sql.NullString

	err := r.db.QueryRowContext(ctx, query, tenantID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&encryptedKey,
		&k.Wrapped,
		&kmsKeyID,
		&k.Status,
		&k.ActiveFrom,
	)
	if err != nil {
		return nil, err
	}

	k.RawKey = encryptedKey
	k.KMSKeyID = kmsKeyID.String

	return &k, nil
}

func (r *TokenRepository) GetKeyByID(ctx context.Context, keyID string) (*models.EncryptionKey, error) {

	query := `
	SELECT key_id, tenant_id, key_version, encrypted_key, wrapped, kms_key_id, status, active_from
	FROM token_encryption_keys
	WHERE key_id = $1
	`

	var k models.EncryptionKey
	var encryptedKey []byte
	var kmsKeyID sql.NullString

	err := r.db.QueryRowContext(ctx, query, keyID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&encryptedKey,
		&k.Wrapped,
		&kmsKeyID,
		&k.Status,
		&k.ActiveFrom,
	)
	if err != nil {
		return nil, err
	}

	k.RawKey = encryptedKey
	k.KMSKeyID = kmsKeyID.String

	return &k, nil
}

// RotateKey performs a full rotation for tenantID inside one transaction,
// gated by a non-blocking, transaction-scoped Postgres advisory lock keyed
// per tenant (TOK-07: "Coordinate key rotation across replicas"). If another
// replica is already rotating this same tenant, this returns (false, nil) --
// not an error, an expected outcome under concurrent replicas -- and performs
// no writes. pg_try_advisory_xact_lock self-releases on COMMIT, ROLLBACK, or
// a dead connection, so a crash mid-rotation leaves nothing to clean up: the
// whole transaction simply never committed, and the tenant is still eligible
// for rotation on the next attempt.
func (r *TokenRepository) RotateKey(ctx context.Context, tenantID string, newKeyID string, newKey []byte, kmsKeyID string, createdBy string) (bool, error) {

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	acquired, err := tryAcquireRotationXactLock(ctx, tx, tenantID)
	if err != nil {
		return false, err
	}
	if !acquired {
		return false, nil
	}

	if err := rotateKeyTx(ctx, tx, tenantID, newKeyID, newKey, kmsKeyID, createdBy); err != nil {
		return false, err
	}

	if err := tx.Commit(); err != nil {
		return false, err
	}

	return true, nil
}

// RotateKeyIfStale is RotateKey's auto-rotation-safe twin: after acquiring
// the SAME per-tenant advisory lock (same key, same lock space -- a session
// or another transaction already holding it blocks this one regardless of
// which of the two functions is asking), it re-reads the current active
// key's active_from INSIDE that lock -- not the possibly-stale read the
// caller made before ever attempting to acquire -- and only rotates if it's
// still older than maxAge. This closes the race a lock alone cannot close:
// two replicas can both read the same stale key before either acquires the
// lock; the lock alone only serializes the eventual WRITE (replica B would
// still rotate again right after replica A releases). Re-validating the
// READ that justified the write, inside the same critical section the write
// happens in, is what makes "one effective rotation" hold even in that
// sequential-not-concurrent sub-case.
//
// Deliberately its own transaction/lock-acquire rather than a precondition
// bolted onto RotateKey: callers that want unconditional rotation
// (EnsureInitialKey's bootstrap path, the manual admin handler) must never
// have their explicit request silently no-op against a staleness check that
// has nothing to do with why they're calling.
func (r *TokenRepository) RotateKeyIfStale(ctx context.Context, tenantID string, newKeyID string, newKey []byte, kmsKeyID string, createdBy string, maxAge time.Duration) (bool, error) {

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	acquired, err := tryAcquireRotationXactLock(ctx, tx, tenantID)
	if err != nil {
		return false, err
	}
	if !acquired {
		return false, nil
	}

	var activeFrom time.Time
	err = tx.QueryRowContext(ctx, `
		SELECT active_from FROM token_encryption_keys
		WHERE tenant_id = $1 AND status = 'ACTIVE'
	`, tenantID).Scan(&activeFrom)
	if err != nil {
		return false, err
	}
	if time.Since(activeFrom) < maxAge {
		// No longer stale -- another replica already rotated it in the
		// window between our caller's read and this lock acquisition.
		return false, nil
	}

	if err := rotateKeyTx(ctx, tx, tenantID, newKeyID, newKey, kmsKeyID, createdBy); err != nil {
		return false, err
	}

	if err := tx.Commit(); err != nil {
		return false, err
	}

	return true, nil
}

func tryAcquireRotationXactLock(ctx context.Context, tx *sql.Tx, tenantID string) (bool, error) {
	var acquired bool
	err := tx.QueryRowContext(ctx,
		`SELECT pg_try_advisory_xact_lock(hashtextextended('token-rotation:'||$1, 0))`,
		tenantID,
	).Scan(&acquired)
	return acquired, err
}

// rotateKeyTx is the actual key-swap: mark the current ACTIVE key RETIRING,
// insert the new one ACTIVE. Callers MUST already hold the per-tenant
// advisory lock (via tryAcquireRotationXactLock in the SAME tx) before
// calling this -- it performs no locking of its own. newKey is always a
// KMS-wrapped ciphertext blob (TOK-03: services.TokenService generates it
// via keyManager.WrapNewDEK, never a raw DEK) -- wrapped is hardcoded true
// for every row this function writes.
func rotateKeyTx(ctx context.Context, tx *sql.Tx, tenantID string, newKeyID string, newKey []byte, kmsKeyID string, createdBy string) error {
	// 1️⃣ Mark current ACTIVE key as RETIRING
	if _, err := tx.ExecContext(ctx, `
		UPDATE token_encryption_keys
		SET status = 'RETIRING', retire_from = now()
		WHERE tenant_id = $1 AND status = 'ACTIVE'
	`, tenantID); err != nil {
		return err
	}

	// 2️⃣ Insert new ACTIVE key (V2)
	_, err := tx.ExecContext(ctx, `
		INSERT INTO token_encryption_keys
		(key_id, tenant_id, key_version, encrypted_key, wrapped, kms_key_id, status, active_from, created_by)
		VALUES ($1, $2, $3, $4, true, $5, 'ACTIVE', now(), $6)
	`,
		newKeyID,
		tenantID,
		getNextVersion(ctx, tx, tenantID), // helper (below)
		newKey,
		kmsKeyID,
		createdBy,
	)
	return err
}

func getNextVersion(ctx context.Context, tx *sql.Tx, tenantID string) int {

	var version int

	err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(key_version), 0) + 1
		FROM token_encryption_keys
		WHERE tenant_id = $1
	`, tenantID).Scan(&version)

	if err != nil {
		return 1
	}

	return version
}

func (r *TokenRepository) GetRetiringKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error) {

	var k models.EncryptionKey
	var raw []byte
	var kmsKeyID sql.NullString

	err := r.db.QueryRowContext(ctx, `
		SELECT key_id, tenant_id, key_version, encrypted_key, wrapped, kms_key_id, status
		FROM token_encryption_keys
		WHERE tenant_id = $1 AND status = 'RETIRING'
		LIMIT 1
	`, tenantID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&raw,
		&k.Wrapped,
		&kmsKeyID,
		&k.Status,
	)

	if err != nil {
		return nil, err
	}

	k.RawKey = raw
	k.KMSKeyID = kmsKeyID.String
	return &k, nil
}

func (r *TokenRepository) GetTokensByKey(ctx context.Context, keyID string, limit int) ([]models.TokenRecord, error) {

	rows, err := r.db.QueryContext(ctx, `
	SELECT token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at
	FROM token_map
	WHERE encryption_key_id = $1
	ORDER BY created_at
	LIMIT $2
`, keyID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []models.TokenRecord

	for rows.Next() {
		var t models.TokenRecord

		err := rows.Scan(
			&t.TokenID,
			&t.TenantID,
			&t.Kind,
			&t.Ciphertext,
			&t.Nonce,
			&t.EncryptionKeyID,
			&t.KeyVersion,
			&t.Status,
			&t.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		tokens = append(tokens, t)
	}

	return tokens, nil
}

// UpdateTokenKey re-encrypts one token under a new DEK during a key-
// rotation migration sweep (TOK-05: "Scope token-key updates by the full
// composite identity"). The UPDATE's WHERE clause is the table's actual
// PRIMARY KEY (tenant_id, kind, token_id), not token_id alone -- a
// deterministic token_id collision across tenants/kinds is cryptographically
// implausible (GenerateDeterministicToken already mixes tenant_id and kind
// into the HMAC), but a programming error passing a mismatched tenant_id/
// kind for a real token_id must not be able to silently update -- or
// silently no-op against -- the wrong row. Wrapped in one transaction with
// an immutable token_audit entry: if the UPDATE affects anything other than
// exactly one row (0 = the composite identity didn't match reality, >1 is
// structurally impossible given the PK but asserted anyway per the audit's
// literal wording), the whole rotation step aborts and rolls back rather
// than silently succeeding or partially applying.
func (r *TokenRepository) UpdateTokenKey(
	ctx context.Context,
	tenantID, kind, tokenID string,
	ciphertext, nonce []byte,
	newKeyID string,
	newVersion int,
) error {

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `
		UPDATE token_map
		SET ciphertext = $1,
		    nonce = $2,
		    encryption_key_id = $3,
		    key_version = $4
		WHERE tenant_id = $5 AND kind = $6 AND token_id = $7
	`, ciphertext, nonce, newKeyID, newVersion, tenantID, kind, tokenID)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected != 1 {
		return fmt.Errorf(
			"UpdateTokenKey: expected exactly 1 row for tenant=%s kind=%s token_id=%s, affected %d -- aborting rotation",
			tenantID, kind, tokenID, rowsAffected,
		)
	}

	// Immutable audit trail for the key-rotation update itself -- reuses
	// the same append-only token_audit table Tokenize/Detokenize already
	// write to, in the SAME transaction so the update and its audit record
	// are atomic (either both commit or neither does).
	if err := r.writeAuditInTx(ctx, tx, tokenID, tenantID, "system:key-rotation",
		"KEY_ROTATION", "ALLOW", "KEY_ROTATION", newKeyID, ""); err != nil {
		return err
	}

	return tx.Commit()
}

func (r *TokenRepository) CountTokensByKey(ctx context.Context, keyID string) (int, error) {

	var count int

	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM token_map
		WHERE encryption_key_id = $1
	`, keyID).Scan(&count)

	return count, err
}

func (r *TokenRepository) MarkKeyRetired(ctx context.Context, keyID string) error {

	_, err := r.db.ExecContext(ctx, `
		UPDATE token_encryption_keys
		SET status = 'RETIRED',
		    fully_retired_at = now()
		WHERE key_id = $1
	`, keyID)

	return err
}

func (r *TokenRepository) GetAllTenants(ctx context.Context) ([]string, error) {

	rows, err := r.db.QueryContext(ctx, `
		SELECT DISTINCT tenant_id FROM token_encryption_keys
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenants []string

	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		tenants = append(tenants, t)
	}

	return tenants, nil
}
