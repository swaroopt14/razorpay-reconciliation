package services

import (
	"strings"

	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

var authoritativeDecisionPhrases = []string{
	"i approved",
	"approved successfully",
	"i rejected",
	"rejected successfully",
	"i settled",
	"settled successfully",
	"i reversed",
	"reversed successfully",
	"payment is guaranteed",
	"legally defended",
	"dispute-proof",
	"final approval",
	"official approval",
}

func enforceAdvisoryResponseGuard(resp dto.QueryResponse, class queryClass, chunks []model.RetrievedChunk) dto.QueryResponse {
	resp.Answer = utils.SanitizeAnswerText(resp.Answer)
	resp.NextActions = utils.SanitizeActions(resp.NextActions)
	resp.Citations = utils.SanitizeCitations(resp.Citations)
	resp.Citations = filterReadableCitations(resp.Citations)

	if containsAuthoritativeDecision(resp.Answer) {
		resp.Answer = "I can only provide an advisory review based on the available workspace evidence. I cannot approve, reject, settle, reverse, export, or perform operational actions. Please review the cited evidence and complete any final action in the authoritative Zord workflow."
		resp.Confidence = "low"
		resp.Citations = []dto.Citation{}
		resp.NextActions = []string{}
		return resp
	}

	if class == classOperational || class == classEvidence {
		if len(chunks) == 0 {
			resp.Confidence = "low"
			resp.Citations = []dto.Citation{}
			if strings.TrimSpace(resp.Answer) == "" {
				resp.Answer = "I do not have enough tenant-scoped evidence in the current workspace to answer that confidently."
			}
			return resp
		}
	}

	return resp
}

func containsAuthoritativeDecision(answer string) bool {
	s := strings.ToLower(strings.TrimSpace(answer))
	for _, phrase := range authoritativeDecisionPhrases {
		if strings.Contains(s, phrase) {
			return true
		}
	}
	return false
}
