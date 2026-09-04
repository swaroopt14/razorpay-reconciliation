package auth

import "net/http"

// Role constants for INTEL-02's role-gated policy/action endpoints.
//
// NOTE: as of this change, zord-edge only ever issues the "role" claim as
// the hardcoded literal "CUSTOMER_ADMIN" (user_auth_service.go) — no path
// exists yet to issue POLICY_ADMIN or ACTION_APPROVER. The auth_users.role
// column itself is unconstrained TEXT, so no schema change is needed, but a
// zord-edge-side provisioning path is required before any real token can
// satisfy RequireRole below. Tracked as a follow-up, not fixed here.
const (
	RolePolicyAdmin    = "POLICY_ADMIN"
	RoleActionApprover = "ACTION_APPROVER"
)

// RequireRole must be chained after RequireAuth (typically via Protect, then
// RequireRole on top). 401s if no verified principal is on context (a
// programmer error — this middleware was used without RequireAuth ahead of
// it). 403s if the principal does not hold roleName.
func RequireRole(roleName string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			principal, ok := FromContext(r.Context())
			if !ok {
				writeAuthError(w, http.StatusUnauthorized, "no verified principal on request")
				return
			}
			if !principal.HasRole(roleName) {
				writeAuthError(w, http.StatusForbidden, "principal lacks required role: "+roleName)
				return
			}
			next(w, r)
		}
	}
}
