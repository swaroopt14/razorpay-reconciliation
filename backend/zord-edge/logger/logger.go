package logger

import (
	"log/slog"
	"os"
)

// Pre-initialise a default JSON logger so that any log.Info calls in init()
// functions across the codebase don't panic before main() calls logger.Init().
var Log *slog.Logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
	Level: slog.LevelDebug,
}))

func Init(serviceName string) {
	Log = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	})).With(
		slog.String("service", serviceName),
	)
	slog.SetDefault(Log)
}
