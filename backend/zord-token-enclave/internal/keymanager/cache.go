package keymanager

// TOK-03: "Cache unwrapped DEK in memory for 5 min (reduce KMS API calls)."
//
// Keyed by the DB row's key_id (unique per key version -- a tenant's ACTIVE
// and RETIRING keys never collide), unbounded map with lazy expiry-on-read.
// Not shared across replicas by design (each replica caches independently,
// matching the "short cache" instruction) -- fine at this service's tenant
// scale (bounded by a B2B customer base, not millions of end users); an
// LRU/eviction library would be over-engineering for this ticket's actual
// scope.

import (
	"sync"
	"time"
)

const dekCacheTTL = 5 * time.Minute

type cacheEntry struct {
	dek       []byte
	expiresAt time.Time
}

type ttlCache struct {
	mu      sync.RWMutex
	entries map[string]cacheEntry
}

func newTTLCache() *ttlCache {
	return &ttlCache{entries: make(map[string]cacheEntry)}
}

// get returns the cached DEK for keyID if present and not expired.
func (c *ttlCache) get(keyID string) ([]byte, bool) {
	c.mu.RLock()
	entry, ok := c.entries[keyID]
	c.mu.RUnlock()
	if !ok || time.Now().After(entry.expiresAt) {
		return nil, false
	}
	return entry.dek, true
}

// set stores dek for keyID with a fresh 5-minute TTL. Best-effort zeroes
// any DEK it overwrites -- defense-in-depth so a stale key's bytes don't
// linger in process memory past their TTL any longer than necessary.
func (c *ttlCache) set(keyID string, dek []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if old, ok := c.entries[keyID]; ok {
		zero(old.dek)
	}
	c.entries[keyID] = cacheEntry{dek: dek, expiresAt: time.Now().Add(dekCacheTTL)}
}

func zero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
