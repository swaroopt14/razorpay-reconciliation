package worker

import (
	"context"
	"fmt"
	"sync"

	"go.uber.org/zap"

	"zord-relay/config"
	"zord-relay/publisher"
)

// WorkerRunner defines the interface for running a service worker loop.
type WorkerRunner interface {
	Run(ctx context.Context)
	Name() string
}

// Scheduler starts and supervises one WorkerRunner per configured upstream service.
// Each worker runs in its own goroutine with independent poll loops.
type Scheduler struct {
	workers []WorkerRunner
	log     *zap.Logger
}

// NewScheduler builds one WorkerRunner per service defined in cfg.Services.
func NewScheduler(
	cfg *config.Config,
	pub publisher.Publisher,
	log *zap.Logger,
) (*Scheduler, error) {
	if len(cfg.Services) == 0 {
		return nil, fmt.Errorf("scheduler: no services configured")
	}

	workers := make([]WorkerRunner, 0, len(cfg.Services))
	for _, svcCfg := range cfg.Services {
		var w WorkerRunner
		if svcCfg.IsDLQ {
			w = NewDLQWorker(svcCfg, cfg.Relay, pub, log)
		} else if svcCfg.IsBatch {
			w = NewBatchWorker(svcCfg, cfg.Relay, pub, log)
		} else {
			w = NewWorker(svcCfg, cfg.Relay, pub, log)
		}
		workers = append(workers, w)
		log.Info("registered worker",
			zap.String("service", svcCfg.Name),
			zap.String("base_url", svcCfg.BaseURL),
			zap.String("default_topic", svcCfg.DefaultTopic),
			zap.Bool("is_dlq", svcCfg.IsDLQ),
			zap.Bool("is_batch", svcCfg.IsBatch),
		)
	}

	return &Scheduler{workers: workers, log: log}, nil
}

// Run starts all workers and blocks until ctx is cancelled.
// Each worker is supervised: if it panics, it is logged but does not bring
// down the other workers.
func (s *Scheduler) Run(ctx context.Context) {
	var wg sync.WaitGroup
	for _, w := range s.workers {
		wg.Add(1)
		go func(w WorkerRunner) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					s.log.Error("worker panicked",
						zap.String("service", w.Name()),
						zap.Any("panic", r),
					)
				}
			}()
			w.Run(ctx)
		}(w)
	}
	wg.Wait()
	s.log.Info("all workers stopped")
}
