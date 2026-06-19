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

func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	workerCount := h.c.cfg.WorkerCount
	if workerCount <= 0 {
		workerCount = 4
	}

	type workItem struct {
		session sarama.ConsumerGroupSession
		msg     *sarama.ConsumerMessage
	}

	workCh := make(chan workItem, workerCount*2)

	var workerWg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		workerWg.Add(1)
		go func(workerID int) {
			defer workerWg.Done()
			for w := range workCh {
				h.c.handleMessage(h.ctx, w.session, w.msg, h.log.With(zap.Int("worker_id", workerID)))
			}
		}(i)
	}

	for msg := range claim.Messages() {
		select {
		case <-h.ctx.Done():
			close(workCh)
			workerWg.Wait()
			return nil
		case workCh <- workItem{session: session, msg: msg}:
		}
	}

	close(workCh)
	workerWg.Wait()
	return nil
}

func (c *DispatchConsumer) handleMessage(
	ctx context.Context,
	session sarama.ConsumerGroupSession,
	msg *sarama.ConsumerMessage,
	log *zap.Logger,
) {
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
		c.commitOffset(session, msg)
		return
	}

	msgLog = msgLog.With(zap.String("event_id", peek.EventID))

	var event model.OutboxEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		msgLog.Error("dispatch_consumer: cannot unmarshal OutboxEvent — committing as poison",
			zap.Error(err),
		)
		c.commitOffset(session, msg)
		return
	}

	ownershipTaken := c.loop.processEvent(ctx, int(msg.Partition), event)
	if ownershipTaken {
		c.commitOffset(session, msg)
	} else {
		msgLog.Warn("dispatch_consumer: step1 failed — withholding offset commit (will retry on restart)")
	}
}

func (c *DispatchConsumer) commitOffset(session sarama.ConsumerGroupSession, msg *sarama.ConsumerMessage) {
	session.MarkMessage(msg, "")
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
