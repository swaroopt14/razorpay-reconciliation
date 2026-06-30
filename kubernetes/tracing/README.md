# Tracing Stack 

Deploy distributed tracing with password authentication and end-to-end service-to-service tracking.

---

## Prerequisites

- Logged into Bastion EC2
- `kubectl` configured for `arealis-zord-prod-eks`
- Code pulled: `cd ~/Arealis-Zord-intent`

---

## Step 1: Clean Up

```bash
kubectl delete namespace tracing --ignore-not-found
sleep 10
```

---

## Step 2: Deploy everything (one command)

```bash
kubectl apply -k kubernetes/tracing
```

Wait for pods:
```bash
kubectl get pods -n tracing -w
# Expected:
# jaeger-xxx         2/2   Running   0   (2 containers: jaeger + auth-proxy)
# otel-collector-xxx 1/1   Running   0
```

---

## Step 3: Login to Jaeger

Open: `https://jaeger.zordnet.com`

```
Username: jaeger
Password: Arealiszord@2026
```

---

## Quick Reference — All Commands

```bash
kubectl delete namespace tracing --ignore-not-found
sleep 10
kubectl apply -k kubernetes/tracing
kubectl get pods -n tracing -w
```

---

## Architecture — How End-to-End Tracing Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  END-TO-END DISTRIBUTED TRACE FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client Request                                                              │
│       │                                                                      │
│       ▼                                                                      │
│  Kong API Gateway (adds traceparent header)                                  │
│       │                                                                      │
│       ▼  HTTP + traceparent header                                           │
│  zord-edge (otelgin middleware extracts trace, creates child span)           │
│       │                                                                      │
│       ▼  HTTP + traceparent header                                           │
│  zord-intent-engine (otelhttp extracts trace, creates child span)            │
│       │                                                                      │
│       ├──▶ HTTP call to zord-token-enclave (propagates traceparent)          │
│       │                                                                      │
│       ▼  Writes to outbox DB                                                 │
│  zord-relay (polls outbox, starts span linked to original trace)             │
│       │                                                                      │
│       ▼  Kafka message + traceparent in headers                              │
│  zord-outcome-engine (extracts traceparent from Kafka headers)               │
│       │                                                                      │
│       ▼                                                                      │
│  zord-intelligence / zord-evidence (child spans)                             │
│                                                                              │
│  ═══════════════════════════════════════════════════════════                  │
│  ALL spans share the SAME trace_id → visible as one trace in Jaeger          │
│  ═══════════════════════════════════════════════════════════                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## How Cross-Service Tracing Works (W3C Trace Context)

Every HTTP request carries a `traceparent` header:
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              │  │                                │                  │
              │  trace_id (shared across all)     span_id (unique)   sampled
              version
