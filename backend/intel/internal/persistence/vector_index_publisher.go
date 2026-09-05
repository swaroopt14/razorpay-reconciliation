package persistence

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/kafka"
)

type VectorIndexPublisher interface {
	PublishVectorIndexRequest(ctx context.Context, event kafka.VectorIndexRequestEvent) error
}

var vectorIndexPublisher VectorIndexPublisher

func SetVectorIndexPublisher(p VectorIndexPublisher) {
	vectorIndexPublisher = p
}

func emitVectorIndexRequest(sourceEventType, tenantID, entityType, entityID, batchID string, metadata map[string]string) {
	if vectorIndexPublisher == nil {
		return
	}

	tenantID = strings.TrimSpace(tenantID)
	entityID = strings.TrimSpace(entityID)
	batchID = strings.TrimSpace(batchID)

	if tenantID == "" || entityID == "" {
		return
	}

	if metadata == nil {
		metadata = map[string]string{}
	}

	event := kafka.VectorIndexRequestEvent{
		EventID:         uuid.NewString(),
		SchemaVersion:   "v1",
		EventType:       kafka.VectorIndexEventRequested,
		SourceService:   "zord-intelligence",
		SourceEventType: sourceEventType,
		TenantID:        tenantID,
		EntityType:      entityType,
		EntityID:        entityID,
		BatchID:         batchID,
		Operation:       kafka.VectorIndexOperationUpsert,
		OccurredAt:      time.Now().UTC(),
		ContentVersion:  "v1",
		Metadata:        metadata,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := vectorIndexPublisher.PublishVectorIndexRequest(ctx, event); err != nil {
		log.Printf("[intelligence][vector-index] publish failed tenant=%s entity=%s id=%s err=%v", tenantID, entityType, entityID, err)
		return
	}

	log.Printf("[intelligence][vector-index] publish ok tenant=%s entity=%s id=%s", tenantID, entityType, entityID)
}

func snapshotBatchID(scopeType string, scopeRef *string) string {
	if !strings.EqualFold(strings.TrimSpace(scopeType), "BATCH") || scopeRef == nil {
		return ""
	}
	return strings.TrimSpace(*scopeRef)
}
