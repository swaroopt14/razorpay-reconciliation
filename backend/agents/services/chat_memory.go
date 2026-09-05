package services

import (
	"context"
	"strings"
	"time"
)

type ChatTurn struct {
	UserMessage      string    `json:"user_message"`
	AssistantSummary string    `json:"assistant_summary"`
	Timestamp        time.Time `json:"timestamp"`
}

type ChatMemoryStore interface {
	GetRecent(ctx context.Context, tenantID, userID, sessionID string) ([]ChatTurn, error)
	AppendTurn(ctx context.Context, tenantID, userID, sessionID, userMessage, assistantSummary string, ts time.Time) error
	GetSummary(ctx context.Context, tenantID, userID, sessionID string) (string, error)
	SetSummary(ctx context.Context, tenantID, userID, sessionID, summary string) error
}

func SummarizeAssistantAnswer(s string, max int) string {
	x := strings.TrimSpace(s)
	if max <= 0 || len(x) <= max {
		return x
	}
	if max < 4 {
		return x[:max]
	}
	return x[:max-3] + "..."
}
