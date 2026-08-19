package auth

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

// writeAuthError matches zord-intelligence's existing handlers.writeError
// JSON shape ({"error": "message"}) so a 401/403 from this middleware is
// indistinguishable, on the wire, from every other error this service
// returns. internal/handlers can't be imported here (it would create an
// import cycle — handlers imports auth to wire routes), so the shape is
// duplicated rather than shared.
func writeAuthError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func bearerToken(r *http.Request) (string, bool) {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if h == "" {
		return "", false
	}
	const prefix = "Bearer "
	if len(h) <= len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return "", false
	}
	token := strings.TrimSpace(h[len(prefix):])
	if token == "" {
		return "", false
	}
	return token, true
}

// RequireAuth verifies the caller's bearer token and injects the resulting
// AuthPrincipal into the request context before calling next. Missing,
// malformed, expired or badly-signed tokens are rejected with 401 and never
// reach the handler — per INTEL-01, no public handler should be reachable
// without a verified principal.
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r)
		if !ok {
			writeAuthError(w, http.StatusUnauthorized, "missing or malformed Authorization header")
			return
		}

		claims, err := verifyAccessToken(token)
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		principal := AuthPrincipal{
			SubjectID:   claims.UserID,
			SubjectType: "user",
			TenantID:    claims.TenantID,
			Roles:       splitRoles(claims.Role),
			AuthMethod:  "jwt_hs256",
			RequestID:   claims.ID,
		}

		ctx := WithPrincipal(r.Context(), principal)
		next(w, r.WithContext(ctx))
	}
}

// requestedTenantHeaders lists every header name existing handlers already
// read a caller-supplied tenant_id from, checked in this order. Keeping this
// list in sync with handler-level parsing (rather than rewriting every
// handler to pull tenant from the principal directly) keeps this change
// minimal: it only adds the missing verification step, continuing to accept
// tenant_id but failing with 403 when it does not match the principal.
var requestedTenantHeaders = []string{"X-Tenant-Id", "x-tenant-id", "tenant-id", "tenant_id"}

func requestedTenant(r *http.Request) string {
	for _, h := range requestedTenantHeaders {
		if v := normalizeHeaderTenant(r.Header.Get(h)); v != "" {
			return v
		}
	}
	return strings.TrimSpace(r.URL.Query().Get("tenant_id"))
}

// normalizeHeaderTenant collapses a header value that repeats the identical
// tenant ID multiple times, comma-joined, into a single value.
//
// This happens legitimately on the wire: some callers set the same tenant
// under two case-variant header names in one request — those normalise to
// the same HTTP header, and most fetch/Headers implementations *append*
// rather than overwrite on a duplicate, producing "value, value" rather than
// "value". That is not two different tenant claims, just the same one
// written twice, and must not be rejected as a mismatch. If the
// comma-separated parts are NOT all identical, this deliberately returns the
// raw value unchanged — a request actually claiming two different tenants in
// one header is ambiguous and should fail the match, not be silently
// resolved to one of them.
func normalizeHeaderTenant(raw string) string {
	v := strings.TrimSpace(raw)
	if v == "" || !strings.Contains(v, ",") {
		return v
	}
	parts := strings.Split(v, ",")
	first := strings.TrimSpace(parts[0])
	for _, p := range parts[1:] {
		if strings.TrimSpace(p) != first {
			return v // genuinely conflicting values — leave ambiguous, let it fail HasTenant
		}
	}
	return first
}

// RequireTenantMatch must be chained after RequireAuth. If the request
// supplies a tenant_id (via header or query — see requestedTenantHeaders),
// it must match the verified principal's tenant, or the request is denied
// with 403. A request that supplies no tenant_id at all passes through
// unchanged — existing per-handler "tenant_id is required" 400 checks are
// left in place and untouched by this middleware.
func RequireTenantMatch(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := FromContext(r.Context())
		if !ok {
			// Programmer error: RequireTenantMatch used without RequireAuth.
			writeAuthError(w, http.StatusUnauthorized, "no verified principal on request")
			return
		}

		if requested := requestedTenant(r); requested != "" && !principal.HasTenant(requested) {
			log.Printf(
				"tenant_mismatch route=%s principal_subject=%q principal_tenant=%q requested_tenant=%q auth_method=%q",
				r.URL.Path, principal.SubjectID, principal.TenantID, requested, principal.AuthMethod,
			)
			writeAuthError(w, http.StatusForbidden, "requested tenant is not authorised for this principal")
			return
		}

		next(w, r)
	}
}

// Protect composes RequireAuth and RequireTenantMatch — the standard guard
// for a public, tenant-scoped handler.
func Protect(next http.HandlerFunc) http.HandlerFunc {
	return RequireAuth(RequireTenantMatch(next))
}
