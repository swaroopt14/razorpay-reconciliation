package shutdown

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"
)

// Coordinator listens for OS signals and orchestrates graceful shutdown.
type Coordinator struct {
	timeout time.Duration
	log     *zap.Logger
}

// New returns a Coordinator with the given shutdown timeout.
func New(timeout time.Duration, log *zap.Logger) *Coordinator {
	return &Coordinator{timeout: timeout, log: log}
}

// WaitForSignal blocks until SIGTERM or SIGINT is received.
// It then cancels the returned context and calls each cleanup function in order.
// Cleanup functions are called sequentially with the shutdown context.
func (c *Coordinator) WaitForSignal(cleanups ...func(ctx context.Context) error) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	sig := <-quit
	c.log.Info("shutdown signal received", zap.String("signal", sig.String()))

	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()

	for _, fn := range cleanups {
		if err := fn(ctx); err != nil {
			c.log.Error("cleanup error during shutdown", zap.Error(err))
		}
	}

	c.log.Info("graceful shutdown complete")
}
