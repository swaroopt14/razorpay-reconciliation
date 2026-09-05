package utils

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

type QueryScope struct {
	WantsVisualization  bool
	TimePhrase          string
	HasExplicitTime     bool
	StartUTC            time.Time
	EndUTC              time.Time
	ScopeGranularity    string
	NeedsClarification  bool
	ClarificationReason string
}

var (
	dmyPhraseRe = regexp.MustCompile(`(?i)^\s*(\d{1,2})(st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{4})\s*$`)
	mdyPhraseRe = regexp.MustCompile(`(?i)^\s*(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(st|nd|rd|th)?[,]?\s+(\d{4})\s*$`)
	myPhraseRe  = regexp.MustCompile(`(?i)^\s*(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{4})\s*$`)
)

func NormalizeScope(raw QueryScope, now time.Time, loc *time.Location) QueryScope {
	if loc == nil {
		loc = time.UTC
	}
	out := raw
	// If LLM already provided a validated explicit window, trust it.
	if raw.HasExplicitTime && !raw.StartUTC.IsZero() && !raw.EndUTC.IsZero() && raw.EndUTC.After(raw.StartUTC) {
		out.HasExplicitTime = true
		out.StartUTC = raw.StartUTC.UTC()
		out.EndUTC = raw.EndUTC.UTC()
		return out
	}

	p := strings.ToLower(strings.TrimSpace(raw.TimePhrase))
	nowLocal := now.In(loc)

	if p == "" {
		return out
	}

	setDayWindow := func(day time.Time) {
		start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc)
		out.HasExplicitTime = true
		out.StartUTC = start.UTC()
		out.EndUTC = start.Add(24 * time.Hour).UTC()
	}

	setMonthWindow := func(year int, month time.Month) {
		start := time.Date(year, month, 1, 0, 0, 0, 0, loc)
		out.HasExplicitTime = true
		out.StartUTC = start.UTC()
		out.EndUTC = start.AddDate(0, 1, 0).UTC()
	}

	setYearWindow := func(year int) {
		start := time.Date(year, time.January, 1, 0, 0, 0, 0, loc)
		out.HasExplicitTime = true
		out.StartUTC = start.UTC()
		out.EndUTC = start.AddDate(1, 0, 0).UTC()
	}

	switch p {
	case "today":
		setDayWindow(nowLocal)
		return out
	case "yesterday":
		setDayWindow(nowLocal.AddDate(0, 0, -1))
		return out
	case "this month":
		setMonthWindow(nowLocal.Year(), nowLocal.Month())
		return out
	case "last month":
		d := nowLocal.AddDate(0, -1, 0)
		setMonthWindow(d.Year(), d.Month())
		return out
	case "this year":
		setYearWindow(nowLocal.Year())
		return out
	case "last year":
		setYearWindow(nowLocal.Year() - 1)
		return out
	case "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday":
		target := map[string]time.Weekday{
			"monday": time.Monday, "tuesday": time.Tuesday, "wednesday": time.Wednesday,
			"thursday": time.Thursday, "friday": time.Friday, "saturday": time.Saturday, "sunday": time.Sunday,
		}[p]
		diff := int(nowLocal.Weekday() - target)
		if diff < 0 {
			diff += 7
		}
		setDayWindow(nowLocal.AddDate(0, 0, -diff))
		return out
	}

	// date:YYYY-MM-DD
	if strings.HasPrefix(p, "date:") {
		v := strings.TrimSpace(strings.TrimPrefix(p, "date:"))
		if d, err := time.ParseInLocation("2006-01-02", v, loc); err == nil {
			setDayWindow(d)
			return out
		}
	}

	// year:YYYY
	if strings.HasPrefix(p, "year:") {
		v := strings.TrimSpace(strings.TrimPrefix(p, "year:"))
		if y, err := strconv.Atoi(v); err == nil && y >= 1900 && y <= 2100 {
			setYearWindow(y)
			return out
		}
	}

	// date_phrase:<natural date>, month_phrase:<month year>
	if strings.HasPrefix(p, "date_phrase:") {
		v := strings.TrimSpace(strings.TrimPrefix(p, "date_phrase:"))
		if d, ok := parseNaturalDate(v, loc); ok {
			setDayWindow(d)
			return out
		}
	}
	if strings.HasPrefix(p, "month_phrase:") {
		v := strings.TrimSpace(strings.TrimPrefix(p, "month_phrase:"))
		if y, m, ok := parseMonthYear(v); ok {
			setMonthWindow(y, m)
			return out
		}
	}

	// Soft fallback: try parse directly if p itself is a natural date/month phrase
	if d, ok := parseNaturalDate(p, loc); ok {
		setDayWindow(d)
		return out
	}
	if y, m, ok := parseMonthYear(p); ok {
		setMonthWindow(y, m)
		return out
	}

	return out
}

func parseNaturalDate(s string, loc *time.Location) (time.Time, bool) {
	if m := dmyPhraseRe.FindStringSubmatch(strings.TrimSpace(s)); len(m) == 5 {
		day, _ := strconv.Atoi(m[1])
		month, ok := parseMonthName(m[3])
		if !ok {
			return time.Time{}, false
		}
		year, _ := strconv.Atoi(m[4])
		return time.Date(year, month, day, 0, 0, 0, 0, loc), true
	}
	if m := mdyPhraseRe.FindStringSubmatch(strings.TrimSpace(s)); len(m) == 5 {
		month, ok := parseMonthName(m[1])
		if !ok {
			return time.Time{}, false
		}
		day, _ := strconv.Atoi(m[2])
		year, _ := strconv.Atoi(m[4])
		return time.Date(year, month, day, 0, 0, 0, 0, loc), true
	}
	return time.Time{}, false
}

func parseMonthYear(s string) (int, time.Month, bool) {
	m := myPhraseRe.FindStringSubmatch(strings.TrimSpace(s))
	if len(m) != 3 {
		return 0, 0, false
	}
	month, ok := parseMonthName(m[1])
	if !ok {
		return 0, 0, false
	}
	year, err := strconv.Atoi(m[2])
	if err != nil || year < 1900 || year > 2100 {
		return 0, 0, false
	}
	return year, month, true
}

func parseMonthName(m string) (time.Month, bool) {
	switch strings.ToLower(strings.TrimSpace(m)) {
	case "jan", "january":
		return time.January, true
	case "feb", "february":
		return time.February, true
	case "mar", "march":
		return time.March, true
	case "apr", "april":
		return time.April, true
	case "may":
		return time.May, true
	case "jun", "june":
		return time.June, true
	case "jul", "july":
		return time.July, true
	case "aug", "august":
		return time.August, true
	case "sep", "sept", "september":
		return time.September, true
	case "oct", "october":
		return time.October, true
	case "nov", "november":
		return time.November, true
	case "dec", "december":
		return time.December, true
	default:
		return 0, false
	}
}
