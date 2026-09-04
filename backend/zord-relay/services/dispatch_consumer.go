package services

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/IBM/sarama"
	"go.uber.org/zap"

	"zord-relay/logger"
	"zord-relay/model"
)

// DispatchConsumerConfig holds tuning parameters for the Kafka dispatch consumer.
type DispatchConsumerConfig struct {
	Brokers           string
	GroupID           string
	Topic             string
	PollTimeout       time.Duration
	MaxPollIntervalMs int
	WorkerCount       int
}

// DispatchConsumer reads OutboxEvents from Kafka and feeds them to DispatchLoop.
type DispatchConsumer struct {
	cfg  *DispatchConsumerConfig
	loop *DispatchLoop
}

func NewDispatchConsumer(cfg *DispatchConsumerConfig, loop *DispatchLoop) *DispatchConsumer {
	return &DispatchConsumer{cfg: cfg, loop: loop}
}

// Start launches one consumer goroutine using Sarama ConsumerGroup.
func (c *DispatchConsumer) Start(ctx context.Context, wg *sync.WaitGroup) error {
	config := sarama.NewConfig()
	config.Version = sarama.V2_8_0_0
	config.Consumer.Offsets.Initial = sarama.OffsetOldest
	config.Consumer.Offsets.AutoCommit.Enable = false // manual offset commit

	if c.cfg.MaxPollIntervalMs > 0 {
		config.Consumer.MaxProcessingTime = time.Duration(c.cfg.MaxPollIntervalMs) * time.Millisecond
	}

	brokers := stringsToSlice(c.cfg.Brokers)
	group, err := sarama.NewConsumerGroup(brokers, c.cfg.GroupID, config)
	if err != nil {
		return err
	}

	log := logger.Logger.With(
		zap.String("component", "dispatch_consumer"),
		zap.String("topic", c.cfg.Topic),
		zap.String("group_id", c.cfg.GroupID),
	)
	log.Info("dispatch_consumer: subscribed")

	handler := &consumerGroupHandler{
		c:   c,
		log: log,
		ctx: ctx,
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		defer group.Close()
		for {
			if ctx.Err() != nil {
				return
			}
			err := group.Consume(ctx, []string{c.cfg.Topic}, handler)
			if err != nil {
				if errors.Is(err, sarama.ErrClosedConsumerGroup) {
					return
				}
				log.Error("dispatch_consumer: kafka consume error", zap.Error(err))
				time.Sleep(2 * time.Second)
			}
		}
	}()

	return nil
}

type consumerGroupHandler struct {
	c   *DispatchConsumer
	log *zap.Logger
	ctx context.Context
}

func (h *consumerGroupHandler) Setup(sarama.ConsumerGroupSession) error {
	return nil
}

func (h *consumerGroupHandler) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

// claimEvent flows on a single channel owned exclusively by commitInOrder,
// carrying both "submitted to a worker" (completed=false) and "worker
// finished, safe to commit" (completed=true) notifications for one message.
type claimEvent struct {
	offset    int64
	completed bool
}

