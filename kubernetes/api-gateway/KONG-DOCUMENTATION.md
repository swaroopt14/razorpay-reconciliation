# Kong API Gateway — Technical Documentation

## Overview

Kong API Gateway is the single entry point for all external traffic to the Arealis Zord platform. It runs in DB-less mode (no database required) on AWS EKS, handling routing, security, rate limiting, and observability for all 9 backend microservices.

---

## What is Kong?

Kong is an open-source API Gateway that sits between the internet and your backend services. Instead of exposing each service directly, all traffic flows through Kong, which handles:

- **Routing** — Directs requests to the correct backend service based on URL path
- **Rate Limiting** — Prevents abuse and protects services from overload
- **Security Headers** — Adds HSTS, X-Frame-Options, CSP headers automatically
- **CORS** — Handles cross-origin requests for browser-based clients
- **Request Correlation** — Adds unique X-Request-Id to every request for tracing
- **Metrics** — Exports Prometheus metrics for monitoring
- **Logging** — Audit logs for sensitive operations

---

## Architecture

```
Internet (Users / Postman / Mobile Apps)
    │
    ▼
AWS ALB (HTTPS termination, certificate: *.zordnet.com)
    │
    ▼
Kong Gateway (api-gateway namespace, 2-6 replicas)
    │
    ├── zordnet.com/                    → zord-console (Frontend UI)
    ├── api.zordnet.com/v1/admin        → zord-edge (Tenant registration)
    ├── api.zordnet.com/v1/bulk-ingest  → zord-edge (CSV/XLSX upload)
    ├── api.zordnet.com/v1/ingest       → zord-edge (Single payment)
    ├── api.zordnet.com/v1/webhooks     → zord-edge (PSP callbacks)
    ├── api.zordnet.com/v1/tenants      → zord-edge (Tenant management)
    ├── api.zordnet.com/v1/connectors   → zord-edge (PSP connectors)
    ├── api.zordnet.com/v1/auth         → zord-edge (Login/Signup)
    ├── api.zordnet.com/v1/intents      → zord-intent-engine (Payment intents)
    ├── api.zordnet.com/v1/dlq          → zord-intent-engine (Dead letter queue)
    ├── api.zordnet.com/v1/etl          → zord-intent-engine (ETL runs)
    ├── api.zordnet.com/v1/dispatch     → zord-relay (PSP dispatch)
    ├── api.zordnet.com/v1/settlement   → zord-outcome-engine (Settlement upload)
    ├── api.zordnet.com/v1/reconciliation → zord-outcome-engine (Recon results)
    ├── api.zordnet.com/v1/evidence     → zord-evidence (Evidence packs)
    ├── api.zordnet.com/v1/verify       → zord-evidence (Merkle verification)
    ├── api.zordnet.com/v1/projections  → zord-intelligence (Risk scores)
    ├── api.zordnet.com/v1/policies     → zord-intelligence (Policy rules)
    ├── api.zordnet.com/v1/rca          → zord-intelligence (Root cause analysis)
    ├── api.zordnet.com/v1/query        → zord-prompt-layer (AI copilot)
    └── api.zordnet.com/v1/chat         → zord-prompt-layer (AI chat)
```

---

## Features Implemented

### 1. Intelligent Path-Based Routing

Kong routes requests to the correct backend service based on the URL path. No port numbers needed — clients use a single domain.

| Path Pattern | Backend Service | Port |
|-------------|----------------|------|
| `/` (catch-all) | zord-console | 3000 |
| `/v1/admin`, `/v1/bulk-ingest`, `/v1/ingest`, `/v1/webhooks`, `/v1/tenants`, `/v1/connectors`, `/v1/auth` | zord-edge | 8080 |
| `/v1/intents`, `/v1/dlq`, `/v1/etl` | zord-intent-engine | 8083 |
| `/v1/dispatch` | zord-relay | 8082 |
| `/v1/settlement`, `/v1/reconciliation` | zord-outcome-engine | 8081 |
| `/v1/evidence`, `/v1/verify` | zord-evidence | 8088 |
| `/v1/projections`, `/v1/policies`, `/v1/rca` | zord-intelligence | 8089 |
| `/v1/query`, `/v1/chat` | zord-prompt-layer | 8086 |

