package kafka

import (
	"context"
	"log"

	"github.com/IBM/sarama"
)

func StartConsumer(
	ctx context.Context,
	brokers []string,
	groupID string,
	topic string,
	handler func([]byte) error,
) error {

	config := sarama.NewConfig()
	config.Version = sarama.V2_8_0_0

	// SASL/SCRAM-SHA-512 authentication (PLAT-06)
	ApplySASL(config)

	config.Consumer.Group.Rebalance.GroupStrategies = []sarama.BalanceStrategy{
		sarama.NewBalanceStrategyRange(),
	}
	config.Consumer.Offsets.Initial = sarama.OffsetOldest

	consumerGroup, err := sarama.NewConsumerGroup(brokers, groupID, config)
	if err != nil {
		return err
	}

	go func() {
		for {
			err := consumerGroup.Consume(ctx, []string{topic}, &consumerHandler{
				handler: handler,
			})

			if err != nil {
				log.Printf("Kafka consume error: %v", err)
			}

			if ctx.Err() != nil {
				return
			}
		}
	}()

	return nil
}

type consumerHandler struct {
	handler func([]byte) error
}

func (h *consumerHandler) Setup(sarama.ConsumerGroupSession) error {
	return nil
}

func (h *consumerHandler) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

func (h *consumerHandler) ConsumeClaim(
	session sarama.ConsumerGroupSession,
	claim sarama.ConsumerGroupClaim,
) error {

	for msg := range claim.Messages() {

		err := h.handler(msg.Value)
		if err != nil {
			log.Printf("Kafka handler error: %v", err)
		}

		session.MarkMessage(msg, "")
	}

	return nil
}
