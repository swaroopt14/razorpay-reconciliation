package handlers

import (
	"log"
	"os"
	"strconv"
	"time"
)

// backgroundJobSem is a counting semaphore implemented as a buffered channel.
// Its capacity limits how many background (post-202) goroutines may be doing
// heavy DB/parsing work concurrently across ALL handlers in this package.
//
// Capacity is read from BACKGROUND_JOB_MAX_CONCURRENCY at startup; defaults
// to 10 if the variable is unset. An invalid (non-integer) value is treated as
// a misconfiguration: the default is used and a warning is logged.
var backgroundJobSem chan struct{}

func init() {
	const defaultConcurrency = 10

	n := defaultConcurrency
	if raw := os.Getenv("BACKGROUND_JOB_MAX_CONCURRENCY"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			log.Printf("background_job.concurrency_limit invalid value %q — defaulting to %d", raw, defaultConcurrency)
		} else {
			n = parsed
		}
	}

	log.Printf("background_job.concurrency_limit max_concurrent_jobs=%d", n)
	backgroundJobSem = make(chan struct{}, n)
}

// acquireJobSlot blocks until a concurrency slot is available, then claims it.
// It returns the time at which the call was made so callers can compute the
// wait duration for logging.
//
// Every acquireJobSlot call MUST be paired with a deferred releaseJobSlot call.
func acquireJobSlot() (waitStart time.Time) {
	waitStart = time.Now()
	backgroundJobSem <- struct{}{}
	log.Printf("background_job.slot_acquired wait_ms=%d", time.Since(waitStart).Milliseconds())
	return waitStart
}

// releaseJobSlot frees a concurrency slot so another waiting goroutine may
// proceed. It is always called via defer immediately after acquireJobSlot.
func releaseJobSlot() {
	<-backgroundJobSem
}
