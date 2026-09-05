package recon

import "errors"

var errNotFound = errors.New("not_found")

func IsNotFound(err error) bool {
	return errors.Is(err, errNotFound)
}
