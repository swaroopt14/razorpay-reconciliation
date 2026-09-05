package services

import "fmt"

// parserRegistry maps a parser key to its implementation.
// This map is populated in init() so it is ready before any request arrives.
// To register a new parser: add one line to the init() function below.
var parserRegistry = map[string]SettlementParser{}

func init() {
	// Register all known PSP parsers here.
	// The key must match the ParserKey in models.KnownProfiles.
	parserRegistry["razorpay"] = &RazorpayParser{}
	parserRegistry["cashfree"] = &CashfreeParser{}
}

// GetParser returns the SettlementParser for the given parser key.
// Returns an error if the key is not registered.
// The parserKey comes from models.MappingProfile.ParserKey, which is looked up
// using the ?psp= query param from the upload request.
func GetParser(parserKey string) (SettlementParser, error) {
	p, ok := parserRegistry[parserKey]
	if !ok {
		return nil, fmt.Errorf("parser registry: no parser registered for key %q", parserKey)
	}
	return p, nil
}
