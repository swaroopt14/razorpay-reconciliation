package services

import (
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

type EvidenceRetriever interface {
	Retrieve(req dto.QueryRequest, intentID, traceID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error)
}
