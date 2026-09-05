package audittests

// TOK-03: a realistic, network-free test double for keymanager.KMSClient --
// NOT a trivial no-op. Real AES-256-GCM under the hood, with the
// EncryptionContext serialized into the AEAD's additional authenticated
// data (AAD), so a context mismatch on Decrypt genuinely fails the same way
// real AWS KMS does (an authentication failure, not a rigged check) --
// letting tests prove "wrong context cannot unwrap" without needing live
// AWS credentials on every `go test` run. Real-AWS-gated tests (see
// tok03_kms_envelope_test.go) provide the complementary live-KMS proof.

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
)

type fakeKMSClient struct {
	mu          sync.Mutex
	masterKey   [32]byte
	keyID       string
	decryptErr  error // when set, every Decrypt call fails -- fault injection
	encryptErr  error // when set, every Encrypt call fails -- fault injection
	decryptCalls int
	encryptCalls int
}

func newFakeKMSClient(keyID string) *fakeKMSClient {
	var key [32]byte
	_, _ = rand.Read(key[:])
	return &fakeKMSClient{masterKey: key, keyID: keyID}
}

// canonicalContext serializes an EncryptionContext map deterministically so
// it can be used as AAD -- order must not matter to the caller but must be
// stable for the same content, exactly like AWS KMS's own canonicalization.
func canonicalContext(ctx map[string]string) []byte {
	keys := make([]string, 0, len(ctx))
	for k := range ctx {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var sb strings.Builder
	for _, k := range keys {
		sb.WriteString(k)
		sb.WriteByte('=')
		sb.WriteString(ctx[k])
		sb.WriteByte(';')
	}
	return []byte(sb.String())
}

func (f *fakeKMSClient) Encrypt(ctx context.Context, plaintext []byte, encryptionContext map[string]string) ([]byte, error) {
	f.mu.Lock()
	f.encryptCalls++
	injectedErr := f.encryptErr
	f.mu.Unlock()
	if injectedErr != nil {
		return nil, injectedErr
	}

	block, err := aes.NewCipher(f.masterKey[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	aad := canonicalContext(encryptionContext)
	sealed := gcm.Seal(nil, nonce, plaintext, aad)

	// Blob format: nonce || sealed -- opaque to callers, exactly like a real
	// KMS CiphertextBlob.
	blob := make([]byte, 0, len(nonce)+len(sealed))
	blob = append(blob, nonce...)
	blob = append(blob, sealed...)
	return blob, nil
}

func (f *fakeKMSClient) Decrypt(ctx context.Context, ciphertextBlob []byte, keyID string, encryptionContext map[string]string) ([]byte, error) {
	f.mu.Lock()
	f.decryptCalls++
	injectedErr := f.decryptErr
	f.mu.Unlock()
	if injectedErr != nil {
		return nil, injectedErr
	}

	block, err := aes.NewCipher(f.masterKey[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(ciphertextBlob) < gcm.NonceSize() {
		return nil, errors.New("fakeKMSClient: ciphertext too short")
	}
	nonce := ciphertextBlob[:gcm.NonceSize()]
	sealed := ciphertextBlob[gcm.NonceSize():]

	aad := canonicalContext(encryptionContext)
	plaintext, err := gcm.Open(nil, nonce, sealed, aad)
	if err != nil {
		// Genuine AEAD authentication failure -- this is exactly what a
		// real KMS EncryptionContext mismatch produces: InvalidCiphertextException.
		return nil, fmt.Errorf("fakeKMSClient: decrypt failed (context mismatch or tampered ciphertext): %w", err)
	}
	return plaintext, nil
}

func (f *fakeKMSClient) callCounts() (encrypt, decrypt int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.encryptCalls, f.decryptCalls
}
