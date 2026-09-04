package tracing

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

const instrumentationName = "zord-relay"

// Provider wraps the OTel TracerProvider and exposes a clean shutdown.
type Provider struct {
	tp *sdktrace.TracerProvider
}

// Init initialises OpenTelemetry with an OTLP/HTTP exporter.
// Call Shutdown on the returned Provider during graceful shutdown.
func Init(ctx context.Context, serviceName, environment, otlpEndpoint string) (*Provider, error) {
	exp, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint(otlpEndpoint),
		otlptracehttp.WithInsecure(), // switch to WithTLSClientConfig for prod mTLS
	)
	if err != nil {
		return nil, fmt.Errorf("creating OTLP exporter: %w", err)
	}

	res := resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
		semconv.DeploymentEnvironment(environment),
	)

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		// Always sample in dev; use ParentBased(TraceIDRatioBased(0.1)) for high-volume prod.
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return &Provider{tp: tp}, nil
}

// Shutdown flushes and closes the tracer provider.
func (p *Provider) Shutdown(ctx context.Context) error {
	return p.tp.Shutdown(ctx)
}

// Tracer returns a named tracer from the global provider.
func Tracer() trace.Tracer {
	return otel.Tracer(instrumentationName)
}
