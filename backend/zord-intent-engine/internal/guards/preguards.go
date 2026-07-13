package guards

import (
	"time"

	"zord-intent-engine/internal/models"
)

const (
	MaxBatchSize     = 20000
	TenantDailyLimit = 6000000000 // ₹60 Cr
	NEFTCutoffHour   = 18
)

type Constraints struct {
	Deadline string `json:"deadline"`
}

func RunPreGuards(
	in *models.IncomingIntent,
	intent models.ParsedIncomingIntent,
) *models.DLQEntry {
	batchID := ""
	if in.BatchID != nil {
		batchID = *in.BatchID
	}

	// Corridor guard removed: validator.validateCurrency (SemanticValidate,
	// which runs before RunPreGuards) now rejects non-INR currency first with
	// the same TENANT_CORRIDOR_NOT_ALLOWED reason code — this stage would
	// never see a non-INR intent anymore.

	// -------- Deadline guard --------

	if deadlineRaw, ok := intent.Constraints["deadline"]; ok {

		deadlineStr, ok := deadlineRaw.(string)
		if ok {

			deadline, err := time.Parse(time.RFC3339, deadlineStr)
			if err == nil && time.Now().After(deadline) {

				return &models.DLQEntry{
					TenantID:    in.TenantID.String(),
					EnvelopeID:  in.EnvelopeID.String(),
					Stage:       "PREGUARD",
					ReasonCode:  "DEADLINE_EXPIRED",
					DLQStatus:   models.ClassifyDLQ("DEADLINE_EXPIRED"),
					ErrorDetail: "intent deadline expired",
					Replayable:  false,
					BatchID:     batchID,
					CreatedAt:   time.Now().UTC(),
				}

			}

		}
	}

	//NEFT cutoff window guard

	now := time.Now()

	if intent.IntentType == "NEFT" {

		if now.Hour() >= NEFTCutoffHour {

			return &models.DLQEntry{
				TenantID:    in.TenantID.String(),
				EnvelopeID:  in.EnvelopeID.String(),
				Stage:       "PREGUARD",
				ReasonCode:  "PAYMENT_WINDOW_CLOSED",
				DLQStatus:   models.ClassifyDLQ("PAYMENT_WINDOW_CLOSED"),
				ErrorDetail: "NEFT cutoff window passed",
				Replayable:  true,
				BatchID:     batchID,
				CreatedAt:   time.Now().UTC(),
			}
		}
	}
	return nil
}
