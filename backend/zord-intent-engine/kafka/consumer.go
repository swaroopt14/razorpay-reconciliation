package kafka

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/IBM/sarama"
)

// PermanentFailure carries everything about a Kafka message whose handler
// exhausted every retry attempt — the raw materials a durable failure
// ledger needs (R-03). This package stays decoupled from any specific
// payload schema or persistence mechanism: it hands the caller Kafka-level
// facts (topic/partition/offset/headers/value) plus the handler's own
// verdict (attempts, last error) and lets the caller's FailureRecorder do
// the payload parsing and durable write.
type PermanentFailure struct {
	Topic     string
	Partition int32
	Offset    int64
	Key       []byte
	Value     []byte
	Headers   []*sarama.RecordHeader
	Attempts  int
	LastError error
}

// FailureRecorder durably persists a PermanentFailure before the source
// Kafka offset is allowed to advance past it. A non-nil return means the
// write did not succeed and the message must NOT be marked — see
// ConsumeClaim, which stops consuming (ending the session, forcing a
// rejoin) rather than advancing on a failed write.
type FailureRecorder func(ctx context.Context, f PermanentFailure) error

type Consumer struct {
	ready              chan bool
	handler            func([]byte) error
	onPermanentFailure FailureRecorder
}

// StartConsumer requires onPermanentFailure — R-03 makes durable failure
// recording a precondition for offset advancement, not an optional add-on,
// so there is no "run without it" mode to silently fall back to.
//
// wg (INT-08), if non-nil, is Add(1)'d before the internal consume-loop
// goroutine starts and Done()'d via defer inside it — so a caller can
// cancel ctx on shutdown and then wg.Wait() to know the loop has actually
// exited (including finishing whatever message it was mid-handling), not
// just that cancellation was requested. Pass nil to opt out (no behavior
// change from before this parameter existed).
func StartConsumer(ctx context.Context, brokers []string, groupID, topic string, handler func([]byte) error, onPermanentFailure FailureRecorder, wg *sync.WaitGroup) error {
	if onPermanentFailure == nil {
		return errors.New("kafka.StartConsumer: onPermanentFailure is required (R-03: no durable failure recording, no consumer)")
	}

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
		ready:              make(chan bool),
		handler:            handler,
		onPermanentFailure: onPermanentFailure,
	}

	if wg != nil {
		wg.Add(1)
	}
	go func() {
		defer group.Close()
		if wg != nil {
			defer wg.Done()
		}
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
// chance to succeed instead of being lost outright.
//
// R-03: a message that still fails after all attempts is no longer marked
// unconditionally. It is durably recorded first (see FailureRecorder) —
// only a successful durable write earns the mark. If the durable write
// itself fails, ConsumeClaim stops (returns an error, ending this session)
// rather than advancing past a failure nobody can find later.
const (
	maxHandlerAttempts    = 5
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
		if err == nil {
			session.MarkMessage(msg, "")
			continue
		}

		log.Printf("⚠️ Handler permanently failed after %d attempts %s — recording durable failure before marking: %v",
			maxHandlerAttempts, logPrefix, err)

		recErr := c.onPermanentFailure(session.Context(), PermanentFailure{
			Topic:     msg.Topic,
			Partition: msg.Partition,
			Offset:    msg.Offset,
			Key:       msg.Key,
			Value:     msg.Value,
			Headers:   msg.Headers,
			Attempts:  maxHandlerAttempts,
			LastError: err,
		})
		if recErr != nil {
			// Do NOT mark. Ending the session here (returning an error)
			// forces a rejoin; consumption resumes from the last marked
			// offset, so this same message is redelivered and retried
			// rather than silently advanced past — per R-03: "never
			// advance only because logging succeeded."
			log.Printf("🛑 Failed to durably record permanent failure %s — stopping this partition's consumption without marking: %v",
				logPrefix, recErr)
			return fmt.Errorf("durable failure recording failed, refusing to advance offset: %w", recErr)
		}

		session.MarkMessage(msg, "")
	}
	return nil

}
