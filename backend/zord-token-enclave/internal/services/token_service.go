package services

import (
	"context"
	"errors"
	"log"
	"os"
	"time"

	"zord-token-enclave/internal/crypto"
	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/models"
	"zord-token-enclave/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"
)

// autoRotationMaxAge is the staleness threshold AutoRotateKeys uses -- kept
// as a named constant since RotateKeyIfStale (repository layer) needs the
// exact same value to re-validate under its lock.
const autoRotationMaxAge = 10 * 30 * 24 * time.Hour // ~10 months, matches AddDate(0, 10, 0) below

// ErrRotationInProgress signals that another replica is currently
// rotating/initializing this tenant's key. It is a TRANSIENT condition --
// callers on synchronous request paths (EnsureInitialKey) must propagate it
// as an error so it flows into the existing TOK-01/TOK-02 retry machinery,
// not swallow it as success.
var ErrRotationInProgress = errors.New("token rotation already in progress for this tenant")

// replicaID identifies this process in key_rotation_jobs rows, purely for
// log/forensic correlation across replicas -- never used for coordination.
func replicaID() string {
	host, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return host
}

// releaseRotationLock always unlocks on a FRESH, short-timeout context, not
// the caller's ctx -- see repository.RotationLock.Release's doc comment for
// why passing a possibly-canceled ctx here would leak the lock.
func releaseRotationLock(lock *repository.RotationLock, tenantID string) {
	releaseCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := lock.Release(releaseCtx); err != nil {
		log.Printf("⚠️ failed to release rotation lock for tenant %s: %v", tenantID, err)
	}
}

type TokenService struct {
	repo        *repository.TokenRepository
	keyManager  keymanager.KeyManager
	tokenSecret []byte             // for deterministic tokenization
	tenantGroup singleflight.Group // per-tenant concurrency control
	tokenSem    chan struct{}      // limit global tokenization concurrency
}

func NewTokenService(r *repository.TokenRepository, km keymanager.KeyManager, secret []byte) *TokenService {
	return &TokenService{
		repo:        r,
		keyManager:  km,
		tokenSecret: secret,
		tenantGroup: singleflight.Group{},
		tokenSem:    make(chan struct{}, 50), // Global limit of 50 concurrent tokenizations
	}
}

// DetokenizeContext carries caller identity for every detokenize call.
// All fields except CorrelationID are required — the handler enforces this.
type DetokenizeContext struct {
	TenantID      string
	Caller        string // service principal: header X-Zord-Caller-ID
	PurposeCode   string // declared purpose
	ObjectRef     string // intent_id or transaction reference
	CorrelationID string
}

// Tokenize encrypts a single plaintext value and stores it.
// actor and traceID are forwarded to the audit row.
func (s *TokenService) Tokenize(
	ctx context.Context,
	tenantID,
	kind string,
	plaintext []byte,
	actor string,
	traceID string,
) (string, error) {

	// Semaphore acquisition
	s.tokenSem <- struct{}{}
	defer func() { <-s.tokenSem }()

	// Ensure key exists
	if err := s.EnsureInitialKey(ctx, tenantID); err != nil {
		return "", err
	}

	// 1. Get ACTIVE key
	key, err := s.keyManager.GetActiveKey(ctx, tenantID)
	if err != nil {
		return "", err
	}

	// 2. Encrypt using key
	cryptoSvc := crypto.NewCrypto(key.RawKey)

	ciphertext, nonce, err := cryptoSvc.Encrypt(plaintext)
	if err != nil {
		return "", err
	}

	// 3. Deterministic token ID — scoped to tenant + kind, versioned
	// (TOK-08). CurrentNormalizationVersion's rule for every kind is
	// bit-identical to the old blanket NormalizeValue -- this call
	// changes no existing token_id for any kind.
	normalized := crypto.NormalizeValueForKind(crypto.CurrentNormalizationVersion, kind, string(plaintext))
	tokenID := "zrd_" + crypto.GenerateDeterministicToken(s.tokenSecret, tenantID, kind, crypto.CurrentNormalizationVersion, normalized)

	// 4. Store in DB with key reference and actor context
	rec := models.TokenRecord{
		TokenID:              tokenID,
		TenantID:             tenantID,
		Kind:                 kind,
		Ciphertext:           ciphertext,
		Nonce:                nonce,
		EncryptionKeyID:      key.KeyID,
		KeyVersion:           key.Version,
		Status:               "ACTIVE",
		Actor:                actor,
		TraceID:              traceID,
		NormalizationVersion: crypto.CurrentNormalizationVersion,
		SecretVersion:        crypto.CurrentSecretVersion,
	}

	if err := s.repo.Insert(ctx, rec); err != nil {
		return "", err
	}

	return tokenID, nil
}

