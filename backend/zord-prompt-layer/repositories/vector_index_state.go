package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

type VectorIndexStateRepository interface {
	Enabled() bool
	EnsureSchema(ctx context.Context) error
	Get(ctx context.Context, vectorID string) (VectorIndexState, bool, error)
	MarkUpserted(ctx context.Context, state VectorIndexState) error
	MarkFailed(ctx context.Context, state VectorIndexState, cause error) error
	DeleteForEntity(ctx context.Context, tenantID, entityType, entityID string) error
}

type VectorIndexState struct {
	VectorID           string
	TenantID           string
	SourceService      string
	EntityType         string
	EntityID           string
	SourceType         string
	ContentHash        string
	ContentVersion     string
	PineconeNamespace  string
	EmbeddingModel     string
	EmbeddingDimension int
	LastEventID        string
	Status             string
	ErrorMessage       string
	LastIndexedAt      time.Time
}

type PostgresVectorIndexStateRepository struct {
	db *sql.DB
}

func NewPostgresVectorIndexStateRepository(db *sql.DB) *PostgresVectorIndexStateRepository {
	return &PostgresVectorIndexStateRepository{db: db}
}

func (r *PostgresVectorIndexStateRepository) Enabled() bool {
	return r != nil && r.db != nil
}

func (r *PostgresVectorIndexStateRepository) EnsureSchema(ctx context.Context) error {
	if !r.Enabled() {
		return nil
	}

	statements := []string{
		`CREATE TABLE IF NOT EXISTS vector_index_state (
			vector_id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			source_service TEXT NOT NULL DEFAULT '',
			entity_type TEXT NOT NULL DEFAULT '',
			entity_id TEXT NOT NULL DEFAULT '',
			source_type TEXT NOT NULL DEFAULT '',
			content_hash TEXT NOT NULL DEFAULT '',
			content_version TEXT NOT NULL DEFAULT '',
			pinecone_namespace TEXT NOT NULL DEFAULT '',
			embedding_model TEXT NOT NULL DEFAULT '',
			embedding_dimension INTEGER NOT NULL DEFAULT 0,
			last_event_id TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'indexed',
			error_message TEXT NOT NULL DEFAULT '',
			last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_vector_index_state_entity
			ON vector_index_state (tenant_id, entity_type, entity_id)`,
		`CREATE INDEX IF NOT EXISTS idx_vector_index_state_hash
			ON vector_index_state (tenant_id, content_hash)`,
	}

	for _, stmt := range statements {
		if _, err := r.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}

	return nil
}

func (r *PostgresVectorIndexStateRepository) Get(ctx context.Context, vectorID string) (VectorIndexState, bool, error) {
	if !r.Enabled() {
		return VectorIndexState{}, false, nil
	}

	vectorID = strings.TrimSpace(vectorID)
	if vectorID == "" {
		return VectorIndexState{}, false, nil
	}

	var state VectorIndexState
	err := r.db.QueryRowContext(ctx, `
		SELECT
			vector_id,
			tenant_id,
			source_service,
			entity_type,
			entity_id,
			source_type,
			content_hash,
			content_version,
			pinecone_namespace,
			embedding_model,
			embedding_dimension,
			last_event_id,
			status,
			error_message,
			last_indexed_at
		FROM vector_index_state
		WHERE vector_id = $1
	`, vectorID).Scan(
		&state.VectorID,
		&state.TenantID,
		&state.SourceService,
		&state.EntityType,
		&state.EntityID,
		&state.SourceType,
		&state.ContentHash,
		&state.ContentVersion,
		&state.PineconeNamespace,
		&state.EmbeddingModel,
		&state.EmbeddingDimension,
		&state.LastEventID,
		&state.Status,
		&state.ErrorMessage,
		&state.LastIndexedAt,
	)

	if err == sql.ErrNoRows {
		return VectorIndexState{}, false, nil
	}
	if err != nil {
		return VectorIndexState{}, false, err
	}

	return state, true, nil
}

