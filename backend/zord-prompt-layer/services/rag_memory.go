package services

import (
	"context"
	"log"
	"strings"
	"time"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/utils"
)

func (s *DefaultRAGService) persistConversationMemory(ctx context.Context, req dto.QueryRequest, previousSummary string, answer string) {
	if s.memory == nil {
		return
	}

	cleanAnswer := utils.SanitizeAnswerText(answer)
	if strings.TrimSpace(cleanAnswer) == "" {
		return
	}

	turnSummary := SummarizeAssistantAnswer(cleanAnswer, 500)
	if err := s.memory.AppendTurn(ctx, req.TenantID, req.UserID, req.SessionID, req.Query, turnSummary, time.Now().UTC()); err != nil {
		log.Printf("[prompt-layer][memory] turn write failed tenant=%s user=%s session=%s err=%v", req.TenantID, req.UserID, req.SessionID, err)
		return
	}

	log.Printf("[prompt-layer][memory] turn stored tenant=%s user=%s session=%s", req.TenantID, req.UserID, req.SessionID)

	updatedSummary, err := s.llm.UpdateConversationSummary(previousSummary, req.Query, cleanAnswer)
	if err != nil {
		log.Printf("[prompt-layer][memory] summary update failed tenant=%s user=%s session=%s err=%v", req.TenantID, req.UserID, req.SessionID, err)
		return
	}

	updatedSummary = utils.SanitizeAnswerText(updatedSummary)
	if strings.TrimSpace(updatedSummary) == "" || uuidLeakRe.MatchString(updatedSummary) {
		log.Printf("[prompt-layer][memory] summary skipped tenant=%s user=%s session=%s reason=empty_or_sensitive", req.TenantID, req.UserID, req.SessionID)
		return
	}

	if err := s.memory.SetSummary(ctx, req.TenantID, req.UserID, req.SessionID, updatedSummary); err != nil {
		log.Printf("[prompt-layer][memory] summary write failed tenant=%s user=%s session=%s err=%v", req.TenantID, req.UserID, req.SessionID, err)
		return
	}

	log.Printf("[prompt-layer][memory] summary stored tenant=%s user=%s session=%s", req.TenantID, req.UserID, req.SessionID)
}
func buildMemoryContext(summary string, recentTurns string) string {
	var b strings.Builder
	if strings.TrimSpace(summary) != "" {
		b.WriteString("Conversation summary: ")
		b.WriteString(utils.SanitizeAnswerText(summary))
		b.WriteString("\n")
	}
	if strings.TrimSpace(recentTurns) != "" {
		b.WriteString("Recent turns:\n")
		b.WriteString(recentTurns)
	}
	return strings.TrimSpace(b.String())
}

func resolveFollowupQuery(query string, history []ChatTurn, memorySummary string) string {
	q := strings.TrimSpace(query)
	if q == "" {
		return q
	}

	if len(history) == 0 && strings.TrimSpace(memorySummary) == "" {
		return q
	}

	lower := strings.ToLower(q)
	isFollowup := strings.Contains(lower, "this") ||
		strings.Contains(lower, "that") ||
		strings.Contains(lower, "those") ||
		strings.Contains(lower, "these") ||
		strings.Contains(lower, "them") ||
		strings.Contains(lower, "it") ||
		strings.Contains(lower, "same ones") ||
		strings.Contains(lower, "is this good") ||
		strings.Contains(lower, "is it good") ||
		strings.Contains(lower, "why") ||
		strings.Contains(lower, "what should i do") ||
		strings.Contains(lower, "what next") ||
		strings.Contains(lower, "explain that")

	if !isFollowup {
		return q
	}

	var prevUser string
	var prevAssistant string
	if len(history) > 0 {
		last := history[len(history)-1]
		prevUser = utils.SanitizeAnswerText(last.UserMessage)
		prevAssistant = utils.SanitizeAnswerText(last.AssistantSummary)
	}

	parts := []string{q}
	if strings.TrimSpace(memorySummary) != "" {
		parts = append(parts, "Conversation summary: "+utils.SanitizeAnswerText(memorySummary))
	}
	if strings.TrimSpace(prevUser) != "" || strings.TrimSpace(prevAssistant) != "" {
		parts = append(parts, "Previous turn: "+prevUser+" "+prevAssistant)
	}

	return strings.Join(parts, " ")
}
func shouldOverrideOutOfScopeForFollowup(query string, resolvedQuery string, memorySummary string, historyContext string, history []ChatTurn) bool {
	if strings.TrimSpace(memorySummary) == "" && strings.TrimSpace(historyContext) == "" && len(history) == 0 {
		return false
	}

	if !isConversationFollowupQuery(query) && strings.EqualFold(strings.TrimSpace(query), strings.TrimSpace(resolvedQuery)) {
		return false
	}

	return hasBusinessRelevantMemory(memorySummary, historyContext, history)
}

func isConversationFollowupQuery(query string) bool {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return false
	}

	followupPhrases := []string{
		"this",
		"that",
		"those",
		"these",
		"them",
		"it",
		"same",
		"same ones",
		"is this good",
		"is it good",
		"is that good",
		"good or bad",
		"should i worry",
		"is it risky",
		"is this risky",
		"why",
		"why so",
		"why is that",
		"what next",
		"next step",
		"what should i do",
		"what does this mean",
		"explain this",
		"explain that",
		"tell me more",
		"how to fix",
		"how can i resolve",
	}

	for _, phrase := range followupPhrases {
		if q == phrase || strings.Contains(q, phrase) {
			return true
		}
	}

	return len(strings.Fields(q)) <= 5 && strings.Contains(q, "?")
}

func hasBusinessRelevantMemory(memorySummary string, historyContext string, history []ChatTurn) bool {
	var b strings.Builder
	b.WriteString(" ")
	b.WriteString(memorySummary)
	b.WriteString(" ")
	b.WriteString(historyContext)

	for _, turn := range history {
		b.WriteString(" ")
		b.WriteString(turn.UserMessage)
		b.WriteString(" ")
		b.WriteString(turn.AssistantSummary)
	}

	text := strings.ToLower(b.String())
	if strings.TrimSpace(text) == "" {
		return false
	}

	businessTerms := []string{
		"payment",
		"payments",
		"payout",
		"payouts",
		"intent",
		"intents",
		"payment instruction",
		"payment instructions",
		"batch",
		"batches",
		"settlement",
		"settlements",
		"bank",
		"psp",
		"confirmation",
		"confirmed",
		"status",
		"processing",
		"created",
		"pending",
		"failed",
		"failure",
		"retry",
		"delayed",
		"delay",
		"unmatched",
		"unresolved",
		"review",
		"manual review",
		"value needing review",
		"proof",
		"evidence",
		"dispute",
		"upload",
		"uploaded",
		"file",
		"received",
		"processed",
		"duplicate",
		"risk",
		"gap",
		"short-settled",
		"unlinked",
	}

	for _, term := range businessTerms {
		if strings.Contains(text, term) {
			return true
		}
	}

	return false
}