// TokenizePII tokenizes a map of PII fields for a tenant.
// actor identifies the service principal making the request (for audit).
func (s *TokenService) TokenizePII(
	ctx context.Context,
	tenantID string,
	traceID string,
	actor string,
	pii map[string]string,
) (map[string]string, error) {

	result := make(map[string]string)

	for field, value := range pii {

		if value == "" {
			continue
		}

		token, err := s.Tokenize(ctx, tenantID, field, []byte(value), actor, traceID)
		if err != nil {
			return nil, err
		}

		result[field] = token
	}

	return result, nil
}

// DetokenizeFields decrypts a map of token IDs back to plaintext values.
// dctx carries mandatory caller identity for audit logging.
func (s *TokenService) DetokenizeFields(
	ctx context.Context,
	dctx DetokenizeContext,
	tokens map[string]string,
) (map[string]string, error) {

	result := make(map[string]string)

	for field, tokenID := range tokens {

		if tokenID == "" {
			continue
		}

		// 1. Fetch token from DB — audit write is inside Get (fail closed)
		rec, err := s.repo.Get(ctx, tokenID, dctx.TenantID, dctx.Caller, dctx.PurposeCode, dctx.ObjectRef, dctx.CorrelationID)
		if err != nil {
			return nil, err
		}

		// 2. Get correct key
		key, err := s.keyManager.GetKeyByID(ctx, rec.EncryptionKeyID)
		if err != nil {
			return nil, err
		}

		// 3. Decrypt
		cryptoSvc := crypto.NewCrypto(key.RawKey)

		plain, err := cryptoSvc.Decrypt(rec.Ciphertext, rec.Nonce)
		if err != nil {
			return nil, err
		}

		result[field] = string(plain)
	}

	return result, nil
}

// RotateKey performs an unconditional rotation for tenantID -- callers that
// have already decided rotation must happen now (bootstrap, manual trigger)
// use this. It returns rotated=false, err=nil when another replica is
// already rotating this tenant (see repository.RotationKey's advisory
// lock) -- an expected, non-error outcome under concurrent replicas, per
// TOK-07's "two replicas initiate one effective rotation" acceptance test.
func (s *TokenService) RotateKey(ctx context.Context, tenantID string, createdBy string) (bool, error) {

	v, err, _ := s.tenantGroup.Do("rotate:"+tenantID, func() (interface{}, error) {
		// TOK-03: WrapNewDEK generates the raw DEK AND wraps it via KMS in
		// one call -- the raw DEK never exists in this function's stack
		// frame, only the wrapped ciphertext blob does.
		wrapped, kmsKeyID, err := s.keyManager.WrapNewDEK(ctx, tenantID)
		if err != nil {
			return false, err
		}

		newKeyID := uuid.New().String()

		return s.repo.RotateKey(ctx, tenantID, newKeyID, wrapped, kmsKeyID, createdBy)
	})
	if err != nil {
		return false, err
	}

	return v.(bool), nil
}

// MigrateKeys sweeps every token still referencing tenantID's RETIRING key
// onto its current ACTIVE key. Gated by the SAME per-tenant advisory lock
// key as RotateKey/RotateKeyIfStale (repository layer) -- held here at
// SESSION scope (repository.TryAcquireTenantRotationLock) rather than one
// transaction, since this sweep spans many separate DB round trips with
// real Go-side work (decrypt/re-encrypt) between them. Not acquiring the
// lock is a clean skip (another replica is already migrating this tenant),
// not an error. Records a key_rotation_jobs row for observability -- see
// that table's migration comment: it is never consulted to decide whether
// to proceed, only the advisory lock is correctness-bearing.
func (s *TokenService) MigrateKeys(ctx context.Context, tenantID string) error {

	_, err, _ := s.tenantGroup.Do("migrate:"+tenantID, func() (interface{}, error) {
		return nil, s.migrateKeysLocked(ctx, tenantID)
	})

	return err
}

