package persistence

import "time"

// BatchProjectionWindowStart/End define the lifetime window used for every
// BATCH-scoped projection_state row. Unlike TENANT-scoped projections (which
// use a rolling 24h todayWindow), a batch can span multiple days, so batch
// projections accumulate forever in a single row per batch.
var BatchProjectionWindowStart = time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
var BatchProjectionWindowEnd = time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)