// ConsumeClaim fans a partition's messages out to a worker pool for
// concurrent processing, but commits (marks) Kafka offsets strictly in the
// order Kafka delivered them via commitInOrder — never ahead of an
// earlier, still-in-flight message.
//
// This matters because sarama's offset manager tracks a single monotonic
// offset per partition, not a bitmap of individually-acked messages: if a
// later offset is marked before an earlier one finishes, and the process
// crashes before the earlier one completes, that earlier message is never
// redelivered — it is silently skipped forever, not just duplicated
// (P1 6.1.4 — restart after publish but before ack).
func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	workerCount := h.c.cfg.WorkerCount
	if workerCount <= 0 {
		workerCount = 4
	}

	workCh := make(chan *sarama.ConsumerMessage, workerCount*2)
	events := make(chan claimEvent, workerCount*4)

	var workerWg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		workerWg.Add(1)
		go func(workerID int) {
			defer workerWg.Done()
			workerLog := h.log.With(zap.Int("worker_id", workerID))
			for msg := range workCh {
				ownershipTaken := h.c.processMessage(h.ctx, msg, workerLog)
				if ownershipTaken {
					events <- claimEvent{offset: msg.Offset, completed: true}
				}
				// ownershipTaken == false: deliberately send no completion
				// event. commitInOrder will then never mark this offset —
				// or anything submitted after it — so a crash redelivers
				// it on restart instead of silently skipping past it.
			}
		}(i)
	}

	commitDone := make(chan struct{})
	go h.commitInOrder(session, claim, events, commitDone)

	for msg := range claim.Messages() {
		select {
		case <-h.ctx.Done():
			close(workCh)
			workerWg.Wait()
			close(events)
			<-commitDone
			return nil
		case workCh <- msg:
			events <- claimEvent{offset: msg.Offset, completed: false}
		}
	}

	close(workCh)
	workerWg.Wait()
	close(events)
	<-commitDone
	return nil
}

// commitInOrder is the sole owner of commit-ordering state for one
// partition claim — no other goroutine touches `order`/`finished`, so no
// locking is needed. It buffers out-of-order completions and only marks the
// longest contiguous prefix of submitted offsets that has finished.
func (h *consumerGroupHandler) commitInOrder(
	session sarama.ConsumerGroupSession,
	claim sarama.ConsumerGroupClaim,
	events <-chan claimEvent,
	done chan<- struct{},
) {
	defer close(done)

	var order []int64
	finished := make(map[int64]bool)

	for ev := range events {
		if !ev.completed {
			order = append(order, ev.offset)
			continue
		}
		finished[ev.offset] = true

		for len(order) > 0 && finished[order[0]] {
			offset := order[0]
			order = order[1:]
			delete(finished, offset)
			session.MarkMessage(&sarama.ConsumerMessage{
				Topic:     claim.Topic(),
				Partition: claim.Partition(),
				Offset:    offset,
			}, "")
		}
	}
}

// processMessage decodes and processes one message. It returns true iff it
// is safe to commit this offset — either the message was durably handed off
// (poison, or DispatchLoop took ownership), or false if a transient failure
// means the offset must be withheld so the message is redelivered on restart.
func (c *DispatchConsumer) processMessage(
	ctx context.Context,
	msg *sarama.ConsumerMessage,
	log *zap.Logger,
) bool {
	msgLog := log.With(
		zap.Int32("partition", msg.Partition),
		zap.Int64("offset", msg.Offset),
	)

	var peek struct {
		EventID string `json:"event_id"`
	}
	if jsonErr := json.Unmarshal(msg.Value, &peek); jsonErr != nil {
		msgLog.Error("dispatch_consumer: totally unparseable message — committing as poison",
			zap.Error(jsonErr),
		)
		return true
	}

	msgLog = msgLog.With(zap.String("event_id", peek.EventID))

	var event model.OutboxEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		msgLog.Error("dispatch_consumer: cannot unmarshal OutboxEvent — committing as poison",
			zap.Error(err),
		)
		return true
	}

	ownershipTaken := c.loop.processEvent(ctx, int(msg.Partition), event)
	if !ownershipTaken {
		msgLog.Warn("dispatch_consumer: step1 failed — withholding offset commit (will retry on restart)")
	}
	return ownershipTaken
}

func stringsToSlice(s string) []string {
	if s == "" {
		return nil
	}
	parts := []string{}
	// Simple manual split to avoid complex regex
	rawParts := split(s, ",")
	for _, p := range rawParts {
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

func split(s, sep string) []string {
	res := []string{}
	start := 0
	for i := 0; i < len(s); i++ {
		if string(s[i]) == sep {
			res = append(res, s[start:i])
			start = i + 1
		}
	}
	res = append(res, s[start:])
	return res
}
