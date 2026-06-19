# Redeployment Guide — Zero Downtime Production Deploys

> **Prerequisites:** Jenkins has built images, pushed to ECR, and committed updated image tags to GitHub.
> You are logged into the **Bastion EC2 server** and ready to deploy.

---

## Step 1: Pull Latest Code

```bash
cd ~/Arealis-Zord-intent
git pull
```

Verify the image tags updated in deployment YAMLs:

```bash
grep "image:" kubernetes/eks/services/*/deployment.yaml | sort
```

---

## Step 2: Deploy Application Services (Zero Downtime)

```bash
kubectl apply -k kubernetes/eks
```

This applies all changes. Rolling updates happen automatically:
- One pod goes down → new pod starts → second pod goes down → new pod starts
- **Users never see downtime** (at least 1 pod always serves traffic)

---

## Step 3: Watch the Rollout

```bash
# Watch all pods updating in real-time
kubectl get pods -n zord -w
```

Or check specific services:

```bash
kubectl rollout status deploy/zord-edge -n zord --timeout=120s
kubectl rollout status deploy/zord-intent-engine -n zord --timeout=120s
kubectl rollout status deploy/zord-token-enclave -n zord --timeout=120s
kubectl rollout status deploy/zord-relay -n zord --timeout=120s
kubectl rollout status deploy/zord-outcome-engine -n zord --timeout=120s
kubectl rollout status deploy/zord-evidence -n zord --timeout=120s
kubectl rollout status deploy/zord-intelligence -n zord --timeout=180s
kubectl rollout status deploy/zord-prompt-layer -n zord --timeout=120s
kubectl rollout status deploy/zord-console -n zord --timeout=120s
```

**Expected output:** `deployment "zord-xxx" successfully rolled out`

---

## Step 4: Verify All Pods Healthy

```bash
kubectl get pods -n zord
```

All should show `1/1 Running` with 0 restarts. If any show `CrashLoopBackOff`:

```bash
kubectl logs deploy/<service-name> -n zord --tail=20
```

---

## Step 5: Health Check (Production URL)

```bash
curl -s https://api.zordnet.com/edge/health
curl -s https://api.zordnet.com/intent/health
curl -s https://api.zordnet.com/outcome/health
curl -s https://api.zordnet.com/evidence/health
curl -s https://api.zordnet.com/intelligence/health
curl -s https://api.zordnet.com/prompt/health
curl -s https://api.zordnet.com/relay/health
curl -s https://api.zordnet.com/token/health
```

All should return HTTP 200 or 404 (both mean service is alive and Kong is routing).

---

## Step 6: Run Functional Tests

Trigger from Jenkins or run manually:

```bash
bash functional-tests/run-tests.sh https://api.zordnet.com zord123 functional-tests/results/manual
```

**Expected: 26/26 PASSED**

---

## Deploy Kong Changes

When routes, plugins, or rate limits change in `kong/configmap.yaml`:

```bash
git pull
kubectl apply -k kubernetes/api-gateway
```

Watch Kong pods update (one at a time, zero downtime):

```bash
kubectl rollout status deploy/kong-gateway -n api-gateway --timeout=60s
kubectl get pods -n api-gateway
```

Verify routing:

```bash
curl -s https://api.zordnet.com/edge/health
```

---

## Deploy Observability Changes (Brief Dashboard Downtime Only)

Observability services run 1 replica each (Grafana, Prometheus, Kibana, Jaeger).
During restart, dashboards are briefly unavailable (~10-30 seconds).
**This does NOT affect your users or application** — only internal monitoring UIs.

### Monitoring (Grafana + Prometheus)

```bash
git pull
kubectl apply -k kubernetes/monitoring

# Restart one at a time to minimize gap
kubectl rollout restart deploy/prometheus -n monitoring
kubectl rollout status deploy/prometheus -n monitoring --timeout=60s

kubectl rollout restart deploy/grafana -n monitoring
kubectl rollout status deploy/grafana -n monitoring --timeout=60s
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}" https://grafana.zordnet.com
# Should return 200 or 302
```

### Logging (Elasticsearch + Fluentd + Kibana)

```bash
kubectl apply -k kubernetes/logging

# Fluentd is a DaemonSet — it auto-updates node by node (no manual restart needed)
# Kibana restart:
kubectl rollout restart deploy/kibana -n logging
kubectl rollout status deploy/kibana -n logging --timeout=60s

# DO NOT restart Elasticsearch unless schema changed — it takes 2-3 min to recover
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}" https://kibana.zordnet.com
```

