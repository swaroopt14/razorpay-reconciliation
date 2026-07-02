package handlers

import (
	"context"
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

// backgroundJobTimeout limits how long any background job can run before its
// context is cancelled, preventing hung downstream calls from holding onto
// concurrency slots forever.
//
// Read from BACKGROUND_JOB_TIMEOUT_MINUTES at startup; defaults to 30 mins.
var backgroundJobTimeout time.Duration

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

	const defaultTimeoutMins = 30
	tm := defaultTimeoutMins
	if raw := os.Getenv("BACKGROUND_JOB_TIMEOUT_MINUTES"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			log.Printf("background_job.timeout invalid value %q — defaulting to %d mins", raw, defaultTimeoutMins)
		} else {
			tm = parsed
		}
	}
	backgroundJobTimeout = time.Duration(tm) * time.Minute

	log.Printf("background_job.concurrency_limit max_concurrent_jobs=%d timeout_mins=%d", n, tm)
	backgroundJobSem = make(chan struct{}, n)
}

// backgroundJobContext returns a context (derived from context.Background())
// bounded by the configured backgroundJobTimeout, and its CancelFunc.
// Callers must defere the cancel func to free resources immediately.
func backgroundJobContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), backgroundJobTimeout)
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
