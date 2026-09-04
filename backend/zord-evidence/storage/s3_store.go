package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Store is intentionally an interface-first adapter.
// Wire real AWS SDK implementation later without changing service logic.
type S3Store interface {
	PutObject(ctx context.Context, key string, body []byte) (string, error)
	GetObject(ctx context.Context, key string) ([]byte, error)
	// ObjectRef returns the canonical s3:// URI for a key without uploading.
	ObjectRef(key string) string
}

// type InMemoryS3Store struct {
// 	bucket string
// 	items  map[string][]byte
// }

// func NewInMemoryS3Store(bucket string) *InMemoryS3Store {
// 	return &InMemoryS3Store{bucket: bucket, items: map[string][]byte{}}
// }

// func (s *InMemoryS3Store) PutObject(_ context.Context, key string, body []byte) (string, error) {
// 	if key == "" {
// 		return "", fmt.Errorf("empty key")
// 	}
// 	cp := make([]byte, len(body))
// 	copy(cp, body)
// 	s.items[key] = cp
// 	return s.ObjectRef(key), nil
// }

// func (s *InMemoryS3Store) ObjectRef(key string) string {
// 	return fmt.Sprintf("s3://%s/%s", s.bucket, key)
// }

// func (s *InMemoryS3Store) GetObject(_ context.Context, key string) ([]byte, error) {
// 	v, ok := s.items[key]
// 	if !ok {
// 		return nil, fmt.Errorf("object not found")
// 	}
// 	cp := make([]byte, len(v))
// 	copy(cp, v)
// 	return cp, nil
// }

type AWSStore struct {
	bucket string
	client *s3.Client
}

func NewAWSStore(ctx context.Context, region, bucket string) (*AWSStore, error) {
	if strings.TrimSpace(region) == "" {
		return nil, fmt.Errorf("aws region is required")
	}
	if strings.TrimSpace(bucket) == "" {
		return nil, fmt.Errorf("s3 bucket is required")
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}
	return &AWSStore{
		bucket: bucket,
		client: s3.NewFromConfig(cfg),
	}, nil
}

func (s *AWSStore) PutObject(ctx context.Context, key string, body []byte) (string, error) {
	if strings.TrimSpace(key) == "" {
		return "", fmt.Errorf("empty key")
	}
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
		Body:   bytes.NewReader(body),
	})
	if err != nil {
		return "", fmt.Errorf("put object: %w", err)
	}
	return s.ObjectRef(key), nil
}

func (s *AWSStore) ObjectRef(key string) string {
	return fmt.Sprintf("s3://%s/%s", s.bucket, key)
}

func (s *AWSStore) GetObject(ctx context.Context, key string) ([]byte, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}
	defer out.Body.Close()
	content, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, fmt.Errorf("read object: %w", err)
	}
	return content, nil
}

// ObjectKeyFromRef extracts the object key from an s3://bucket/key URI.
// If objectRef is already a bare key (no s3:// prefix), it is returned as-is.
func ObjectKeyFromRef(objectRef string) (string, error) {
	ref := strings.TrimSpace(objectRef)
	if ref == "" {
		return "", fmt.Errorf("empty object ref")
	}
	if !strings.HasPrefix(ref, "s3://") {
		return ref, nil
	}
	withoutScheme := strings.TrimPrefix(ref, "s3://")
	slash := strings.Index(withoutScheme, "/")
	if slash < 0 || slash == len(withoutScheme)-1 {
		return "", fmt.Errorf("invalid s3 object ref %q", objectRef)
	}
	return withoutScheme[slash+1:], nil
}
