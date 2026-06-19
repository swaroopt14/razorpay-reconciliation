package repository

import (
	"context"
	"database/sql"

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
		(token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
		t.Actor,             // was hardcoded "service-2"
		"TOKENIZE",
		"INTENT_PROCESSING",
		"ALLOW",
		t.TraceID,           // was hardcoded ""
		t.Actor,             // caller = same as actor for tokenize
		"",                  // object_ref not applicable for tokenize
		"INTENT_PROCESSING",
		"",                  // correlation_id
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
		SELECT token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at
		FROM token_map
		WHERE token_id = $1 AND tenant_id = $2
	`, tokenID, tenantID).Scan(
		&rec.TokenID, &rec.TenantID, &rec.Kind,
		&rec.Ciphertext, &rec.Nonce,
		&rec.EncryptionKeyID, &rec.KeyVersion,
		&rec.Status, &rec.CreatedAt,
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
	SELECT key_id, tenant_id, key_version, encrypted_key, status, active_from
	FROM token_encryption_keys
	WHERE tenant_id = $1 AND status = 'ACTIVE'
	LIMIT 1
	`

	var k models.EncryptionKey
	var encryptedKey []byte

	err := r.db.QueryRowContext(ctx, query, tenantID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&encryptedKey,
		&k.Status,
		&k.ActiveFrom,
	)
	if err != nil {
		return nil, err
	}

	k.RawKey = encryptedKey

	return &k, nil
}

func (r *TokenRepository) GetKeyByID(ctx context.Context, keyID string) (*models.EncryptionKey, error) {

	query := `
	SELECT key_id, tenant_id, key_version, encrypted_key, status, active_from
	FROM token_encryption_keys
	WHERE key_id = $1
	`

	var k models.EncryptionKey
	var encryptedKey []byte

	err := r.db.QueryRowContext(ctx, query, keyID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&encryptedKey,
		&k.Status,
		&k.ActiveFrom,
	)
	if err != nil {
		return nil, err
	}

	k.RawKey = encryptedKey

	return &k, nil
}

func (r *TokenRepository) RotateKey(ctx context.Context, tenantID string, newKeyID string, newKey []byte, createdBy string) error {

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// No manual count check here; handled by service-layer singleflight and DB constraints.

	// 1️⃣ Mark current ACTIVE key as RETIRING
	_, err = tx.ExecContext(ctx, `
		UPDATE token_encryption_keys
		SET status = 'RETIRING', retire_from = now()
		WHERE tenant_id = $1 AND status = 'ACTIVE'
	`, tenantID)
	if err != nil {
		return err
	}

	// 2️⃣ Insert new ACTIVE key (V2)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO token_encryption_keys
		(key_id, tenant_id, key_version, encrypted_key, status, active_from, created_by)
		VALUES ($1, $2, $3, $4, 'ACTIVE', now(), $5)
	`,
		newKeyID,
		tenantID,
		getNextVersion(ctx, tx, tenantID), // helper (below)
		newKey,
		createdBy,
	)
	if err != nil {
		return err
	}

	return tx.Commit()

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

	err := r.db.QueryRowContext(ctx, `
		SELECT key_id, tenant_id, key_version, encrypted_key, status
		FROM token_encryption_keys
		WHERE tenant_id = $1 AND status = 'RETIRING'
		LIMIT 1
	`, tenantID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&raw,
		&k.Status,
	)

	if err != nil {
		return nil, err
	}

	k.RawKey = raw
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

func (r *TokenRepository) UpdateTokenKey(
	ctx context.Context,
	tokenID string,
	ciphertext, nonce []byte,
	newKeyID string,
	newVersion int,
) error {

	_, err := r.db.ExecContext(ctx, `
		UPDATE token_map
		SET ciphertext = $1,
		    nonce = $2,
		    encryption_key_id = $3,
		    key_version = $4
		WHERE token_id = $5
	`, ciphertext, nonce, newKeyID, newVersion, tokenID)

	return err
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