### Tracing (Jaeger + OTel Collector)

```bash
kubectl apply -k kubernetes/tracing

kubectl rollout restart deploy/otel-collector -n tracing
kubectl rollout status deploy/otel-collector -n tracing --timeout=60s

kubectl rollout restart deploy/jaeger -n tracing
kubectl rollout status deploy/jaeger -n tracing --timeout=60s
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}" https://jaeger.zordnet.com
```

> **Note:** During observability restarts, application metrics/logs/traces are buffered by the apps and sent once collectors are back. No data is lost.

---

## Deploy After AWS Secrets Manager Update

When a new secret key is added (e.g., new env var for a service):

```bash
git pull
kubectl apply -k kubernetes/eks

# Force External Secrets Operator to sync immediately
kubectl annotate externalsecret zord-app-secrets -n zord force-sync=$(date +%s) --overwrite

# Verify the new key exists
kubectl get secret zord-app-secrets -n zord -o json | python3 -c "import sys,json; keys=json.loads(sys.stdin.read())['data'].keys(); print(f'{len(keys)} keys:', sorted(keys))"

# Restart only the affected service(s)
kubectl rollout restart deploy/<affected-service> -n zord
kubectl rollout status deploy/<affected-service> -n zord --timeout=60s
```

---

## Rollback (If Something Goes Wrong)

### Rollback a single service

```bash
kubectl rollout undo deploy/zord-edge -n zord
kubectl rollout status deploy/zord-edge -n zord --timeout=60s
```

### Rollback all services

```bash
for svc in zord-edge zord-intent-engine zord-token-enclave zord-relay zord-outcome-engine zord-evidence zord-intelligence zord-prompt-layer zord-console; do
  kubectl rollout undo deploy/${svc} -n zord
done
```

### Rollback Kong

```bash
kubectl rollout undo deploy/kong-gateway -n api-gateway
kubectl rollout status deploy/kong-gateway -n api-gateway --timeout=60s
```

### Check rollout history

```bash
kubectl rollout history deploy/zord-edge -n zord
```

---

## Troubleshooting

### Pod stuck in CrashLoopBackOff

```bash
kubectl logs deploy/<service-name> -n zord --tail=30
```

Common causes:
- Kafka not ready → restart the service: `kubectl rollout restart deploy/<service> -n zord`
- Missing secret key → check: `kubectl get externalsecret -n zord`
- DB connection failed → check Postgres: `kubectl get pod zord-postgres-0 -n zord`

### Pods stuck in Pending

```bash
kubectl describe pod <pod-name> -n zord | tail -10
```

Common causes:
- Insufficient memory/CPU → autoscaler will add nodes (wait 2-3 min)
- If autoscaler stuck: `kubectl get nodes` — check if new nodes are joining

### Kafka consumer lag after deploy

```bash
kubectl exec -it statefulset/zord-kafka -n zord -- kafka-consumer-groups --bootstrap-server zord-kafka:9092 --describe --all-groups
```

If LAG > 0, services are catching up. Wait or restart:

```bash
kubectl rollout restart deploy/zord-intent-engine -n zord
```

### Kong returning 502

Backend service is down. Check which service:

```bash
kubectl get pods -n zord | grep -v Running
```

Then restart it:

```bash
kubectl rollout restart deploy/<crashed-service> -n zord
```

---

## Quick Reference — Full Redeploy (Copy-Paste)

```bash
# Pull
cd ~/Arealis-Zord-intent && git pull

# Deploy
kubectl apply -k kubernetes/eks
kubectl apply -k kubernetes/api-gateway

# Watch
kubectl get pods -n zord -w

# Verify
kubectl get pods -n zord
kubectl get pods -n api-gateway
curl -s https://api.zordnet.com/edge/health

# Test
bash functional-tests/run-tests.sh https://api.zordnet.com zord123 functional-tests/results/$(date +%s)
```

---

## How Zero Downtime Works

Every service runs **2 replicas** with `maxUnavailable: 1, maxSurge: 0`:

```
Pod A: serving traffic ✅
Pod B: killed → new version starts → becomes healthy → serves traffic ✅
Pod A: killed → new version starts → becomes healthy → serves traffic ✅
```

At every moment, at least 1 pod is alive. Users never see errors.

Infrastructure pods (Kafka, Postgres, Redis) have `priorityClassName: infra-critical` — they are **never evicted** during deploys.

---

**Last Updated:** June 2025
**Author:** Yaswanth Reddy — Lead DevOps Engineer, Arealis Networks