### 2. Rate Limiting

Protects services from abuse and overload. Different limits for different operations.

| Route | Limit | Reason |
|-------|-------|--------|
| All routes (default) | 300 req/min, 10K/hour | General protection |
| `/v1/bulk-ingest` | 30 req/min, 500/hour | Heavy file processing (CSV/XLSX) |
| `/v1/settlement` | 20 req/min, 200/hour | Heavy XLSX parsing |
| `/v1/query` | 60 req/min, 1K/hour | Expensive LLM API calls (Gemini) |
| `/v1/chat` | 60 req/min, 1K/hour | Expensive LLM API calls (Gemini) |

When rate limit is exceeded, Kong returns:
```json
HTTP 429
{"message": "Rate limit exceeded. Please slow down."}
```

Response headers show remaining quota:
```
X-RateLimit-Limit-Minute: 300
X-RateLimit-Remaining-Minute: 287
```

### 3. CORS (Cross-Origin Resource Sharing)

Allows browser-based clients to call the API from approved domains.

**Allowed Origins:**
- `https://zordnet.com` (production)
- `https://www.zordnet.com` (production www)
- `http://localhost:3000` (local development)

**Allowed Headers:**
- `Authorization` (Bearer token)
- `Content-Type`
- `X-Zord-ADMIN-KEY` (admin operations)
- `X-Zord-Source-Type` (CSV/XLSX indicator)
- `X-Zord-Source-Class` (INTENT/SETTLEMENT)
- `X-Zord-Tenant-Type` (BANK/FINTECH)
- `X-Tenant-Id` (tenant scoping)
- `Batch-Id` (settlement batch)

### 4. Security Headers

Added to every response automatically:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS for 1 year |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `1; mode=block` | XSS filter |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leakage |

**Removed from responses:**
- `Server` header (hides Kong version)
- `X-Powered-By` header (hides technology)

### 5. Request Correlation (Tracing)

Every request gets a unique `X-Request-Id` header:
- Generated by Kong using `uuid#counter` format
- Echoed back in the response
- Use this ID to trace a request across all services in logs

### 6. Request Size Limiting

- Maximum request body: **50 MB**
- Protects against oversized uploads crashing services
- Returns `413 Payload Too Large` if exceeded

### 7. Audit Logging

Sensitive operations are logged to stdout (captured by Fluentd → Elasticsearch → Kibana):

**Logged routes:**
- `/v1/admin` — tenant registration, admin operations
- `/v1/bulk-ingest` — payment file uploads
- `/v1/settlement` — settlement file uploads

**Log format (JSON):**
```json
{
  "request": {"method": "POST", "uri": "/v1/bulk-ingest", "size": 1234567},
  "response": {"status": 200, "size": 456},
  "route": {"name": "edge-bulk-ingest"},
  "service": {"name": "zord-edge"},
  "latencies": {"proxy": 150, "kong": 5, "request": 155},
  "client_ip": "203.0.113.42",
  "started_at": 1716912000000
}
```

### 8. Prometheus Metrics

Kong exports metrics at `:8100/metrics` for Grafana dashboards:

- `kong_http_requests_total` — request count by route/status code
- `kong_request_latency_ms` — latency histograms (kong vs upstream)
- `kong_bandwidth_bytes` — traffic volume (ingress/egress)
- `kong_upstream_target_health` — backend service health

**Grafana Dashboard:** Import ID `7424` (Kong Official)

### 9. Auto-Scaling (HPA)

Kong automatically scales based on load:

| Metric | Threshold | Min Replicas | Max Replicas |
|--------|-----------|-------------|-------------|
| CPU | 70% | 2 | 6 |
| Memory | 80% | 2 | 6 |

Scale-up: immediate (0s stabilization)
Scale-down: gradual (300s stabilization, 25% per minute)

### 10. High Availability

