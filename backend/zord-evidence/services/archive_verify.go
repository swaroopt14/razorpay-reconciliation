package services

import (
	"context"
	"errors"
	"fmt"
	"time"
	"zord-evidence/storage"
)

// ErrArchiveVerificationFailed is returned when Mode A archive verification fails.
// Dispute export must not proceed when this error is returned.
var ErrArchiveVerificationFailed = errors.New("archive verification failed")

// VerifyArchiveForPack fetches the S3 archive, verifies ciphertext and plaintext
// hashes, and marks the archive as verified. Mode A requires this before export.
func (s *EvidenceService) VerifyArchiveForPack(ctx context.Context, packID string) error {
	if s.s3 == nil || s.archiveCrypto == nil {
		return fmt.Errorf("%w: archive store/crypto not configured", ErrArchiveVerificationFailed)
	}

	meta, err := s.repo.GetArchiveByPackID(ctx, packID)
	if err != nil {
		return fmt.Errorf("%w: load archive metadata: %v", ErrArchiveVerificationFailed, err)
	}

	if meta.ArchiveCiphertextHash == "" {
		return fmt.Errorf("%w: archive_ciphertext_hash missing for pack %s", ErrArchiveVerificationFailed, packID)
	}
	if meta.PlaintextManifestHash == "" {
		return fmt.Errorf("%w: plaintext_manifest_hash missing for pack %s (legacy archive cannot be Mode-A verified)", ErrArchiveVerificationFailed, packID)
	}

	expectedKeyID := s.archiveCrypto.KeyID()
	if meta.EncryptionKeyID != "" && meta.EncryptionKeyID != expectedKeyID {
		return fmt.Errorf("%w: encryption_key_id mismatch stored=%s expected=%s",
			ErrArchiveVerificationFailed, meta.EncryptionKeyID, expectedKeyID)
	}

	objectKey, err := storage.ObjectKeyFromRef(meta.ObjectRef)
	if err != nil {
		return fmt.Errorf("%w: parse object ref: %v", ErrArchiveVerificationFailed, err)
	}

	ciphertext, err := s.s3.GetObject(ctx, objectKey)
	if err != nil {
		return fmt.Errorf("%w: fetch s3 object: %v", ErrArchiveVerificationFailed, err)
	}

	computedCipherHash := sha256Hex(ciphertext)
	if computedCipherHash != meta.ArchiveCiphertextHash {
		return fmt.Errorf("%w: ciphertext hash mismatch stored=%s computed=%s",
			ErrArchiveVerificationFailed, meta.ArchiveCiphertextHash, computedCipherHash)
	}

	if meta.ArchiveSizeBytes > 0 && int64(len(ciphertext)) != meta.ArchiveSizeBytes {
		return fmt.Errorf("%w: archive size mismatch stored=%d computed=%d",
			ErrArchiveVerificationFailed, meta.ArchiveSizeBytes, len(ciphertext))
	}

	plaintext, err := s.archiveCrypto.Decrypt(ciphertext)
	if err != nil {
		return fmt.Errorf("%w: decrypt: %v", ErrArchiveVerificationFailed, err)
	}

	computedPlainHash := sha256Hex(plaintext)
	if computedPlainHash != meta.PlaintextManifestHash {
		return fmt.Errorf("%w: plaintext manifest hash mismatch stored=%s computed=%s",
			ErrArchiveVerificationFailed, meta.PlaintextManifestHash, computedPlainHash)
	}

	verifiedAt := time.Now().UTC()
	if err := s.repo.MarkArchiveVerified(ctx, packID, verifiedAt); err != nil {
		return fmt.Errorf("%w: persist verified_at: %v", ErrArchiveVerificationFailed, err)
	}

	return nil
}
