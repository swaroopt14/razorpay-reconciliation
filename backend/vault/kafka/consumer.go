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
			err := consumerGroup.Consume(ctx, []string{topic}, &ConsumerHandler{
				Handler: handler,
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

// ConsumerHandler implements sarama.ConsumerGroupHandler. Exported (rather
// than an unexported consumerHandler) so testing/audittests can construct
// one directly against a fake session/claim and exercise the real
// production ConsumeClaim logic below -- not a reimplementation of it.
type ConsumerHandler struct {
	Handler func([]byte) error
}

func (h *ConsumerHandler) Setup(sarama.ConsumerGroupSession) error {
	return nil
}

func (h *ConsumerHandler) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

func (h *ConsumerHandler) ConsumeClaim(
	session sarama.ConsumerGroupSession,
	claim sarama.ConsumerGroupClaim,
) error {

	for msg := range claim.Messages() {

		err := h.Handler(msg.Value)
		if err != nil {
			// TOK-01: do NOT mark on failure -- the message must be
			// redelivered and retried, not silently dropped. h.Handler is
			// expected to already have applied its own bounded retry and
			// durable-failure recording (see kafka.WithRetryAndPoisonDLQ);
			// an error reaching here means even that durable recording
			// failed, so this is the last line of defense against losing
			// the message.
			//
			// We must STOP the claim here, not just skip this one message
			// and keep consuming: sarama's offset manager commits the
			// highest MARKED offset it has seen for this partition,
			// regardless of message order. If we kept going and a later
			// message in this same claim succeeded and got marked, that
			// commit would advance the partition's offset PAST this
			// unrecorded failure, and on the next restart/rebalance this
			// message would never be redelivered -- silently lost, the
			// exact bug this fix exists to close. Returning here ends the
			// session without marking anything after the last successful
			// message, so the next Consume() call (StartConsumer's retry
			// loop) redelivers starting from this same message.
			log.Printf("Kafka handler error (offset NOT marked, stopping claim so this message is redelivered): %v", err)
			return err
		}

		session.MarkMessage(msg, "")
	}

	return nil
}
