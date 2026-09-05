package middleware

import "github.com/gin-gonic/gin"

// PrincipalType identifies the kind of authenticated principal on a request.
type PrincipalType string

const (
	// PrincipalUserSession is set when the request is authenticated via a
	// short-lived JWT access token issued by /v1/auth/login.
	PrincipalUserSession PrincipalType = "USER_SESSION"

	// PrincipalTenantAPIKey is set when the request is authenticated via a
	// long-lived tenant API key in "prefix.secret" format.
	PrincipalTenantAPIKey PrincipalType = "TENANT_API_KEY"
)

// contextKeyPrincipalType is the gin.Context key used to store the principal type.
const contextKeyPrincipalType = "principal_type"

// GetPrincipalType retrieves the PrincipalType stamped on the request context by
// Authenticate() or JWTAuthenticate(). Returns ("", false) if no principal type was set
// (e.g. on unauthenticated or public routes).
func GetPrincipalType(c *gin.Context) (PrincipalType, bool) {
	v, ok := c.Get(contextKeyPrincipalType)
	if !ok {
		return "", false
	}
	pt, ok := v.(PrincipalType)
	return pt, ok
}
