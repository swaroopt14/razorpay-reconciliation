package storage

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

var encryptionKey []byte

func InitEncryptionKey(base64Key string) error {
	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return err
	}
	if len(key) != 32 {
		return errors.New("encryption key must be 32 bytes (base64-encoded)")
	}
	encryptionKey = key
	return nil
}

func encryptAESGCM(plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ciphertext := aesGCM.Seal(nil, nonce, plaintext, nil)
	return append(nonce, ciphertext...), nil
}

func (s *S3Store) StoreRawPayload(ctx context.Context, Payload []byte, TenantId string) (uuid.UUID, time.Time, string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if len(encryptionKey) != 32 {
		return uuid.UUID{}, time.Time{}, "", errors.New("encryption key not initialized")
	}
	EnvelopeID := uuid.New()
	receivedTime := time.Now().UTC()
	year, month, day := receivedTime.Date()

	ObjectKey := fmt.Sprintf("%s/envelopes/%04d/%02d/%02d/%s.bin", TenantId,
		year,
		int(month),
		day,
		EnvelopeID)

	encrypted, err := encryptAESGCM(Payload)
	if err != nil {
		return uuid.UUID{}, time.Time{}, "", err
	}

	s3Ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err = s.Client.PutObject(s3Ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.BucketName),
		Key:         aws.String(ObjectKey),
		Body:        bytes.NewReader(encrypted),
		ContentType: aws.String("application/octet-stream"),
	})
	if err != nil {
		return uuid.UUID{}, time.Time{}, "", err
	}

	ObjectRef := buildS3ObjectRef(s.BucketName, ObjectKey)
	//log.Printf("Stored Raw Payload in S3: %s", ObjectRef)

	return EnvelopeID, receivedTime, ObjectRef, nil

}
func buildS3ObjectRef(bucket, objectKey string) string {
	return fmt.Sprintf("s3://%s/%s", bucket, objectKey)
}
