package worker

import (
	"errors"

	"zord-relay/config"
	"zord-relay/model"
)

// ErrUnknownRoute is returned when an event's attributes do not match any
// allow-list entry in strict mode, or any topic_map entry in legacy mode.
var ErrUnknownRoute = errors.New(model.ReasonCodeUnknownRoute)

// RouteKey represents the exact attributes required to map an event to a topic.
type RouteKey struct {
	SourceService string
	EventType     string
	EventVersion  string
	SchemaVersion string
}

// RouteGuard enforces explicit allow-listing for event routing.
type RouteGuard struct {
	strict       bool
	allowList    map[RouteKey]string
	legacyMap    map[string]string
	DefaultTopic string
}

// NewRouteGuard initializes a RouteGuard from the ServiceConfig.
// If RouteAllowList is non-empty, it runs in strict mode: only exact matches
// against the allow-list are permitted.
// If RouteAllowList is empty, it runs in legacy mode: uses TopicMap with a
// fallback to DefaultTopic.
func NewRouteGuard(cfg config.ServiceConfig) *RouteGuard {
	if len(cfg.RouteAllowList) > 0 {
		al := make(map[RouteKey]string)
		for _, entry := range cfg.RouteAllowList {
			key := RouteKey{
				SourceService: entry.SourceService,
				EventType:     entry.EventType,
				EventVersion:  entry.EventVersion,
				SchemaVersion: entry.SchemaVersion,
			}
			al[key] = entry.Topic
		}
		return &RouteGuard{
			strict:    true,
			allowList: al,
		}
	}

	return &RouteGuard{
		strict:       false,
		legacyMap:    cfg.TopicMap,
		DefaultTopic: cfg.DefaultTopic,
	}
}

// Route determines the destination Kafka topic for the given RouteKey.
// Returns (topic, nil) if a route is found or fallback is allowed.
// Returns ("", ErrUnknownRoute) if strict mode is enabled and the key is not in the allow-list.
func (g *RouteGuard) Route(key RouteKey) (string, error) {
	if g.strict {
		if topic, ok := g.allowList[key]; ok {
			return topic, nil
		}
		return "", ErrUnknownRoute
	}

	// Legacy mode fallback
	if topic, ok := g.legacyMap[key.EventType]; ok {
		return topic, nil
	}
	return g.DefaultTopic, nil
}
