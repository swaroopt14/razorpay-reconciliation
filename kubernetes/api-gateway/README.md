# Kong API Gateway — Deployment Guide

This deploys Kong API Gateway in DB-less mode to the `api-gateway` namespace on EKS.

---

## Architecture

```
Internet → AWS ALB (HTTPS:443) → Kong Gateway (api-gateway namespace)
                                       │
                                       ├── /              → zord-console:3000
                                       ├── /v1/admin      → zord-edge:8080
                                       ├── /v1/bulk-ingest→ zord-edge:8080
                                       ├── /v1/ingest     → zord-edge:8080
                                       ├── /v1/webhooks   → zord-edge:8080
                                       ├── /v1/tenants    → zord-edge:8080
                                       ├── /v1/connectors → zord-edge:8080
                                       ├── /v1/auth       → zord-edge:8080
                                       ├── /v1/intents    → zord-intent-engine:8083
                                       ├── /v1/dlq        → zord-intent-engine:8083
                                       ├── /v1/etl        → zord-intent-engine:8083
                                       ├── /v1/dispatch   → zord-relay:8082
                                       ├── /v1/settlement → zord-outcome-engine:8081
                                       ├── /v1/reconciliation → zord-outcome-engine:8081
                                       ├── /v1/evidence   → zord-evidence:8088
                                       ├── /v1/verify     → zord-evidence:8088
                                       ├── /v1/projections→ zord-intelligence:8089
                                       ├── /v1/policies   → zord-intelligence:8089
                                       ├── /v1/rca        → zord-intelligence:8089
                                       ├── /v1/query      → zord-prompt-layer:8086
                                       └── /v1/chat       → zord-prompt-layer:8086
```

---

## Prerequisites

Before deploying Kong, ensure:

1. EKS cluster is running with all nodes Ready
2. AWS Load Balancer Controller is installed
3. All zord services are deployed in the `zord` namespace
4. ACM certificate exists for your domain

---

## Deploy

```bash
# Step 1: Deploy Kong API Gateway
kubectl apply -k kubernetes/api-gateway

# Step 2: Wait for pods to be ready
kubectl get pods -n api-gateway -w

# Expected output:
# kong-gateway-xxx   1/1   Running
# kong-gateway-yyy   1/1   Running
```

---

## Verify

```bash
# Check pods
kubectl get pods -n api-gateway

# Check service
kubectl get svc -n api-gateway

# Check ingress (ALB creation)
kubectl get ingress -n api-gateway

# Check HPA
kubectl get hpa -n api-gateway

# Test Kong health
kubectl port-forward -n api-gateway svc/kong-gateway 8100:8100 &
curl http://localhost:8100/status
pkill -f "port-forward"

# Test routing through Kong
kubectl port-forward -n api-gateway svc/kong-gateway 8000:80 &
curl http://localhost:8000/edge/health
curl http://localhost:8000/v1/admin/tenantReg -H "X-Zord-ADMIN-KEY: zord123"
pkill -f "port-forward"
```

---

## How It Works

### DB-less Mode

Kong runs without a database. All configuration (routes, services, plugins) is defined in a single declarative YAML file mounted as a ConfigMap.

- Config file: `kong/configmap.yaml` → mounted at `/etc/kong/kong.yaml`
- No PostgreSQL or Cassandra needed
- GitOps friendly — config changes are just YAML edits
- Reload: `kubectl rollout restart deployment/kong-gateway -n api-gateway`

### Traffic Flow

1. Client sends request to `https://zordnet.com/v1/bulk-ingest`
2. AWS ALB terminates TLS, forwards to Kong pod (port 80)
3. Kong matches the path `/v1/bulk-ingest` → route `edge-bulk-ingest`
4. Kong applies plugins: CORS, rate-limit (30/min), security headers, correlation-id, file-log
5. Kong forwards to `http://zord-edge.zord.svc.cluster.local:8080/v1/bulk-ingest`
6. zord-edge processes the request and responds
7. Kong adds response headers and returns to client

