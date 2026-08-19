package keymanager

// TOK-03: "Actually wrap tenant DEKs with the master/KMS key."
//
// KMSClient is the boundary between this package and AWS -- kept narrow
// (just Encrypt/Decrypt) so tests can inject a realistic, network-free fake
// (see the test-only fake in testing/audittests) without needing live AWS
// credentials for every `go test` run, while the real implementation below
// is what actually runs in production.

import (
	"context"
	"fmt"

	awskms "github.com/aws/aws-sdk-go-v2/service/kms"
)

// KMSClient wraps exactly the two KMS operations this service needs.
// encryptionContext is passed through verbatim to AWS KMS's EncryptionContext
// -- KMS requires the EXACT SAME context on Decrypt as was used on Encrypt,
// or the call fails (this is what makes cross-tenant unwrap impossible: a
// caller who doesn't know the right tenant_id cannot produce a matching
// context). See encryptionContextFor in maneger.go for the one place that
// context map gets built, so wrap and unwrap never accidentally diverge.
type KMSClient interface {
	// Encrypt wraps plaintext (a raw DEK) under this client's configured CMK.
	// Returns the opaque ciphertext blob to store -- it is self-describing
	// (embeds which CMK/key-material-version produced it), so Decrypt never
	// needs to be told which key was used.
	Encrypt(ctx context.Context, plaintext []byte, encryptionContext map[string]string) (ciphertextBlob []byte, err error)

	// Decrypt unwraps a ciphertext blob produced by Encrypt. keyID, if
	// non-empty, is passed as KMS's optional integrity check: KMS verifies
	// the blob was actually produced under that exact CMK, erroring
	// otherwise -- defense-in-depth against a future IAM-policy mistake
	// granting decrypt on the wrong key. encryptionContext MUST exactly
	// match what Encrypt was called with, or this fails.
	Decrypt(ctx context.Context, ciphertextBlob []byte, keyID string, encryptionContext map[string]string) (plaintext []byte, err error)
}

// awsKMSClient is the real, production KMSClient, backed by the AWS SDK.
type awsKMSClient struct {
	client *awskms.Client
	keyID  string // CMK ID/ARN used for every Encrypt call
}

// NewAWSKMSClient wraps an already-constructed *awskms.Client (built by the
// caller via awskms.NewFromConfig(cfg), where cfg comes from
// config.LoadDefaultConfig(ctx) -- the SDK's default credential chain,
// which resolves via the pod's IRSA service account in EKS or explicit
// AWS_* env vars locally/in tests) for the given CMK ID/ARN.
func NewAWSKMSClient(client *awskms.Client, keyID string) AWSKMSClient {
	return &awsKMSClient{client: client, keyID: keyID}
}

func (c *awsKMSClient) Encrypt(ctx context.Context, plaintext []byte, encryptionContext map[string]string) ([]byte, error) {
	out, err := c.client.Encrypt(ctx, &awskms.EncryptInput{
		KeyId:             &c.keyID,
		Plaintext:         plaintext,
		EncryptionContext: encryptionContext,
	})
	if err != nil {
		return nil, fmt.Errorf("kms encrypt: %w", err)
	}
	return out.CiphertextBlob, nil
}

func (c *awsKMSClient) Decrypt(ctx context.Context, ciphertextBlob []byte, keyID string, encryptionContext map[string]string) ([]byte, error) {
	input := &awskms.DecryptInput{
		CiphertextBlob:    ciphertextBlob,
		EncryptionContext: encryptionContext,
	}
	if keyID != "" {
		input.KeyId = &keyID
	}
	out, err := c.client.Decrypt(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("kms decrypt: %w", err)
	}
	return out.Plaintext, nil
}

// DescribeKey is used only by the readiness check (cmd/main.go) -- a cheap,
// side-effect-free call to confirm this service's IAM role can actually
// reach and use the configured CMK before serving traffic.
func (c *awsKMSClient) DescribeKey(ctx context.Context) error {
	_, err := c.client.DescribeKey(ctx, &awskms.DescribeKeyInput{KeyId: &c.keyID})
	if err != nil {
		return fmt.Errorf("kms describe-key: %w", err)
	}
	return nil
}

// AWSKMSClient is the concrete type returned by NewAWSKMSClient, exposed so
// cmd/main.go can call DescribeKey for the readiness check without widening
// the KMSClient interface (which every caller, including tests, otherwise
// only needs Encrypt/Decrypt from).
type AWSKMSClient interface {
	KMSClient
	DescribeKey(ctx context.Context) error
}

var _ AWSKMSClient = (*awsKMSClient)(nil)
