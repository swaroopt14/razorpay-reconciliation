package kafka

import (
	"context"
	"encoding/json"
	"log"

	"zord-token-enclave/internal/models"
)

type TokenizeHandler func(context.Context, models.TokenizeRequestEvent) error

func BuildTokenizeHandler(
	ctx context.Context,
	handler TokenizeHandler,
) func([]byte) error {

	return func(msg []byte) error {

		var event models.TokenizeRequestEvent

		err := json.Unmarshal(msg, &event)
		if err != nil {
			log.Printf("Invalid tokenize request event: %v", err)
			return err
		}

		return handler(ctx, event)
	}
}
