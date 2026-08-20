package kafka

import (
	"crypto/sha512"
	"os"

	"github.com/IBM/sarama"
	"github.com/xdg-go/scram"
)

// ApplySASL configures SASL/SCRAM-SHA-512 on a sarama config if
// KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD env vars are set.
// If both are empty, SASL is skipped (backward compatible with PLAINTEXT).
func ApplySASL(config *sarama.Config) {
	username := os.Getenv("KAFKA_SASL_USERNAME")
	password := os.Getenv("KAFKA_SASL_PASSWORD")

	if username == "" || password == "" {
		return // No SASL credentials — keep PLAINTEXT (backward compatible)
	}

	config.Net.SASL.Enable = true
	config.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA512
	config.Net.SASL.User = username
	config.Net.SASL.Password = password
	config.Net.SASL.SCRAMClientGeneratorFunc = func() sarama.SCRAMClient {
		return &SCRAMClient{HashGeneratorFcn: SHA512}
	}
}

// ── SCRAM client implementation ─────────────────────────────────────────────

var SHA512 scram.HashGeneratorFcn = sha512.New

type SCRAMClient struct {
	HashGeneratorFcn scram.HashGeneratorFcn
	Client           *scram.Client
	Conversation     *scram.ClientConversation
}

func (c *SCRAMClient) Begin(userName, password, authzID string) (err error) {
	c.Client, err = c.HashGeneratorFcn.NewClient(userName, password, authzID)
	if err != nil {
		return err
	}
	c.Conversation = c.Client.NewConversation()
	return nil
}

func (c *SCRAMClient) Step(challenge string) (string, error) {
	return c.Conversation.Step(challenge)
}

func (c *SCRAMClient) Done() bool {
	return c.Conversation.Done()
}
