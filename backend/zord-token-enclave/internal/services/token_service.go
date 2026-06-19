package services

import (
	"context"
	"crypto/rand"
	"log"
	"time"

	"zord-token-enclave/internal/crypto"
	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/models"
	"zord-token-enclave/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"
)

type TokenService struct {
	repo        *repository.TokenRepository
	keyManager  keymanager.KeyManager
	tokenSecret []byte            // for deterministic tokenization
	tenantGroup singleflight.Group // per-tenant concurrency control
	tokenSem    chan struct{}       // limit global tokenization concurrency
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

	// 3. Deterministic token ID — scoped to tenant + kind
	normalized := crypto.NormalizeValue(string(plaintext))
	tokenID := "zrd_" + crypto.GenerateDeterministicToken(s.tokenSecret, tenantID, kind, normalized)

	// 4. Store in DB with key reference and actor context
	rec := models.TokenRecord{
		TokenID:         tokenID,
		TenantID:        tenantID,
		Kind:            kind,
		Ciphertext:      ciphertext,
		Nonce:           nonce,
		EncryptionKeyID: key.KeyID,
		KeyVersion:      key.Version,
		Status:          "ACTIVE",
		Actor:           actor,
		TraceID:         traceID,
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

func (s *TokenService) RotateKey(ctx context.Context, tenantID string, createdBy string) error {

	_, err, _ := s.tenantGroup.Do("rotate:"+tenantID, func() (interface{}, error) {
		// Generate new AES-256 key (32 bytes)
		newKey := make([]byte, 32)
		if _, err := rand.Read(newKey); err != nil {
			return nil, err
		}

		newKeyID := uuid.New().String()

		return nil, s.repo.RotateKey(ctx, tenantID, newKeyID, newKey, createdBy)
	})

	return err
}

func (s *TokenService) MigrateKeys(ctx context.Context, tenantID string) error {

	_, err, _ := s.tenantGroup.Do("migrate:"+tenantID, func() (interface{}, error) {
		log.Printf("Migration started for tenant %s", tenantID)

		// 1️⃣ Get RETIRING key (old key)
		oldKey, err := s.repo.GetRetiringKey(ctx, tenantID)
		if err != nil {
			// no retiring key → nothing to migrate
			return nil, nil
		}

		// 2️⃣ Get ACTIVE key (new key)
		newKey, err := s.keyManager.GetActiveKey(ctx, tenantID)
		if err != nil {
			return nil, err
		}

		oldCrypto := crypto.NewCrypto(oldKey.RawKey)
		newCrypto := crypto.NewCrypto(newKey.RawKey)

		for {
			// 3️⃣ Fetch batch
			tokens, err := s.repo.GetTokensByKey(ctx, oldKey.KeyID, 100)
			if err != nil {
				return nil, err
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
					return nil, err
				}

				// 🔐 encrypt with new key
				newCipher, newNonce, err := newCrypto.Encrypt(plain)
				if err != nil {
					return nil, err
				}

				// 💾 update DB
				err = s.repo.UpdateTokenKey(
					ctx,
					t.TokenID,
					newCipher,
					newNonce,
					newKey.KeyID,
					newKey.Version,
				)
				if err != nil {
					return nil, err
				}
			}

			// 📊 progress log
			remaining, _ := s.repo.CountTokensByKey(ctx, oldKey.KeyID)
			log.Printf("📊 Remaining tokens on old key: %d", remaining)
		}

		// 4️⃣ Final check
		count, err := s.repo.CountTokensByKey(ctx, oldKey.KeyID)
		if err != nil {
			return nil, err
		}

		if count == 0 {
			log.Printf("🎉 Migration complete for tenant %s, key %s retired",
				tenantID, oldKey.KeyID)

			return nil, s.repo.MarkKeyRetired(ctx, oldKey.KeyID)
		}

		return nil, nil
	})

	return err
}

func (s *TokenService) AutoRotateKeys(ctx context.Context) error {

	tenants, err := s.repo.GetAllTenants(ctx)
	if err != nil {
		return err
	}

	for _, tenantID := range tenants {

		key, err := s.keyManager.GetActiveKey(ctx, tenantID)
		if err != nil {
			continue
		}

		if time.Now().After(key.ActiveFrom.AddDate(0, 10, 0)) {
			log.Printf("🔐 Rotating key for tenant %s", tenantID)

			err := s.RotateKey(ctx, tenantID, "auto-rotation")
			if err != nil {
				log.Println("❌ Rotation failed:", err)
				continue
			}
			// Migrate tokens for this tenant after rotation
			if err := s.MigrateKeys(ctx, tenantID); err != nil {
				log.Println("❌ Migration failed after rotation:", err)
			}
		}
	}

	return nil
}

func (s *TokenService) EnsureInitialKey(ctx context.Context, tenantID string) error {

	_, err, _ := s.tenantGroup.Do("init:"+tenantID, func() (interface{}, error) {
		_, err := s.keyManager.GetActiveKey(ctx, tenantID)
		if err == nil {
			return nil, nil // already exists
		}

		// create first key
		log.Printf("🔐 Creating initial key for tenant %s", tenantID)

		return nil, s.RotateKey(ctx, tenantID, "bootstrap")
	})

	return err
}

// GetAllTenants delegates to the repository — used by the migration goroutine.
func (s *TokenService) GetAllTenants(ctx context.Context) ([]string, error) {
	return s.repo.GetAllTenants(ctx)
}
