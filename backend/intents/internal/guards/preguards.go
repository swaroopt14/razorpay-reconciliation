package guards

import (
	"encoding/json"
	"log"
	"os"
	"sync"
	"time"

	"zord-intent-engine/internal/models"

	"github.com/shopspring/decimal"
)

const (
	MaxBatchSize     = 20000
	TenantDailyLimit = 6000000000 // ₹60 Cr
	NEFTCutoffHour   = 18
)

// 4.2.7: TenantDailyLimit was a single currency-agnostic constant — fine
// while the system only ever accepted INR, but not configurable per
// currency for when that changes. TENANT_DAILY_LIMIT_BY_CURRENCY optionally
// overrides it per currency via a JSON object env var, e.g.
// `{"INR": 6000000000, "USD": 100000000}`. A currency with no entry (which,
// with the env var unset, is every currency) falls back to TenantDailyLimit
// unchanged — zero behavior change for every deployment that hasn't set
// this var.
var (
	dailyLimitByCurrencyOnce sync.Once
	dailyLimitByCurrency     map[string]decimal.Decimal
)

// parseDailyLimitByCurrency does the actual parsing, factored out of
// loadDailyLimitByCurrency's sync.Once so it can be unit-tested directly
// against arbitrary input strings without touching env vars or the
// process-wide cache.
func parseDailyLimitByCurrency(raw string) map[string]decimal.Decimal {
	result := map[string]decimal.Decimal{}
	if raw == "" {
		return result
	}
	var asStrings map[string]string
	if err := json.Unmarshal([]byte(raw), &asStrings); err != nil {
		log.Printf("⚠️ invalid TENANT_DAILY_LIMIT_BY_CURRENCY (must be a JSON object of currency -> amount string), ignoring: %v", err)
		return result
	}
	for currency, amountStr := range asStrings {
		amount, err := decimal.NewFromString(amountStr)
		if err != nil {
			log.Printf("⚠️ invalid TENANT_DAILY_LIMIT_BY_CURRENCY amount for %q=%q, ignoring: %v", currency, amountStr, err)
			continue
		}
		result[currency] = amount
	}
	return result
}

func loadDailyLimitByCurrency() map[string]decimal.Decimal {
	dailyLimitByCurrencyOnce.Do(func() {
		dailyLimitByCurrency = parseDailyLimitByCurrency(os.Getenv("TENANT_DAILY_LIMIT_BY_CURRENCY"))
	})
	return dailyLimitByCurrency
}

// DailyLimitForCurrency returns the configured tenant daily limit for
// currency, falling back to TenantDailyLimit when unconfigured.
func DailyLimitForCurrency(currency string) decimal.Decimal {
	if limit, ok := loadDailyLimitByCurrency()[currency]; ok {
		return limit
	}
	return decimal.NewFromInt(TenantDailyLimit)
}

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
