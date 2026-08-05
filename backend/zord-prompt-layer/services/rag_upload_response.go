package services

import (
	"fmt"
	"strings"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
)

func buildLatestUploadEdgeOnlyResponse(query string, chunks []model.RetrievedChunk) (dto.QueryResponse, bool) {
	if !isLatestUploadProgressQuery(query) || !hasOnlyEdgeEvidence(chunks) {
		return dto.QueryResponse{}, false
	}

	rowCount := 0
	inProcess := 0
	failed := 0
	uploaded := false

	for _, c := range chunks {
		switch strings.ToLower(strings.TrimSpace(c.SourceType)) {
		case "edge_ingress_envelopes":
			if rowCount == 0 {
				if m := rowCountEstimateRe.FindStringSubmatch(c.Text); len(m) == 2 {
					fmt.Sscanf(m[1], "%d", &rowCount)
				}
			}
			uploaded = true
		case "edge_ingress_outbox":
			m := outboxStatusRe.FindStringSubmatch(strings.ToUpper(c.Text))
			if len(m) != 2 {
				continue
			}
			switch m[1] {
			case "FAILED":
				failed++
			case "PENDING", "SENT":
				inProcess++
			}
		}
	}

	if !uploaded || rowCount <= 0 {
		return dto.QueryResponse{}, false
	}

	if inProcess == 0 && failed == 0 {
		inProcess = rowCount
	}
	if inProcess > rowCount {
		inProcess = rowCount
	}
	if failed > rowCount {
		failed = rowCount
	}

	answer := fmt.Sprintf("**Your latest upload has %d payments, and they are still being processed.**\n- I can see the file was received by Zord.\n- The payments have entered the pipeline, but I do not see final done/not-done updates yet.", rowCount)
	if failed > 0 {
		answer = fmt.Sprintf("**Your latest upload has %d payments. %d are still being processed and %d did not go through.**\n- I can see the file was received by Zord.\n- The latest upload is still mid-flow, so final payment updates may still be catching up.", rowCount, maxInt(inProcess, rowCount-failed), failed)
	}

	return dto.QueryResponse{
		Answer:     answer,
		Confidence: "medium",
	}, true
}

func hasOnlyEdgeEvidence(chunks []model.RetrievedChunk) bool {
	if len(chunks) == 0 {
		return false
	}
	for _, c := range chunks {
		if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(c.SourceType)), "edge_") {
			return false
		}
	}
	return true
}

func isLatestUploadProgressQuery(q string) bool {
	s := strings.ToLower(strings.TrimSpace(q))
	if s == "" {
		return false
	}
	if !(strings.Contains(s, "latest upload") || strings.Contains(s, "recent upload") || strings.Contains(s, "latest batch")) {
		return false
	}
	mentionsPayments := strings.Contains(s, "payment") || strings.Contains(s, "payout") || strings.Contains(s, "disbursement")
	mentionsProgress := strings.Contains(s, "in process") || strings.Contains(s, "pending") || strings.Contains(s, "still") || strings.Contains(s, "status")
	return mentionsPayments && mentionsProgress
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
