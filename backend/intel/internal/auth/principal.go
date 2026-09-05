// Package auth implements request-level authentication and tenant-binding
// for zord-intelligence's public HTTP handlers.
//
// Ported from zord-intent-engine/internal/auth (that service's own "R-01"
// fix), which solved the identical problem: a public caller must never be
// able to read or act on another tenant's data just by supplying a different
// tenant_id — the tenant used by every handler must come from a verified
// principal, not from request input. See corrective-action-report INTEL-01
// (tenant binding) and INTEL-02 (role gating, via HasRole below).
package auth

import (
	"context"
	"strings"
)

// AuthPrincipal is the verified identity behind an inbound public request,
// derived from a signed JWT issued by zord-edge. It is the only source of
// truth for "which tenant is this caller allowed to act as" and "which
// operations is this caller allowed to perform" — a caller-supplied
// tenant_id is merely a selector that must match it, never a source of
// identity itself.
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
// Comparison is trimmed and case-insensitive: tenant IDs are UUIDs, whose
// case carries no meaning, and the same value can arrive from several
// sources (a JWT claim, an HTTP header, a query param) that don't all
// normalise case identically — this must not become a false "mismatch".
func (p AuthPrincipal) HasTenant(tenantID string) bool {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(p.TenantID), tenantID) {
		return true
	}
	for _, t := range p.AllowedTenants {
		if strings.EqualFold(strings.TrimSpace(t), tenantID) {
			return true
		}
	}
	return false
}

// HasRole reports whether the principal holds roleName (e.g. POLICY_ADMIN,
// ACTION_APPROVER — see rbac.go), case-insensitively. INTEL-02: policy and
// action mutation endpoints gate on this before touching any data.
func (p AuthPrincipal) HasRole(roleName string) bool {
	roleName = strings.TrimSpace(roleName)
	if roleName == "" {
		return false
	}
	for _, r := range p.Roles {
		if strings.EqualFold(strings.TrimSpace(r), roleName) {
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
// isn't wrapped by RequireAuth, or is a route deliberately left public such
// as /healthz or /readyz).
func FromContext(ctx context.Context) (AuthPrincipal, bool) {
	p, ok := ctx.Value(principalContextKey).(AuthPrincipal)
	return p, ok
}