```

**Service A** creates a trace → passes `traceparent` in HTTP header → **Service B** extracts it and creates a child span under the same trace_id.

For Kafka messages, the same `traceparent` is injected into Kafka record headers by the producer and extracted by the consumer.

---

## Components

| Component | Purpose | Port |
|-----------|---------|------|
| **OTel Collector** | Receives traces (OTLP), batches, forwards to Jaeger | 4317 (gRPC), 4318 (HTTP) |
| **Jaeger** | Stores traces, provides search UI, dependency graph | 16686 (UI) |
| **Nginx Auth Proxy** | Password-protects Jaeger UI | 8080 |
| **SpanMetrics Connector** | Generates RED metrics from traces for Monitor tab | — |

---

## Jaeger UI Tabs Explained

| Tab | What it shows | Requirement |
|-----|---------------|-------------|
| **Search** | Find traces by service, operation, duration, tags | Traces flowing |
| **Compare** | Compare two traces side-by-side | 2+ traces |
| **System Architecture** | Service dependency graph (A → B → C) | Multi-service traces with same trace_id |
| **Monitor** (SPM) | Latency, error rate, request rate per service | SpanMetrics connector enabled ✅ |

---

## Cross-Service Tracing — Fixed

All Kafka consumers now extract W3C `traceparent` from Kafka message headers:

| Service | File | Status |
|---------|------|--------|
| zord-outcome-engine | `kafka/consumer.go` | ✅ Extracts traceparent, creates consumer span |
| zord-evidence | `kafka/consumer.go` | ✅ Extracts traceparent, creates consumer span |
| zord-intelligence | `kafka/consumer.go` | ✅ Extracts traceparent, creates consumer span |
| zord-relay (producer) | `publisher/kafka.go` | ✅ Injects traceparent into Kafka headers |

**After rebuilding images (Jenkins), you will see:**
1. **Search tab:** Traces spanning multiple services (edge → intent → relay → outcome)
2. **System Architecture tab:** Dependency graph showing service connections
3. **Monitor tab:** RED metrics (Request rate, Error rate, Duration) per service

---

## SpanMetrics — How the Monitor Tab Works

The OTel Collector has a `spanmetrics` connector that:
1. Receives all traces
2. Extracts RED metrics (request count, error count, duration histograms)
3. Exports metrics to Prometheus via remote write
4. Jaeger queries Prometheus for these metrics and shows them in the Monitor tab

This is already configured. Once traces flow with proper cross-service linking, the Monitor tab will show service performance data.

---

## Files Used

| File | Purpose |
|------|---------|
| `tracing/namespace.yaml` | Creates `tracing` namespace |
| `tracing/jaeger/credentials-secret.yaml` | Nginx htpasswd + config for basic auth |
| `tracing/jaeger/deployment.yaml` | Jaeger + nginx auth-proxy sidecar |
| `tracing/jaeger/service.yaml` | Jaeger collector (4317) + query (16686→8080) |
| `tracing/otel-collector/configmap.yaml` | OTel config with spanmetrics connector |
| `tracing/otel-collector/deployment.yaml` | OTel Collector pod |
| `tracing/otel-collector/service.yaml` | OTel Collector service (4317, 4318) |
| `tracing/ingress.yaml` | Exposes jaeger.zordnet.com |

---

## Login Credentials

| Username | Password | Access |
|----------|----------|--------|
| `jaeger` | `Arealiszord@2026` | Jaeger UI (full access) |

---

## Troubleshooting

### Jaeger shows no services
```bash
kubectl logs deploy/otel-collector -n tracing --tail=10
# If "connection refused" → services can't reach collector
# Check: services have OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector.tracing.svc.cluster.local:4317
```

### Only individual service traces (no cross-service)
- This is the Kafka consumer extraction issue (see "What the Dev Team Needs to Fix" above)
- HTTP-to-HTTP calls (edge → intent-engine → token-enclave) should already show linked traces

### System Architecture tab empty
- Requires multi-service traces (same trace_id across 2+ services)
- Will populate after dev team fixes Kafka consumer trace extraction

### Monitor tab shows nothing
```bash
# Check spanmetrics are being exported to Prometheus
kubectl logs deploy/otel-collector -n tracing --tail=20 | grep -i "metric\|spanmetrics"
# Check Prometheus has the metrics
kubectl exec -it deploy/prometheus -n monitoring -- wget -qO- "http://localhost:9090/api/v1/query?query=calls_total" | head -20
```

### Auth proxy returns 502
```bash
kubectl logs deploy/jaeger -c auth-proxy -n tracing --tail=10
# If "upstream connection refused" → jaeger container not ready yet (wait 30s)
```

---

## How Companies Set Up End-to-End Tracing (Best Practices)

| Company Pattern | How They Do It |
|-----------------|----------------|
| **Uber (Jaeger creators)** | W3C traceparent in all HTTP + gRPC, custom Kafka header propagation |
| **Netflix** | Propagate trace context in ALL inter-service calls including message queues |
| **Stripe** | Every request gets a `request_id` that becomes the trace_id, propagated everywhere |
| **Google (Dapper)** | Trace context in RPC metadata, automatic instrumentation via service mesh |
| **LinkedIn** | OTel SDK in every service, Kafka header propagation for async flows |

**Key principle:** The trace_id must survive across ALL boundaries — HTTP, gRPC, Kafka, Redis, DB calls. If any link breaks the chain, you lose end-to-end visibility.

---

**Last Updated:** June 2025
**Author:** Yaswanth Reddy — Lead DevOps Engineer, Arealis Networks
