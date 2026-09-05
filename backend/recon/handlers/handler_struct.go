package handlers

import (
	"zord-outcome-engine/kafka"
	"zord-outcome-engine/storage"
)

type Handler struct {
	S3store *storage.S3Store
	Kafka   *kafka.Producer
}