### Cross-Namespace Communication

Kong runs in `api-gateway` namespace but routes to services in `zord` namespace using fully qualified DNS:

```
http://<service-name>.zord.svc.cluster.local:<port>
```

This works by default in Kubernetes — no NetworkPolicy changes needed.

---

## Plugins Enabled

| Plugin | Scope | Purpose |
|--------|-------|---------|
| cors | Global | Cross-origin headers for browser requests |
| rate-limiting | Global + per-route | Prevent abuse (300/min global, stricter for heavy routes) |
| prometheus | Global | Metrics at :8100/metrics |
| correlation-id | Global | X-Request-Id header for tracing |
| request-size-limiting | Global | Max 50MB request body |
| response-transformer | Global | Security headers (HSTS, X-Frame-Options, etc.) |
| file-log | Admin, Ingest, Settlement | Audit logging for sensitive operations |

---

## Rate Limits

| Route | Limit | Reason |
|-------|-------|--------|
| All routes (default) | 300/min, 10K/hour | General protection |
| /v1/bulk-ingest | 30/min, 500/hour | Heavy file processing |
| /v1/settlement | 20/min, 200/hour | Heavy XLSX parsing |
| /v1/query | 60/min, 1K/hour | Expensive LLM calls |
| /v1/chat | 60/min, 1K/hour | Expensive LLM calls |

---

## Configuration Changes

### Add a new route

1. Edit `kong/configmap.yaml`
2. Add a new entry under `services[].routes[]`
3. Redeploy: `kubectl apply -k kubernetes/api-gateway`
4. Restart Kong: `kubectl rollout restart deployment/kong-gateway -n api-gateway`

### Change rate limits

1. Edit `kong/configmap.yaml` → `plugins` section
2. Modify the `rate-limiting` plugin config for the target route
3. Redeploy and restart

### Add a new origin (CORS)

1. Edit `kong/configmap.yaml` → `plugins` → `cors` → `config.origins`
2. Add the new domain
3. Redeploy and restart

---

## Monitoring

### Prometheus Metrics

Kong exposes metrics at `:8100/metrics`. If the monitoring stack is deployed:

```bash
# Port-forward to see metrics
kubectl port-forward -n api-gateway svc/kong-gateway 8100:8100 &
curl http://localhost:8100/metrics
```

Key metrics:
- `kong_http_requests_total` — request count by route/status
- `kong_request_latency_ms` — latency histograms
- `kong_bandwidth_bytes` — traffic volume

### Grafana Dashboard

Import Kong's official dashboard: ID `7424`

### Logs

```bash
# Kong proxy logs
kubectl logs -n api-gateway deploy/kong-gateway --tail=50

# Follow logs
kubectl logs -n api-gateway deploy/kong-gateway -f
```

---

## Troubleshooting

### Kong pods not starting

```bash
kubectl describe pod -n api-gateway -l app.kubernetes.io/name=kong-gateway
kubectl logs -n api-gateway deploy/kong-gateway --tail=30
```

Common causes:
- Invalid kong.yaml syntax → check ConfigMap
- Port conflict → check no other service uses 8000/8443/8001/8100

### Routes not working (404)

```bash
# Check Kong's loaded config
kubectl exec -n api-gateway deploy/kong-gateway -- kong config parse /etc/kong/kong.yaml
```

Common causes:
- Path mismatch (check exact path in configmap)
- Service DNS wrong (must use `.zord.svc.cluster.local`)

### ALB not created

```bash
kubectl describe ingress kong-public -n api-gateway
```

Common causes:
- AWS Load Balancer Controller not installed
- ACM certificate ARN invalid
- Subnet tags missing

### 502 Bad Gateway

```bash
kubectl logs -n api-gateway deploy/kong-gateway --tail=20
```

Common causes:
- Backend service not running in `zord` namespace
- Wrong port in configmap
- Service name typo

### Rate limit too aggressive

Increase limits in `kong/configmap.yaml` → redeploy → restart.

---

## Folder Structure