func (s *TokenService) migrateKeysLocked(ctx context.Context, tenantID string) error {
	lock, acquired, err := s.repo.TryAcquireTenantRotationLock(ctx, tenantID)
	if err != nil {
		return err
	}
	if !acquired {
		log.Printf("migration already in progress for tenant %s elsewhere, skipping", tenantID)
		return nil
	}
	defer releaseRotationLock(lock, tenantID)

	jobID, jobErr := s.repo.InsertRotationJob(ctx, tenantID, "MIGRATE", replicaID())
	if jobErr != nil {
		log.Printf("⚠️ failed to record migration job for tenant %s: %v", tenantID, jobErr)
		jobID = ""
	}

	oldKeyID, newKeyID, err := s.doMigrateKeys(ctx, tenantID)

	if jobID != "" {
		if err != nil {
			_ = s.repo.MarkRotationJobFailed(ctx, jobID, err.Error())
		} else {
			_ = s.repo.MarkRotationJobDone(ctx, jobID, oldKeyID, newKeyID)
		}
	}

	return err
}

// doMigrateKeys is the actual batch sweep -- unchanged logic from before
// TOK-07, just restructured to return the key IDs involved (for the job
// row above) instead of running inside the tenantGroup closure directly.
func (s *TokenService) doMigrateKeys(ctx context.Context, tenantID string) (oldKeyID, newKeyID string, err error) {
	log.Printf("Migration started for tenant %s", tenantID)

	// 1️⃣ Get RETIRING key (old key) -- TOK-03: routed through keyManager,
	// NOT repo directly, so a wrapped RETIRING key gets unwrapped before
	// oldCrypto is built below (repo.RawKey may be an opaque KMS ciphertext
	// blob, never a usable AES key -- this was a real bug found and fixed
	// during TOK-03 implementation: the migration sweep would otherwise
	// hard-crash the moment a tenant's RETIRING key was wrapped).
	oldKey, err := s.keyManager.GetRetiringKey(ctx, tenantID)
	if err != nil {
		// no retiring key → nothing to migrate
		return "", "", nil
	}

	// 2️⃣ Get ACTIVE key (new key)
	newKey, err := s.keyManager.GetActiveKey(ctx, tenantID)
	if err != nil {
		return oldKey.KeyID, "", err
	}

	oldCrypto := crypto.NewCrypto(oldKey.RawKey)
	newCrypto := crypto.NewCrypto(newKey.RawKey)

	for {
		// 3️⃣ Fetch batch
		tokens, err := s.repo.GetTokensByKey(ctx, oldKey.KeyID, 100)
		if err != nil {
			return oldKey.KeyID, newKey.KeyID, err
		}

		if len(tokens) == 0 {
			break
		}

		log.Printf("🔁 Migrating %d tokens from key %s → %s",
			len(tokens), oldKey.KeyID, newKey.KeyID)

		for _, t := range tokens {

			// 🔓 decrypt with old key
			plain, err := oldCrypto.Decrypt(t.Ciphertext, t.Nonce)
			if err != nil {
				return oldKey.KeyID, newKey.KeyID, err
			}

			// 🔐 encrypt with new key
			newCipher, newNonce, err := newCrypto.Encrypt(plain)
			if err != nil {
				return oldKey.KeyID, newKey.KeyID, err
			}

			// 💾 update DB -- TOK-05: scoped by the full composite
			// identity (tenant_id, kind, token_id), not token_id alone.
			err = s.repo.UpdateTokenKey(
				ctx,
				t.TenantID,
				t.Kind,
				t.TokenID,
				newCipher,
				newNonce,
				newKey.KeyID,
				newKey.Version,
			)
			if err != nil {
				return oldKey.KeyID, newKey.KeyID, err
			}
		}

		// 📊 progress log
		remaining, _ := s.repo.CountTokensByKey(ctx, oldKey.KeyID)
		log.Printf("📊 Remaining tokens on old key: %d", remaining)
	}

	// 4️⃣ Final check
	count, err := s.repo.CountTokensByKey(ctx, oldKey.KeyID)
	if err != nil {
		return oldKey.KeyID, newKey.KeyID, err
	}

	if count == 0 {
		log.Printf("🎉 Migration complete for tenant %s, key %s retired",
			tenantID, oldKey.KeyID)

		if err := s.repo.MarkKeyRetired(ctx, oldKey.KeyID); err != nil {
			return oldKey.KeyID, newKey.KeyID, err
		}
	}

	return oldKey.KeyID, newKey.KeyID, nil
}