func (r *PostgresVectorIndexStateRepository) MarkUpserted(ctx context.Context, state VectorIndexState) error {
	if !r.Enabled() {
		return nil
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO vector_index_state (
			vector_id,
			tenant_id,
			source_service,
			entity_type,
			entity_id,
			source_type,
			content_hash,
			content_version,
			pinecone_namespace,
			embedding_model,
			embedding_dimension,
			last_event_id,
			status,
			error_message,
			last_indexed_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'indexed', '', now(), now())
		ON CONFLICT (vector_id) DO UPDATE SET
			tenant_id = EXCLUDED.tenant_id,
			source_service = EXCLUDED.source_service,
			entity_type = EXCLUDED.entity_type,
			entity_id = EXCLUDED.entity_id,
			source_type = EXCLUDED.source_type,
			content_hash = EXCLUDED.content_hash,
			content_version = EXCLUDED.content_version,
			pinecone_namespace = EXCLUDED.pinecone_namespace,
			embedding_model = EXCLUDED.embedding_model,
			embedding_dimension = EXCLUDED.embedding_dimension,
			last_event_id = EXCLUDED.last_event_id,
			status = 'indexed',
			error_message = '',
			last_indexed_at = now(),
			updated_at = now()
	`,
		state.VectorID,
		state.TenantID,
		state.SourceService,
		state.EntityType,
		state.EntityID,
		state.SourceType,
		state.ContentHash,
		state.ContentVersion,
		state.PineconeNamespace,
		state.EmbeddingModel,
		state.EmbeddingDimension,
		state.LastEventID,
	)

	if err == nil {
		log.Printf("[prompt-layer][vector-index] state saved tenant=%s entity=%s id=%s vector=%s", state.TenantID, state.EntityType, state.EntityID, state.VectorID)
	}

	return err
}

func (r *PostgresVectorIndexStateRepository) MarkFailed(ctx context.Context, state VectorIndexState, cause error) error {
	if !r.Enabled() {
		return nil
	}

	msg := ""
	if cause != nil {
		msg = cause.Error()
	}
	if len(msg) > 500 {
		msg = msg[:500]
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO vector_index_state (
			vector_id,
			tenant_id,
			source_service,
			entity_type,
			entity_id,
			source_type,
			content_hash,
			content_version,
			pinecone_namespace,
			embedding_model,
			embedding_dimension,
			last_event_id,
			status,
			error_message,
			last_indexed_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'failed', $13, now(), now())
		ON CONFLICT (vector_id) DO UPDATE SET
			last_event_id = EXCLUDED.last_event_id,
			status = 'failed',
			error_message = EXCLUDED.error_message,
			updated_at = now()
	`,
		state.VectorID,
		state.TenantID,
		state.SourceService,
		state.EntityType,
		state.EntityID,
		state.SourceType,
		state.ContentHash,
		state.ContentVersion,
		state.PineconeNamespace,
		state.EmbeddingModel,
		state.EmbeddingDimension,
		state.LastEventID,
		msg,
	)

	if err == nil {
		log.Printf("[prompt-layer][vector-index] state failed tenant=%s entity=%s id=%s vector=%s err=%s", state.TenantID, state.EntityType, state.EntityID, state.VectorID, msg)
	}

	return err
}

func (r *PostgresVectorIndexStateRepository) DeleteForEntity(ctx context.Context, tenantID, entityType, entityID string) error {
	if !r.Enabled() {
		return nil
	}

	tenantID = strings.ToLower(strings.TrimSpace(tenantID))
	entityType = strings.ToLower(strings.TrimSpace(entityType))
	entityID = strings.TrimSpace(entityID)

	if tenantID == "" || entityType == "" || entityID == "" {
		return fmt.Errorf("missing vector index state delete key")
	}

	_, err := r.db.ExecContext(ctx, `
		DELETE FROM vector_index_state
		WHERE tenant_id = $1
		  AND entity_type = $2
		  AND entity_id = $3
	`, tenantID, entityType, entityID)

	if err == nil {
		log.Printf("[prompt-layer][vector-index] state delete tenant=%s entity=%s id=%s", tenantID, entityType, entityID)
	}

	return err
}
