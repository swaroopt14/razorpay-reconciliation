package services

import (
	"fmt"
	"strings"
)

var (
	parsers = map[string]IntentParser{
		"BANK":     &BankParser{},
		"NBFC":     &NBFCParser{},
		"MERCHANT": &MerchantParser{},
		"VENDOR":   &VendorParser{},
		"GATEWAY":  &BankParser{},
	}
)

// GetParserByType returns the static IntentParser for the given tenant type.
func GetParserByType(tenantType string) (IntentParser, error) {
	upperType := strings.ToUpper(strings.TrimSpace(tenantType))
	parser, ok := parsers[upperType]
	if !ok {
		return nil, fmt.Errorf("unsupported tenant type: %s", tenantType)
	}
	return parser, nil
}
