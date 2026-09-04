package models

// MappingProfile holds the configuration for a single PSP's settlement file format.
// Each PSP that the system supports has one profile registered in the ParserRegistry.
// The profile is selected by matching the psp query param from the upload request.
type MappingProfile struct {
	// ProfileID is the unique identifier stored in the DB alongside every parsed row
	// and canonical observation. e.g. "razorpay-recon-v1", "cashfree-settlement-v1"
	ProfileID string

	// ProfileVersion allows future schema changes without breaking existing records.
	// Increment the version string when the column mapping changes for a PSP.
	ProfileVersion string

	// SourceSystem is the PSP identifier stored in source_system DB columns.
	// e.g. "razorpay", "cashfree", "stripe"
	SourceSystem string

	// ArtifactFamily describes the settlement file category.
	// Always "PSP_SETTLEMENT_RECON" for phase 4.
	ArtifactFamily string

	// ParserKey is the key used to look up the correct parser in the registry.
	// Must match exactly what is registered in ParserRegistry.
	ParserKey string

	// FileExtension is the expected file extension for this PSP's export.
	// Used to validate the uploaded file before parsing. e.g. ".xlsx", ".csv"
	FileExtension string

	// PIIFields lists the column headers that should be dynamically extracted and tokenized as PII.
	PIIFields []string
}

// KnownProfiles is the single source of truth for all registered PSP profiles.
// To add a new PSP: add one entry here and create the corresponding parser file.
var KnownProfiles = map[string]MappingProfile{
	// razorpay is the key passed as ?psp=razorpay in the upload request
	"razorpay": {
		ProfileID:      "razorpay-recon-v1",
		ProfileVersion: "V1.0.0",
		SourceSystem:   "razorpay",
		ArtifactFamily: "PSP_SETTLEMENT_RECON",
		ParserKey:      "razorpay",
		FileExtension:  ".xlsx",
		PIIFields:      []string{"account_number", "ifsc", "vpa", "name", "phone", "email"},
	},
	// cashfree is the key passed as ?psp=cashfree in the upload request
	"cashfree": {
		ProfileID:      "cashfree-settlement-v1",
		ProfileVersion: "V1.0.0",
		SourceSystem:   "cashfree",
		ArtifactFamily: "PSP_SETTLEMENT_RECON",
		ParserKey:      "cashfree",
		FileExtension:  ".csv",
		PIIFields:      []string{"account_number", "ifsc", "vpa", "name", "phone", "email"},
	},
}

// GetProfile looks up a profile by PSP name. Returns the profile and true if found.
// Returns empty profile and false if the PSP is not registered.
func GetProfile(psp string) (MappingProfile, bool) {
	p, ok := KnownProfiles[psp]
	return p, ok
}