- **2 replicas minimum** — always running
- **Pod Anti-Affinity** — replicas on different nodes
- **Topology Spread** — distributed across availability zones
- **PDB** — minimum 1 pod always available during disruptions
- **Rolling Updates** — zero-downtime deployments (maxUnavailable: 0)

---

## Configuration Mode

**DB-less (Declarative)**

Kong reads all configuration from a single YAML file (`kong.yaml`) mounted as a ConfigMap. No database needed.

Benefits:
- GitOps friendly — config is version controlled
- No extra infrastructure (no PostgreSQL for Kong)
- Fast startup — no DB migrations
- Immutable — config can't be changed at runtime (security)

Config file: `kubernetes/api-gateway/kong/configmap.yaml`

---

## Domains & DNS

| Domain | Purpose | Routes to |
|--------|---------|-----------|
| `zordnet.com` | Frontend website | Kong → zord-console |
| `www.zordnet.com` | Frontend (www) | Kong → zord-console |
| `api.zordnet.com` | API endpoints (Postman) | Kong → backend services |
| `kong-admin.zordnet.com` | Kong Admin Dashboard (Konga) | Kong Admin UI |

All domains share the same ALB. DNS records are CNAME pointing to the ALB address.

---

## Admin Dashboard (Konga)

**URL:** `https://kong-admin.zordnet.com`

Konga provides a visual interface to:
- View all configured routes and services
- See active plugins and their configuration
- Monitor Kong node health
- Inspect upstream targets

**First-time setup:**
1. Open `https://kong-admin.zordnet.com`
2. Create admin account
3. Add connection: Name = `zord-kong`, URL = `http://kong-gateway.api-gateway.svc.cluster.local:8001`
4. Activate the connection

---

## Technology Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| Kong Gateway | 3.9 (OSS) | API Gateway proxy |
| Konga | 0.14.9 | Admin dashboard UI |
| AWS ALB | — | Load balancer + TLS termination |
| ACM Certificate | *.zordnet.com | Wildcard TLS certificate |

---

## Security Model

```
Internet → HTTPS (TLS 1.2+) → ALB → HTTP → Kong → HTTP → Backend Services
```

- **TLS termination** at ALB level (ACM certificate)
- **Kong Admin API** (port 8001) is internal-only — never exposed to internet
- **Security headers** added to all responses
- **Rate limiting** prevents brute force and DDoS
- **CORS** restricts which domains can call the API
- **Request size limiting** prevents oversized payloads
- **Server header removed** — hides technology stack from attackers

---

## Performance Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Worker processes | 2 | Nginx workers per pod |
| Upstream keepalive pool | 60 | Reuse connections to backends |
| Upstream keepalive max requests | 100 | Max requests per connection |
| Upstream keepalive idle timeout | 60s | Close idle connections after 60s |
| Connect timeout | 10s | Max time to establish connection |
| Read timeout | 60-120s | Max time to wait for response |
| Write timeout | 60-120s | Max time to send request |
| Retries | 2-3 | Auto-retry on connection failure |

---

## Resource Allocation

| Component | CPU (request/limit) | Memory (request/limit) |
|-----------|-------------------|----------------------|
| Kong Gateway (per pod) | 250m / 1000m | 512Mi / 1Gi |
| Kong Admin UI (Konga) | 50m / 200m | 128Mi / 256Mi |

---

## Folder Structure

