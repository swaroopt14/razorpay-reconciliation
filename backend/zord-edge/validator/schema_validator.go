package validator

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/xeipuuv/gojsonschema"
)

var (
	intentSchema *gojsonschema.Schema
)

func InitSchemaValidator() error {
	// Try current directory first (Docker / Production)
	schemaPath := filepath.Join("schemas", "incoming_intent.request.v1.json")
	if _, err := os.Stat(schemaPath); os.IsNotExist(err) {
		// Try parent directory (Local development if running from cmd/)
		schemaPath = filepath.Join("..", "schemas", "incoming_intent.request.v1.json")
	}

	absPath, err := filepath.Abs(schemaPath)
	if err != nil {
		return fmt.Errorf("failed to resolve schema path: %w", err)
	}

	// Convert Windows path to valid file URI
	schemaURI := "file://" + filepath.ToSlash(absPath)

	schemaLoader := gojsonschema.NewReferenceLoader(schemaURI)
	schema, err := gojsonschema.NewSchema(schemaLoader)
	if err != nil {
		return fmt.Errorf("failed to load intent schema: %w", err)
	}

	intentSchema = schema
	return nil
}

func ValidateIntentRequest(data []byte) (*gojsonschema.Result, error) {
	if intentSchema == nil {
		return nil, fmt.Errorf("schema validator not initialized")
	}

	documentLoader := gojsonschema.NewBytesLoader(data)
	result, err := intentSchema.Validate(documentLoader)
	if err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	return result, nil
}

func FormatValidationErrors(result *gojsonschema.Result) []string {
	var errors []string

	for _, desc := range result.Errors() {
		errors = append(errors, desc.String())
	}

	return errors
}

func ValidateIntentRequestJSON(data json.RawMessage) error {
	result, err := ValidateIntentRequest(data)
	if err != nil {
		return err
	}

	if !result.Valid() {
		errors := FormatValidationErrors(result)
		return fmt.Errorf("validation failed: %v", errors)
	}

	return nil
}