```
kubernetes/api-gateway/
├── kustomization.yaml          ← deploy entrypoint
├── namespace.yaml              ← api-gateway namespace
├── README.md                   ← this file
├── kong/
│   ├── deployment.yaml         ← Kong pods (2 replicas, DB-less)
│   ├── service.yaml            ← ClusterIP (proxy:80, admin:8001, metrics:8100)
│   ├── configmap.yaml          ← declarative config (routes + plugins)
│   ├── hpa.yaml                ← auto-scale 2-6 replicas at 70% CPU
│   └── pdb.yaml                ← min 1 pod available during disruptions
├── ingress/
│   └── alb-ingress.yaml        ← ALB → Kong (internet entry point)
├── routes/                     ← documentation only (actual config in configmap)
│   ├── console-routes.yaml
│   ├── edge-routes.yaml
│   ├── intent-routes.yaml
│   ├── relay-routes.yaml
│   ├── outcome-routes.yaml
│   ├── evidence-routes.yaml
│   ├── intelligence-routes.yaml
│   └── prompt-layer-routes.yaml
└── plugins/                    ← documentation only (actual config in configmap)
    ├── cors.yaml
    ├── jwt-auth.yaml
    ├── prometheus.yaml
    ├── rate-limiting.yaml
    └── request-logging.yaml
```

---

## DNS Setup

After deploying, get the ALB DNS name:

```bash
kubectl get ingress -n api-gateway
```

Copy the ALB address and create DNS records:

| Record | Type | Value |
|--------|------|-------|
| zordnet.com | CNAME | k8s-apigate-kongpubl-xxx.ap-south-1.elb.amazonaws.com |
| www.zordnet.com | CNAME | (same ALB) |
| api.zordnet.com | CNAME | (same ALB) |
| kong-admin.zordnet.com | CNAME | (same ALB) |

---

## Kong Admin Dashboard (Konga) — First-Time Setup

After deploying and DNS is configured, open:

```
https://kong-admin.zordnet.com
```

### Step 1: Create Admin Account

On first visit, Konga asks you to create an admin account:
- **Username:** choose any (e.g., `admin`)
- **Email:** your email
- **Password:** choose a strong password

### Step 2: Create Kong Connection

After login, you'll see the "Welcome" page asking to set up a connection:

1. Keep **DEFAULT** tab selected
2. Fill in:
   - **Name:** `zord-kong`
   - **Kong Admin URL:** `http://kong-gateway.api-gateway.svc.cluster.local:8001`
3. Click **CREATE CONNECTION**

### Step 3: Activate Connection

Click the **Activate** button next to `zord-kong`.

### Step 4: Explore

You'll now see the full dashboard with:
- **Dashboard** — Kong node info, status
- **Services** — All 9 backend services
- **Routes** — All 26 routes configured
- **Plugins** — All active plugins (CORS, rate-limiting, etc.)
- **Consumers** — (empty — auth handled by services)

---

## Rollback to Direct ALB (bypass Kong)

If Kong has issues and you need to restore direct routing:

1. Uncomment the Ingress in `kubernetes/eks/ingress/public-alb.yaml`
2. Add it back to `kubernetes/eks/kustomization.yaml`:
   ```yaml
   - ingress/public-alb.yaml
   ```
3. Deploy: `kubectl apply -k kubernetes/eks`
4. Delete Kong: `kubectl delete -k kubernetes/api-gateway`

---

## Resource Allocation

| Component | CPU (req/limit) | Memory (req/limit) | Replicas |
|-----------|----------------|-------------------|----------|
| Kong Gateway | 250m / 1000m | 512Mi / 1Gi | 2-6 (HPA) |

---

## Security Notes

- Kong admin API (port 8001) is only accessible within the cluster (ClusterIP)
- No admin API is exposed through the ALB
- Security headers added to all responses (HSTS, X-Frame-Options, etc.)
- Server/X-Powered-By headers are stripped from responses
- Request body limited to 50MB
- Rate limiting prevents brute force and DDoS