```
kubernetes/api-gateway/
├── kustomization.yaml              ← deploy entrypoint
├── namespace.yaml                  ← api-gateway namespace
├── README.md                       ← deployment guide
├── KONG-DOCUMENTATION.md           ← this file
├── kong/
│   ├── deployment.yaml             ← Kong 3.9 pods (DB-less mode)
│   ├── service.yaml                ← ClusterIP (proxy:80, admin:8001, metrics:8100)
│   ├── configmap.yaml              ← declarative config (all routes + plugins)
│   ├── hpa.yaml                    ← auto-scaling 2-6 replicas
│   └── pdb.yaml                    ← pod disruption budget
├── kong-admin-ui/
│   ├── deployment.yaml             ← Konga dashboard
│   ├── service.yaml                ← ClusterIP (port 1337)
│   └── secret.yaml                 ← admin credentials
├── ingress/
│   └── alb-ingress.yaml            ← ALB → Kong (4 domains)
├── routes/                         ← route documentation (per service)
│   ├── console-routes.yaml
│   ├── edge-routes.yaml
│   ├── intent-routes.yaml
│   ├── relay-routes.yaml
│   ├── outcome-routes.yaml
│   ├── evidence-routes.yaml
│   ├── intelligence-routes.yaml
│   └── prompt-layer-routes.yaml
└── plugins/                        ← plugin documentation
    ├── cors.yaml
    ├── jwt-auth.yaml
    ├── prometheus.yaml
    ├── rate-limiting.yaml
    └── request-logging.yaml
```

---

## Deploy Commands

```bash
# Deploy Kong API Gateway
kubectl apply -k kubernetes/api-gateway

# Verify
kubectl get pods -n api-gateway
kubectl get ingress -n api-gateway

# Check Kong health
kubectl run curl-test --rm -it --image=curlimages/curl -n api-gateway -- curl -s http://kong-gateway/status
```

---

## How to Make Changes

### Add a new route

1. Edit `kong/configmap.yaml` — add route under the appropriate service
2. Push to GitHub
3. Redeploy: `kubectl apply -k kubernetes/api-gateway`
4. Restart Kong: `kubectl rollout restart deployment/kong-gateway -n api-gateway`

### Change rate limits

1. Edit `kong/configmap.yaml` → plugins section → rate-limiting config
2. Push to GitHub
3. Redeploy and restart

### Add a new allowed CORS origin

1. Edit `kong/configmap.yaml` → plugins → cors → config.origins
2. Add the new domain (e.g., `https://staging.zordnet.com`)
3. Push to GitHub
4. Redeploy and restart

### Add a new backend service

1. Deploy the service in `zord` namespace
2. Add service + routes in `kong/configmap.yaml`
3. Create route documentation in `routes/` folder
4. Push to GitHub
5. Redeploy and restart

---

## Monitoring & Troubleshooting

### View Kong logs

```bash
kubectl logs -n api-gateway deploy/kong-gateway --tail=50
kubectl logs -n api-gateway deploy/kong-gateway -f  # live stream
```

### Check Kong status

```bash
kubectl run curl-test --rm -it --image=curlimages/curl -n api-gateway -- sh -c "
  echo '=== Status ===' && curl -s http://kong-gateway:8100/status
  echo '=== Routes ===' && curl -s http://kong-gateway:8001/routes | head -100
  echo '=== Services ===' && curl -s http://kong-gateway:8001/services | head -100
"
```

### Common issues

| Issue | Cause | Fix |
|-------|-------|-----|
| 404 Not Found | Path doesn't match any route | Check URL spelling, compare with configmap |
| 502 Bad Gateway | Backend service is down | Check pod status in `zord` namespace |
| 429 Too Many Requests | Rate limit exceeded | Wait 1 minute, or increase limit |
| 503 Service Unavailable | All backend pods unhealthy | Check service health, restart deployment |
| CORS error in browser | Origin not in allowed list | Add origin to configmap CORS plugin |

---

## Cost

| Component | Cost |
|-----------|------|
| Kong Gateway (open source) | **Free** |
| Konga Admin UI (open source) | **Free** |
| AWS ALB | ~$16/month + data transfer |
| Total Kong infrastructure | ~$16/month |

---

## Future Enhancements

- [ ] Enable JWT validation at gateway level (move auth from services to Kong)
- [ ] Add Redis for shared rate limiting counters (currently per-pod)
- [ ] Add IP whitelisting for admin routes
- [ ] Enable Kong's built-in circuit breaker for PSP endpoints
- [ ] Add request/response transformation for API versioning
- [ ] Integrate with AWS WAF for DDoS protection
- [ ] Add canary release support (traffic splitting between versions)
