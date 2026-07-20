package storage

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// StoreSnapshot stores canonical/nir/gov JSON in append-only WORM path
// and returns (objectRef, hash)
func (s *S3Store) StoreSnapshot(
	ctx context.Context,
	folder string,
	tenantID string,
	intentID string,
	version int,
	jsonData []byte,
	prevHash string,
) (string, string, error) {
	bucketName, err := s.bucketNameForFolder(folder)
	if err != nil {
		return "", "", err
	}

	// Build hash chain:
	h := sha256.New()
	h.Write([]byte(prevHash))
	h.Write(jsonData)
	h.Write([]byte(tenantID))
	h.Write([]byte(intentID))
	h.Write([]byte(fmt.Sprintf("%d", version)))

	hash := hex.EncodeToString(h.Sum(nil))

	now := time.Now().UTC()
	year, month, day := now.Date()

	objectKey := fmt.Sprintf(
		"%s/%s/%s/%04d/%02d/%02d/v%04d.json",
		folder,
		tenantID,
		intentID,
		year,
		int(month),
		day,
		version,
	)

	_, err = s.Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucketName),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(jsonData),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		return "", "", err
	}

	objectRef := fmt.Sprintf("s3://%s/%s", bucketName, objectKey)
	return objectRef, hash, nil
}

func (s *S3Store) bucketNameForFolder(folder string) (string, error) {
	switch folder {
	case "canonical":
		return s.CanonicalBucketName, nil
	case "nir":
		return s.NIRBucketName, nil
	case "governance":
		return s.GovernanceBucketName, nil
	default:
		return "", fmt.Errorf("unsupported snapshot folder %q", folder)
	}
}