// AutoRotateKeys sweeps every tenant and rotates+migrates any whose active
// key is past the age threshold. The actual staleness re-validation happens
// inside RotateKeyIfStale, under the same advisory lock the write itself
// uses (see that function's doc comment) -- the read here is only a cheap
// pre-filter so most tenants never even attempt a lock acquisition.
func (s *TokenService) AutoRotateKeys(ctx context.Context) error {

	tenants, err := s.repo.GetAllTenants(ctx)
	if err != nil {
		return err
	}

	for _, tenantID := range tenants {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		key, err := s.keyManager.GetActiveKey(ctx, tenantID)
		if err != nil {
			continue
		}

		if !time.Now().After(key.ActiveFrom.AddDate(0, 10, 0)) {
			continue
		}

		log.Printf("🔐 Rotating key for tenant %s", tenantID)

		rotated, err := s.rotateKeyIfStale(ctx, tenantID, "auto-rotation")
		if err != nil {
			log.Println("❌ Rotation failed:", err)
			continue
		}
		if !rotated {
			log.Printf("tenant %s no longer due for rotation (already rotated elsewhere), skipping", tenantID)
			continue
		}

		// Migrate tokens for this tenant after rotation
		if err := s.MigrateKeys(ctx, tenantID); err != nil {
			log.Println("❌ Migration failed after rotation:", err)
		}
	}

	return nil
}

// rotateKeyIfStale is RotateKey's auto-rotation-safe twin (see
// repository.RotateKeyIfStale's doc comment for the race it closes).
func (s *TokenService) rotateKeyIfStale(ctx context.Context, tenantID string, createdBy string) (bool, error) {

	v, err, _ := s.tenantGroup.Do("rotate:"+tenantID, func() (interface{}, error) {
		wrapped, kmsKeyID, err := s.keyManager.WrapNewDEK(ctx, tenantID)
		if err != nil {
			return false, err
		}

		newKeyID := uuid.New().String()

		return s.repo.RotateKeyIfStale(ctx, tenantID, newKeyID, wrapped, kmsKeyID, createdBy, autoRotationMaxAge)
	})
	if err != nil {
		return false, err
	}

	return v.(bool), nil
}

// EnsureInitialKey creates a tenant's very first encryption key if none
// exists yet. Called synchronously on the hot Tokenize path. If another
// replica is concurrently bootstrapping the SAME brand-new tenant, the
// loser must NOT silently return success -- Tokenize immediately calls
// GetActiveKey right after this returns, and the winner's key may not be
// committed yet, which would otherwise surface as a spurious tokenize
// failure under concurrent-first-write load. Returning ErrRotationInProgress
// instead routes it into the existing TOK-01/TOK-02 retry + poison-DLQ
// machinery (kafka/retry_wrapper.go) -- no new retry logic needed.
func (s *TokenService) EnsureInitialKey(ctx context.Context, tenantID string) error {

	_, err, _ := s.tenantGroup.Do("init:"+tenantID, func() (interface{}, error) {
		_, err := s.keyManager.GetActiveKey(ctx, tenantID)
		if err == nil {
			return nil, nil // already exists
		}

		// create first key
		log.Printf("🔐 Creating initial key for tenant %s", tenantID)

		rotated, err := s.RotateKey(ctx, tenantID, "bootstrap")
		if err != nil {
			return nil, err
		}
		if !rotated {
			return nil, ErrRotationInProgress
		}
		return nil, nil
	})

	return err
}

// GetAllTenants delegates to the repository — used by the migration goroutine.
func (s *TokenService) GetAllTenants(ctx context.Context) ([]string, error) {
	return s.repo.GetAllTenants(ctx)
}

// WriteAuthzDenialAudit delegates to the repository — the HTTP handlers'
// only DB-adjacent entry point (TOK-04), used to durably record an
// authorization denial (invalid service JWT, disallowed purpose_code,
// missing object_ref/correlation_id).
func (s *TokenService) WriteAuthzDenialAudit(
	ctx context.Context,
	tenantID, caller, action, purposeCode, objectRef, correlationID, reason string,
) error {
	return s.repo.WriteAuthzDenialAudit(ctx, tenantID, caller, action, purposeCode, objectRef, correlationID, reason)
}
