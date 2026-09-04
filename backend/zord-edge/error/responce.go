package error

import (
	"encoding/json"
	"net/http"
)

func WriteError(
	w http.ResponseWriter,
	status int,
	apiErr APIError,
) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(apiErr)
}
