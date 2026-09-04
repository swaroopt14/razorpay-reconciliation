package tracing

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
)

// InitTracing initializes OpenTelemetry tracing + metrics.
func InitTracing(serviceName string) func() {
	ctx := context.Background()

	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		log.Printf("OTEL_EXPORTER_OTLP_ENDPOINT not set — OpenTelemetry disabled for %s", serviceName)
		return func() {}
	}

	insecure := true
	if v := os.Getenv("OTEL_EXPORTER_OTLP_INSECURE"); v != "" {
		if parsed, err := strconv.ParseBool(v); err == nil {
			insecure = parsed
		}
	}

	traceExp, err := otlptracegrpc.New(ctx, traceOpts(endpoint, insecure)...)
	if err != nil {
		log.Printf("Failed to create OTLP exporter: %v", err)
		return func() {}
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
			semconv.ServiceVersionKey.String("1.0.0"),
		),
	)
	if err != nil {
		log.Printf("Failed to create resource: %v", err)
		return func() {}
	}

	tp := trace.NewTracerProvider(
		trace.WithBatcher(traceExp, trace.WithBatchTimeout(5*time.Second)),
		trace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	metricExp, err := otlpmetricgrpc.New(ctx, metricOpts(endpoint, insecure)...)
	if err != nil {
		log.Printf("Failed to create OTLP metric exporter: %v", err)
	}

	var mp *metric.MeterProvider
	if metricExp != nil {
		reader := metric.NewPeriodicReader(metricExp, metric.WithInterval(10*time.Second))
		mp = metric.NewMeterProvider(
			metric.WithReader(reader),
			metric.WithResource(res),
		)
		otel.SetMeterProvider(mp)
	}

	otel.SetTextMapPropagator(propagation.TraceContext{})

	log.Printf("OpenTelemetry initialized for service: %s (endpoint=%s)", serviceName, endpoint)

	return func() {
		if mp != nil {
			if err := mp.Shutdown(context.Background()); err != nil {
				log.Printf("Error shutting down meter provider: %v", err)
			}
		}
		if err := tp.Shutdown(context.Background()); err != nil {
			log.Printf("Error shutting down tracer provider: %v", err)
		}
	}
}

func traceOpts(endpoint string, insecure bool) []otlptracegrpc.Option {
	opts := []otlptracegrpc.Option{otlptracegrpc.WithEndpoint(endpoint)}
	if insecure {
		opts = append(opts, otlptracegrpc.WithInsecure())
	}
	return opts
}

func metricOpts(endpoint string, insecure bool) []otlpmetricgrpc.Option {
	opts := []otlpmetricgrpc.Option{otlpmetricgrpc.WithEndpoint(endpoint)}
	if insecure {
		opts = append(opts, otlpmetricgrpc.WithInsecure())
	}
	return opts
}
