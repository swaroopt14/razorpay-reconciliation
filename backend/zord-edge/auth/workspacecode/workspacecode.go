// Package workspacecode maps tenant storage fields to the workspace identifier
// exposed in auth and tenant APIs (console "workspace code").
package workspacecode

import "strings"

// FromKeyPrefix returns the public workspace code for a tenant's stored API key
// prefix (the segment before "." in "prefix.secret" keys).
func FromKeyPrefix(keyPrefix string) string {
	return strings.TrimSpace(keyPrefix)
}
