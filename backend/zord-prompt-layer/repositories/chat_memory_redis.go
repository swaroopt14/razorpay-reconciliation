package repositories

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"zord-prompt-layer/services"

	"github.com/redis/go-redis/v9"
)

type RedisChatMemoryStore struct {
	client   *redis.Client
	ttl      time.Duration
	maxTurns int64
}

func NewRedisChatMemoryStore(redisURL string, ttlSeconds int, maxTurns int) (*RedisChatMemoryStore, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	if ttlSeconds <= 0 {
		ttlSeconds = 3600
	}
	if maxTurns <= 0 {
		maxTurns = 8
	}
	c := redis.NewClient(opt)
	if err := c.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &RedisChatMemoryStore{
		client:   c,
		ttl:      time.Duration(ttlSeconds) * time.Second,
		maxTurns: int64(maxTurns),
	}, nil
}

func (r *RedisChatMemoryStore) key(tenantID, userID, sessionID string) string {
	return fmt.Sprintf("pl:mem:%s:%s:%s", tenantID, userID, sessionID)
}
func (r *RedisChatMemoryStore) summaryKey(tenantID, userID, sessionID string) string {
	return fmt.Sprintf("pl:mem:summary:%s:%s:%s", tenantID, userID, sessionID)
}
func (r *RedisChatMemoryStore) GetRecent(ctx context.Context, tenantID, userID, sessionID string) ([]services.ChatTurn, error) {
	k := r.key(tenantID, userID, sessionID)
	raw, err := r.client.LRange(ctx, k, 0, -1).Result()
	if err != nil {
		return nil, err
	}
	out := make([]services.ChatTurn, 0, len(raw))
	for _, row := range raw {
		var t services.ChatTurn
		if err := json.Unmarshal([]byte(row), &t); err == nil {
			out = append(out, t)
		}
	}
	return out, nil
}

func (r *RedisChatMemoryStore) AppendTurn(ctx context.Context, tenantID, userID, sessionID, userMessage, assistantSummary string, ts time.Time) error {
	k := r.key(tenantID, userID, sessionID)
	payload, _ := json.Marshal(services.ChatTurn{
		UserMessage:      userMessage,
		AssistantSummary: assistantSummary,
		Timestamp:        ts.UTC(),
	})

	pipe := r.client.TxPipeline()
	pipe.RPush(ctx, k, payload)
	pipe.LTrim(ctx, k, -r.maxTurns, -1)
	pipe.Expire(ctx, k, r.ttl)
	_, err := pipe.Exec(ctx)
	return err
}
func (r *RedisChatMemoryStore) GetSummary(ctx context.Context, tenantID, userID, sessionID string) (string, error) {
	k := r.summaryKey(tenantID, userID, sessionID)
	val, err := r.client.Get(ctx, k).Result()
	if err == redis.Nil {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return val, nil
}

func (r *RedisChatMemoryStore) SetSummary(ctx context.Context, tenantID, userID, sessionID, summary string) error {
	k := r.summaryKey(tenantID, userID, sessionID)
	return r.client.Set(ctx, k, summary, r.ttl).Err()
}
