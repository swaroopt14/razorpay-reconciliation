// Package auth implements request-level authentication and tenant-binding
// for zord-intent-engine's public HTTP handlers.
//
// See ZORD_Intent_Engine_Remaining_Non_Evidence_Fixes_Developer_Action_Document
// (2026-07-20), item R-01: a public caller must never be able to read another
// tenant's data just by supplying a different tenant_id — the tenant used by
// every handler must come from a verified principal, not from request input.
package auth

import "context"

// AuthPrincipal is the verified identity behind an inbound public request,
// derived from a signed JWT issued by zord-edge. It is the only source of
// truth for "which tenant is this caller allowed to act as" — a
// caller-supplied tenant_id is merely a selector that must match it.
type AuthPrincipal struct {
	SubjectID      string
	SubjectType    string
	TenantID       string
	AllowedTenants []string
	Roles          []string
	Scopes         []string
	AuthMethod     string
	RequestID      string
}

// HasTenant reports whether the principal is allowed to act as tenantID —
// either as its primary tenant or one of its explicitly allowed tenants.
func (p AuthPrincipal) HasTenant(tenantID string) bool {
	if tenantID == "" {
		return false
	}
	if p.TenantID == tenantID {
		return true
	}
	for _, t := range p.AllowedTenants {
		if t == tenantID {
			return true
		}
	}
	return false
}

type contextKey struct{ name string }

var principalContextKey = &contextKey{"auth-principal"}

// WithPrincipal returns a new context carrying the verified principal.
func WithPrincipal(ctx context.Context, p AuthPrincipal) context.Context {
	return context.WithValue(ctx, principalContextKey, p)
}

// FromContext returns the verified principal stored on ctx by RequireAuth,
// if any. The bool is false when no principal is present (e.g. the handler
// isn't wrapped by RequireAuth, or is a route the middleware deliberately
// skips such as /internal/* or /health).
func FromContext(ctx context.Context) (AuthPrincipal, bool) {
	p, ok := ctx.Value(principalContextKey).(AuthPrincipal)
	return p, ok
}
