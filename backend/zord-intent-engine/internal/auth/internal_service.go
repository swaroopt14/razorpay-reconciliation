package auth

import (
	"log"
	"net/http"
	"os"
	"strings"
)

// ScopeIntentReadCrossTenant is required to call /internal/dlq/count, which
// reads DLQ data with no tenant filter, across every tenant, so it demands a
// stronger credential than an end-user session.
const ScopeIntentReadCrossTenant = "intent.read.cross_tenant"

// InternalServicePrincipal is the verified identity of a same-cluster
// service calling an /internal/* route directly — never an end-user.
type InternalServicePrincipal struct {
	ServiceID string
	Scopes    []string
}

func (p InternalServicePrincipal) HasScope(scope string) bool {
	for _, s := range p.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}

// internalServiceTokens returns the configured token -> principal mapping.
// Today there is exactly one known internal caller of these routes
// (zord-console's server-side BFF, see services/backend/intents.ts),
// authenticated via INTERNAL_SERVICE_TOKEN. Kept as a map so a second
// internal caller with its own token/scope set can be added later without
// reshaping RequireInternalScope.
//
// INTERNAL_SERVICE_TOKEN accepts a comma-separated list so a rotation can
// run the old and new token side by side — deploy the new value here first,
// roll the caller over to it, then drop the old one — instead of needing a
// single atomic cutover. Every listed token maps to the same principal.
func internalServiceTokens() map[string]InternalServicePrincipal {
	tokens := map[string]InternalServicePrincipal{}
	raw := strings.Split(os.Getenv("INTERNAL_SERVICE_TOKEN"), ",")
	for _, v := range raw {
		if v = strings.TrimSpace(v); v != "" {
			tokens[v] = InternalServicePrincipal{
				ServiceID: "zord-console",
				Scopes:    []string{ScopeIntentReadCrossTenant},
			}
		}
	}
	return tokens
}

// RequireInternalScope protects an /internal/* route with a signed internal
// service token (R-02) instead of Kong's end-user JWT — these routes are
// deliberately excluded from Kong's route table (kubernetes/api-gateway),
// so the only thing standing between them and any pod on the cluster
// network today is that omission. This is fail-closed by design: unlike the
// pre-existing authorizeRelay() in internal/handlers/outbox_handler.go
// (which allows every caller through when RELAY_AUTH_TOKEN is unset), a
// missing INTERNAL_SERVICE_TOKEN configuration here denies every request
// rather than silently disabling the check.
//
// A caller must present X-Internal-Service-Token matching a configured
// token, and that token's principal must carry requiredScope:
//   - no token, or a token matching nothing configured -> 401 (unauthenticated)
//   - recognised token lacking requiredScope           -> 403 (forbidden)
//   - recognised token with requiredScope               -> next() runs
//
// End-user Authorization bearer JWTs are never consulted here — they simply
// aren't the credential type this route expects, so presenting one without
// X-Internal-Service-Token is indistinguishable from presenting nothing.
func RequireInternalScope(requiredScope string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimSpace(r.Header.Get("X-Internal-Service-Token"))
		if token == "" {
			logInternalAccess(r, "", nil, requiredScope, http.StatusUnauthorized)
			writeAuthError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "missing internal service token")
			return
		}

		principal, ok := internalServiceTokens()[token]
		if !ok {
			logInternalAccess(r, "", nil, requiredScope, http.StatusUnauthorized)
			writeAuthError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "invalid internal service token")
			return
		}

		if !principal.HasScope(requiredScope) {
			logInternalAccess(r, principal.ServiceID, principal.Scopes, requiredScope, http.StatusForbidden)
			writeAuthError(w, http.StatusForbidden, "SCOPE_FORBIDDEN", "internal service token missing required scope")
			return
		}

		logInternalAccess(r, principal.ServiceID, principal.Scopes, requiredScope, http.StatusOK)
		next(w, r)
	}
}

// logInternalAccess records caller service, granted scopes, the scope this
// route required, the request target (query string) and outcome status, per
// R-02's audit requirement. request_id is best-effort: these routes bypass Kong (whose
// correlation-id plugin stamps X-Request-Id on gateway-routed traffic), so
// direct internal-network callers may not carry one.
func logInternalAccess(r *http.Request, serviceID string, scopes []string, requiredScope string, status int) {
	requestID := strings.TrimSpace(r.Header.Get("X-Request-Id"))
	if requestID == "" {
		requestID = "-"
	}
	log.Printf(
		"internal_access route=%s method=%s caller_service=%q scopes=%v required_scope=%q request_id=%s target=%q status=%d",
		r.URL.Path, r.Method, serviceID, scopes, requiredScope, requestID, r.URL.RawQuery, status,
	)
}
