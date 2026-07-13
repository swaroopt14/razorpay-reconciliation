package kafka

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/IBM/sarama"
)

type Consumer struct {
	ready   chan bool
	handler func([]byte) error
}

func StartConsumer(ctx context.Context, brokers []string, groupID, topic string, handler func([]byte) error) error {
	config := sarama.NewConfig()
	config.Version = sarama.V2_8_0_0

	//Consumer Group Setting
	config.Consumer.Group.Rebalance.GroupStrategies = []sarama.BalanceStrategy{
		sarama.NewBalanceStrategyRange(),
	}
	config.Consumer.Offsets.Initial = sarama.OffsetOldest
	config.Consumer.Offsets.AutoCommit.Enable = true

	group, err := sarama.NewConsumerGroup(brokers, groupID, config)
	if err != nil {
		return err
	}

	consumer := &Consumer{
		ready:   make(chan bool),
		handler: handler,
	}

	go func() {
		defer group.Close()
		for {
			if ctx.Err() != nil {
				return
			}
			err := group.Consume(ctx, []string{topic}, consumer)
			if err != nil {
				log.Printf("Kafka consume error: %v", err)
			}
			consumer.ready = make(chan bool)
		}
	}()
	<-consumer.ready

	log.Println("Kafka consumer is ready")

	return nil

}
func (c *Consumer) Setup(sarama.ConsumerGroupSession) error {
	close(c.ready)
	return nil
}

func (c *Consumer) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

// maxHandlerAttempts and handlerRetryBackoff bound the in-place retry below.
// Ledger item #22: with AutoCommit enabled, sarama commits the highest
// *marked* offset per partition on its own schedule. Since ConsumeClaim
// previously skipped marking a failed message but kept consuming later ones,
// a later message's mark would silently carry the committed offset past the
// earlier failed one — permanently losing it with zero retries, since Kafka
// offsets are a single forward-moving pointer, not a per-message ledger.
// Retrying the same message here, in place, before ever moving on to the
// next one, means no later mark can ever advance past an unresolved earlier
// message. Most failures are transient (DB/enclave blips) and now get a real
// chance to succeed instead of being lost outright. A message that still
// fails after all attempts is marked anyway (so it doesn't block this
// partition forever) but loudly logged, replacing a silent loss with a
// visible one an operator can act on.
const (
	maxHandlerAttempts = 5
	handlerRetryBaseDelay = 200 * time.Millisecond
)

// callWithRetry invokes handler(payload) up to maxHandlerAttempts times,
// sleeping sleepFn between attempts, and returns the last error (nil if any
// attempt succeeded). Factored out of ConsumeClaim so the retry/backoff
// behavior is unit-testable without mocking Sarama's consumer-group types.
func callWithRetry(handler func([]byte) error, payload []byte, logPrefix string, sleepFn func(time.Duration)) error {
	var err error
	for attempt := 1; attempt <= maxHandlerAttempts; attempt++ {
		err = handler(payload)
		if err == nil {
			return nil
		}
		log.Printf("%s handler error (attempt %d/%d): %v", logPrefix, attempt, maxHandlerAttempts, err)
		if attempt < maxHandlerAttempts {
			sleepFn(handlerRetryBaseDelay * time.Duration(1<<uint(attempt-1)))
		}
	}
	return err
}

func (c *Consumer) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {

	for msg := range claim.Messages() {
		logPrefix := fmt.Sprintf("partition=%d offset=%d", msg.Partition, msg.Offset)
		err := callWithRetry(c.handler, msg.Value, logPrefix, time.Sleep)
		if err != nil {
			log.Printf("⚠️ Handler permanently failed after %d attempts %s — marking to avoid blocking this partition indefinitely; message is now lost: %v",
				maxHandlerAttempts, logPrefix, err)
		}
		session.MarkMessage(msg, "")
	}
	return nil

}
