package logger

import (
	"fmt"
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// New builds a production-grade structured JSON logger.
// Fields included on every log line:
//   service, instance_id, environment
func New(serviceName, instanceID, environment string) (*zap.Logger, error) {
	level := zapcore.InfoLevel
	if env := os.Getenv("LOG_LEVEL"); env != "" {
		if err := level.UnmarshalText([]byte(env)); err != nil {
			return nil, fmt.Errorf("invalid LOG_LEVEL %q: %w", env, err)
		}
	}

	encoderCfg := zap.NewProductionEncoderConfig()
	encoderCfg.TimeKey = "ts"
	encoderCfg.EncodeTime = zapcore.RFC3339NanoTimeEncoder
	encoderCfg.MessageKey = "msg"
	encoderCfg.LevelKey = "level"
	encoderCfg.CallerKey = "caller"
	encoderCfg.EncodeLevel = zapcore.LowercaseLevelEncoder

	core := zapcore.NewCore(
		zapcore.NewJSONEncoder(encoderCfg),
		zapcore.AddSync(os.Stdout),
		zap.NewAtomicLevelAt(level),
	)

	log := zap.New(core,
		zap.AddCaller(),
		zap.AddStacktrace(zapcore.ErrorLevel),
		zap.Fields(
			zap.String("service", serviceName),
			zap.String("instance_id", instanceID),
			zap.String("env", environment),
		),
	)

	return log, nil
}

// With returns a child logger with extra fields.
// Convenience wrapper so callers don't import zap directly for field creation.
func With(log *zap.Logger, fields ...zap.Field) *zap.Logger {
	return log.With(fields...)
}


// Logger is the global structured logger for zord-relay.
// All log lines must include at minimum: trace_id, tenant_id, dispatch_id.
// PII must never appear in any log line at any level.
var Logger *zap.Logger

func InitLogger(serviceName string) {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = "ts"
	cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	cfg.InitialFields = map[string]interface{}{
		"service": serviceName,
	}

	var err error
	Logger, err = cfg.Build(zap.AddCallerSkip(0))
	if err != nil {
		panic("failed to init logger: " + err.Error())
	}
}

func SyncLogger() {
	if Logger != nil {
		_ = Logger.Sync()
	}
}