package poll

import (
	"fmt"
	"time"
)

const (
	maxWindow             = 31 * 24 * time.Hour
	DefaultOverlapMinutes = 10
)

// ApplyOverlap pads window_from backward. overlapMinutes <= 0 leaves from unchanged.
func ApplyOverlap(from time.Time, overlapMinutes int) time.Time {
	if overlapMinutes <= 0 || from.IsZero() {
		return from
	}
	return from.UTC().Add(-time.Duration(overlapMinutes) * time.Minute)
}

// ValidateWindow rejects inverted, empty, or unbounded windows.
// window_to is expected to already be frozen at job-create time (not "now" per page).
func ValidateWindow(from, to, now time.Time) error {
	if from.IsZero() || to.IsZero() {
		return fmt.Errorf("window_from and window_to are required")
	}
	if !to.After(from) {
		return fmt.Errorf("window_to must be after window_from")
	}
	if to.Sub(from) > maxWindow {
		return fmt.Errorf("window must be at most 31 days")
	}
	if from.After(now.Add(time.Minute)) {
		return fmt.Errorf("window_from cannot be in the future")
	}
	return nil
}

// FreezeWindow copies the requested bounds and caps window_to at now.
func FreezeWindow(from, to, now time.Time) (time.Time, time.Time) {
	from = from.UTC()
	to = to.UTC()
	now = now.UTC()
	if to.After(now) {
		to = now
	}
	return from, to
}

// OverlapLookback returns a recent overlapping repair window.
func OverlapLookback(now time.Time, lookback time.Duration) (time.Time, time.Time) {
	now = now.UTC()
	if lookback <= 0 {
		lookback = 2 * time.Hour
	}
	return now.Add(-lookback), now
}

// CivilDays enumerates inclusive UTC dates covering [from, to).
func CivilDays(from, to time.Time) []struct{ Year, Month, Day int } {
	start := time.Date(from.UTC().Year(), from.UTC().Month(), from.UTC().Day(), 0, 0, 0, 0, time.UTC)
	end := time.Date(to.UTC().Year(), to.UTC().Month(), to.UTC().Day(), 0, 0, 0, 0, time.UTC)
	if to.UTC().After(end) {
		// include the end date if window_to is not midnight
		end = end.AddDate(0, 0, 1)
	}
	var days []struct{ Year, Month, Day int }
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		days = append(days, struct{ Year, Month, Day int }{d.Year(), int(d.Month()), d.Day()})
	}
	if len(days) == 0 {
		days = append(days, struct{ Year, Month, Day int }{from.UTC().Year(), int(from.UTC().Month()), from.UTC().Day()})
	}
	return days
}
