package handlers

import (
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
	"zord-outcome-engine/models"
)

// SupportedPSPEntry describes a single registered PSP in the supported-psps response.
type SupportedPSPEntry struct {
	// PSPKey is the value to pass as ?psp= in the upload request.
	PSPKey string `json:"psp_key"`
	// SourceSystem is the identifier stored in the database for this PSP.
	SourceSystem string `json:"source_system"`
	// FileExtension is the expected file extension for uploads from this PSP.
	FileExtension string `json:"file_extension"`
	// ProfileID is the mapping profile identifier for audit/traceability.
	ProfileID string `json:"profile_id"`
}

// GetSupportedPSPs returns the list of PSPs that the service currently supports.
// The list is built dynamically from models.KnownProfiles so it never goes stale.
// Clients should call this endpoint to discover valid ?psp= values before uploading.
//
// GET /v1/settlement/supported-psps
func GetSupportedPSPs(c *gin.Context) {
	// Build the response from KnownProfiles so it always reflects the current registry.
	// Sort by psp_key for stable, deterministic output.
	psps := make([]SupportedPSPEntry, 0, len(models.KnownProfiles))
	for key, profile := range models.KnownProfiles {
		psps = append(psps, SupportedPSPEntry{
			PSPKey:        key,
			SourceSystem:  profile.SourceSystem,
			FileExtension: profile.FileExtension,
			ProfileID:     profile.ProfileID,
		})
	}
	sort.Slice(psps, func(i, j int) bool { return psps[i].PSPKey < psps[j].PSPKey })

	c.JSON(http.StatusOK, gin.H{"supported_psps": psps})
}
