package testutil

import (
	"context"
	"fmt"

	"zord-evidence/storage"
)

// MockS3Store implements storage.S3Store in-memory
type MockS3Store struct {
	Objects map[string][]byte
}

func NewMockS3Store() *MockS3Store {
	return &MockS3Store{
		Objects: make(map[string][]byte),
	}
}

func (m *MockS3Store) PutObject(ctx context.Context, key string, data []byte) (string, error) {
	m.Objects[key] = data
	return "s3://mock-bucket/" + key, nil
}

func (m *MockS3Store) GetObject(ctx context.Context, key string) ([]byte, error) {
	data, ok := m.Objects[key]
	if !ok {
		return nil, fmt.Errorf("object not found: %s", key)
	}
	return data, nil
}

func (m *MockS3Store) GeneratePresignedURL(ctx context.Context, key string, expiresHours int) (string, error) {
	return "https://mock-s3.local/" + key, nil
}

func (m *MockS3Store) ObjectRef(key string) string {
	return "s3://mock-bucket/" + key
}

// Just to ensure it implements the interface
var _ storage.S3Store = (*MockS3Store)(nil)
