package handlers

import "net/http"

// chiMW adapts the internal/auth package's http.HandlerFunc-wrapping
// middleware style (func(http.HandlerFunc) http.HandlerFunc) to chi's
// http.Handler-wrapping style (func(http.Handler) http.Handler), so
// auth.RequireAuth / auth.RequireTenantMatch / auth.RequireRole(...) can be
// used with r.Use / r.With in routes.go.
func chiMW(hf func(http.HandlerFunc) http.HandlerFunc) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return hf(next.ServeHTTP)
	}
}
