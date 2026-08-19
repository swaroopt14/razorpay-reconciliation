package config

import (
	"log/slog"
	"os"
	"strconv"

	"zord-edge/logger"
)

const (
	defaultMaxBulkUploadBytes int64 = 50 * 1024 * 1024 // 50 MiB — matches Kong request-size-limiting
	defaultMaxCSVRows               = 200_000
)

var (
	MaxBulkUploadBytes int64 = defaultMaxBulkUploadBytes
	MaxCSVRows         int   = defaultMaxCSVRows
)

func init() {
	if v := os.Getenv("MAX_BULK_BYTES"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			MaxBulkUploadBytes = n
		} else {
			logger.Log.Warn("MAX_BULK_BYTES is not a valid positive integer; using default",
				slog.String("invalid_value", v),
				slog.Int64("default_bytes", defaultMaxBulkUploadBytes))
		}
	}
	if v := os.Getenv("MAX_CSV_ROWS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			MaxCSVRows = n
		} else {
			logger.Log.Warn("MAX_CSV_ROWS is not a valid positive integer; using default",
				slog.String("invalid_value", v),
				slog.Int("default_rows", defaultMaxCSVRows))
		}
	}
	logger.Log.Info("bulk ingest limits configured",
		slog.Int64("max_bulk_bytes", MaxBulkUploadBytes),
		slog.Int("max_csv_rows", MaxCSVRows))
}
