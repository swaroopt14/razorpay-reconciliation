package kafka

import (
	"crypto/tls"
	"os"

	kafkago "github.com/segmentio/kafka-go"
	"github.com/segmentio/kafka-go/sasl/scram"
)

// NewSASLDialer returns a kafka-go Dialer configured for SCRAM-SHA-512
// if KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD env vars are set.
// Returns nil if no credentials are configured (backward compatible).
func NewSASLDialer() *kafkago.Dialer {
	username := os.Getenv("KAFKA_SASL_USERNAME")
	password := os.Getenv("KAFKA_SASL_PASSWORD")

	if username == "" || password == "" {
		return nil // No SASL — use default dialer (PLAINTEXT)
	}

	mechanism, err := scram.Mechanism(scram.SHA512, username, password)
	if err != nil {
		return nil
	}

	return &kafkago.Dialer{
		SASLMechanism: mechanism,
		TLS:           &tls.Config{InsecureSkipVerify: true}, // internal cluster, no TLS certs yet
	}
}


// NewSASLTransport returns a kafka-go Transport configured for SCRAM-SHA-512.
// Used by kafka.Writer. Returns nil if no SASL credentials are set.
func NewSASLTransport() *kafkago.Transport {
	username := os.Getenv("KAFKA_SASL_USERNAME")
	password := os.Getenv("KAFKA_SASL_PASSWORD")

	if username == "" || password == "" {
		return nil // No SASL — use default transport
	}

	mechanism, err := scram.Mechanism(scram.SHA512, username, password)
	if err != nil {
		return nil
	}

	return &kafkago.Transport{
		SASL: mechanism,
		TLS:  &tls.Config{InsecureSkipVerify: true},
	}
}
