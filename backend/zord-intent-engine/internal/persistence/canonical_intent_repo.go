package persistence

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"zord-intent-engine/internal/models"
)

type InMemoryCanonicalIntentRepo struct {
	mu    sync.Mutex
	store map[string]models.CanonicalIntent
}

func NewInMemoryCanonicalIntentRepo() *InMemoryCanonicalIntentRepo {
	return &InMemoryCanonicalIntentRepo{
		store: make(map[string]models.CanonicalIntent),
	}
}

func (r *InMemoryCanonicalIntentRepo) Save(
	_ context.Context,
	intent models.CanonicalIntent,
) (models.CanonicalIntent, error) {

	r.mu.Lock()
	defer r.mu.Unlock()

	intent.IntentID = uuid.NewString()
	r.store[intent.IntentID] = intent
	return intent, nil
}
