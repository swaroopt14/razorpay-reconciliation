package worker

import (
	"testing"

	"zord-relay/config"

	"github.com/stretchr/testify/assert"
)

func TestRouteGuard_Strict(t *testing.T) {
	cfg := config.ServiceConfig{
		DefaultTopic: "default.topic",
		RouteAllowList: []config.RouteAllowListEntry{
			{
				SourceService: "zord-intent-engine",
				EventType:     "intent.approved.v1",
				EventVersion:  "v1",
				SchemaVersion: "v1",
				Topic:         "payments.intent.events.v1",
			},
			{
				SourceService: "zord-edge-service",
				EventType:     "ledger.created",
				EventVersion:  "",
				SchemaVersion: "",
				Topic:         "payments.ledger.events.v1",
			},
		},
	}

	guard := NewRouteGuard(cfg)

	t.Run("exact match intent", func(t *testing.T) {
		key := RouteKey{
			SourceService: "zord-intent-engine",
			EventType:     "intent.approved.v1",
			EventVersion:  "v1",
			SchemaVersion: "v1",
		}
		topic, err := guard.Route(key)
		assert.NoError(t, err)
		assert.Equal(t, "payments.intent.events.v1", topic)
	})

	t.Run("exact match edge", func(t *testing.T) {
		key := RouteKey{
			SourceService: "zord-edge-service",
			EventType:     "ledger.created",
			EventVersion:  "",
			SchemaVersion: "",
		}
		topic, err := guard.Route(key)
		assert.NoError(t, err)
		assert.Equal(t, "payments.ledger.events.v1", topic)
	})

	t.Run("mismatch schema version", func(t *testing.T) {
		key := RouteKey{
			SourceService: "zord-intent-engine",
			EventType:     "intent.approved.v1",
			EventVersion:  "v1",
			SchemaVersion: "v2", // mismatched
		}
		topic, err := guard.Route(key)
		assert.ErrorIs(t, err, ErrUnknownRoute)
		assert.Empty(t, topic)
	})

	t.Run("mismatch source service", func(t *testing.T) {
		key := RouteKey{
			SourceService: "rogue-service",
			EventType:     "intent.approved.v1",
			EventVersion:  "v1",
			SchemaVersion: "v1",
		}
		topic, err := guard.Route(key)
		assert.ErrorIs(t, err, ErrUnknownRoute)
		assert.Empty(t, topic)
	})

	t.Run("unknown event type", func(t *testing.T) {
		key := RouteKey{
			SourceService: "zord-intent-engine",
			EventType:     "intent.mystery.v99",
			EventVersion:  "v1",
			SchemaVersion: "v1",
		}
		topic, err := guard.Route(key)
		assert.ErrorIs(t, err, ErrUnknownRoute)
		assert.Empty(t, topic)
	})
}

func TestRouteGuard_Legacy(t *testing.T) {
	cfg := config.ServiceConfig{
		DefaultTopic: "default.topic",
		TopicMap: map[string]string{
			"mapped.event": "mapped.topic",
		},
	}

	guard := NewRouteGuard(cfg)

	t.Run("mapped event", func(t *testing.T) {
		key := RouteKey{
			EventType: "mapped.event",
		}
		topic, err := guard.Route(key)
		assert.NoError(t, err)
		assert.Equal(t, "mapped.topic", topic)
	})

	t.Run("unmapped event falls back to default", func(t *testing.T) {
		key := RouteKey{
			EventType: "unmapped.event",
		}
		topic, err := guard.Route(key)
		assert.NoError(t, err)
		assert.Equal(t, "default.topic", topic)
	})
}
