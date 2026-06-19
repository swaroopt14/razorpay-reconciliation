# EKS Deployment End-to-End Testing Guide

This guide helps you test the full Arealis Zord deployment after applying the Kubernetes manifests to EKS.

Read this like a checklist. Do not jump to the browser first. First check cluster, then pods, then secrets, then Kong, then frontend, then backend flow.

---

## What We Are Testing

Your production access model (with Kong API Gateway):

```
Public internet
  → https://zordnet.com          → Kong → zord-console (frontend UI)
  → https://api.zordnet.com      → Kong → backend services (API)
  → https://kong-admin.zordnet.com → Kong Admin Dashboard
  → https://grafana.zordnet.com  → Grafana (metrics)
  → https://kibana.zordnet.com   → Kibana (logs)
  → https://jaeger.zordnet.com   → Jaeger (traces)
```

Traffic flow:

```
Browser → ALB → Kong (api-gateway namespace) → Backend Services (zord namespace)
```

Kong routes by URL path:
- `/` → zord-console (port 3000)
- `/v1/admin`, `/v1/bulk-ingest`, `/v1/ingest`, `/v1/webhooks`, `/v1/tenants`, `/v1/connectors`, `/v1/auth` → zord-edge (port 8080)
- `/v1/intents`, `/v1/dlq`, `/v1/etl` → zord-intent-engine (port 8083)
- `/v1/dispatch` → zord-relay (port 8082)
- `/v1/settlement`, `/v1/reconciliation` → zord-outcome-engine (port 8081)
- `/v1/evidence`, `/v1/verify` → zord-evidence (port 8088)
- `/v1/projections`, `/v1/policies`, `/v1/rca` → zord-intelligence (port 8089)
- `/v1/query`, `/v1/chat` → zord-prompt-layer (port 8086)

---

## Before You Start

You need these installed on your laptop or admin machine:

- `aws` CLI
- `kubectl`
- Access to AWS account `522189039032`
- Access to the EKS cluster

You also need these already completed:

- Docker images pushed to ECR (Jenkins handles this)
- AWS Secrets Manager secrets created (Terraform handles this)
- External Secrets Operator installed in cluster
- AWS Load Balancer Controller installed in cluster
- metrics-server installed in cluster
- EBS CSI Driver installed in cluster
- ACM certificate for `*.zordnet.com` (wildcard) created
- DNS records pointing to ALBs

---

## Step 1: Confirm You Are Connected To EKS

```bash
kubectl config current-context
```

Expected:

```text
arn:aws:eks:ap-south-1:522189039032:cluster/<cluster-name>
```

Bad result:

```text
docker-desktop
```

If you see `docker-desktop`, connect to EKS first:

```bash
aws eks update-kubeconfig --region ap-south-1 --name <your-cluster-name>
```

Then verify nodes:

```bash
kubectl get nodes
```

All nodes must show `Ready`. Do NOT continue if nodes are not ready.

---

## Step 2: Check Required Cluster Add-ons

Run all 5 checks. ALL must pass before testing:

```bash
# 1. External Secrets Operator
kubectl get pods -n external-secrets
# Must show running pods

# 2. metrics-server
kubectl get pods -n kube-system | grep metrics-server
# Must show running pod

# 3. AWS Load Balancer Controller
kubectl get deployment -A | grep aws-load-balancer
# Must show a deployment

# 4. EBS CSI Driver
kubectl get pods -n kube-system | grep ebs
# Must show running pods

# 5. StorageClass (must have default)
kubectl get storageclass
# Must show gp2 (default)
```

If any are missing, fix them before continuing.

---

## Step 3: Check All Pods Are Running

### Application Services (zord namespace)

```bash
kubectl get pods -n zord
```

Expected — ALL pods should be `Running` or `Completed`:

```text
NAME                                   READY   STATUS
zord-postgres-0                        1/1     Running
zord-kafka-0                           1/1     Running
zord-kafka-topics-xxxxx                0/1     Completed
zord-console-xxxxx                     1/1     Running
zord-console-yyyyy                     1/1     Running
zord-edge-xxxxx                        1/1     Running
zord-edge-yyyyy                        1/1     Running
zord-intent-engine-xxxxx               1/1     Running
zord-intent-engine-yyyyy               1/1     Running
zord-token-enclave-xxxxx               1/1     Running
zord-token-enclave-yyyyy               1/1     Running
zord-relay-xxxxx                       1/1     Running
zord-relay-yyyyy                       1/1     Running
zord-outcome-engine-xxxxx              1/1     Running
zord-outcome-engine-yyyyy              1/1     Running
zord-evidence-xxxxx                    1/1     Running
zord-evidence-yyyyy                    1/1     Running
zord-intelligence-xxxxx                1/1     Running
zord-intelligence-yyyyy                1/1     Running
zord-prompt-layer-xxxxx                1/1     Running
zord-prompt-layer-yyyyy                1/1     Running
```

### Kong API Gateway (api-gateway namespace)

```bash
kubectl get pods -n api-gateway
```

Expected:

```text
NAME                              READY   STATUS
kong-gateway-xxxxx                1/1     Running
kong-gateway-yyyyy                1/1     Running
kong-admin-ui-xxxxx               1/1     Running
```

### Observability (if deployed)

```bash
kubectl get pods -n monitoring
kubectl get pods -n logging
kubectl get pods -n tracing
```

If any pod is NOT Running:

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace> --tail=30
```

---

## Step 4: Check Secrets Are Synced

```bash
kubectl get externalsecret -n zord
```

Expected:

```text
NAME                    STATUS         READY
zord-app-secrets        SecretSynced   True
zord-edge-signing-key   SecretSynced   True
```

Verify secrets exist:

```bash
kubectl get secret zord-app-secrets -n zord
kubectl get secret zord-edge-signing-key -n zord
```

If `STATUS` is not `SecretSynced`:

```bash
kubectl describe externalsecret zord-app-secrets -n zord
```

---

## Step 5: Check Service Account IAM Role

```bash
kubectl describe serviceaccount zord-aws-access -n zord
```

Expected annotation:

```text
eks.amazonaws.com/role-arn: arn:aws:iam::522189039032:role/ZordAppS3AccessRole
```

If missing, S3 operations will fail.

---

## Step 6: Check Services

```bash
kubectl get svc -n zord
kubectl get svc -n api-gateway
```

All services in `zord` namespace should be `ClusterIP` (private).
Kong service in `api-gateway` should be `ClusterIP` (ALB routes to it via Ingress).

---

## Step 7: Check Ingress and ALBs

### Main ALB (Kong — handles app traffic)

```bash
kubectl get ingress -n api-gateway
```

Expected:

```text
NAME          CLASS   HOSTS                                                    ADDRESS                                    PORTS
kong-public   alb     zordnet.com,www.zordnet.com,api.zordnet.com,...          k8s-apigate-xxx.ap-south-1.elb.amazonaws.com   80, 443
```

### Observability ALB (shared by Grafana, Kibana, Jaeger)

```bash
kubectl get ingress -n monitoring
kubectl get ingress -n logging
kubectl get ingress -n tracing
```

Expected (all share same ALB address):

```text
NAME              CLASS   HOSTS                  ADDRESS
grafana-public    alb     grafana.zordnet.com    k8s-zordobse-xxx.ap-south-1.elb.amazonaws.com
kibana-public     alb     kibana.zordnet.com     k8s-zordobse-xxx.ap-south-1.elb.amazonaws.com
jaeger-public     alb     jaeger.zordnet.com     k8s-zordobse-xxx.ap-south-1.elb.amazonaws.com
```

If ADDRESS is empty:

```bash
kubectl describe ingress kong-public -n api-gateway
```

---

## Step 8: Check HPA

```bash
kubectl get hpa -n zord
kubectl get hpa -n api-gateway
```

TARGETS should show actual percentages (e.g., `5%/70%`), NOT `<unknown>/70%`.

---

## Step 9: Check PDB

```bash
kubectl get pdb -n zord
kubectl get pdb -n api-gateway
```

All services should have PDB with `ALLOWED DISRUPTIONS >= 1`.

---

## Step 10: Test Postgres

```bash
kubectl exec -n zord zord-postgres-0 -- pg_isready -U postgres
```

Expected: `accepting connections`

Check all databases exist:

```bash
kubectl exec -n zord zord-postgres-0 -- psql -U postgres -c "\l"
```

Expected: 7 databases (zord_edge_db, zord_intent_engine_db, zord_relay_db, zord_token_enclave_db, zord_outcome_db, zord_evidence_db, zord_intelligence)

---

## Step 11: Test Kafka

```bash
kubectl exec -n zord zord-kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --list
```

Expected — 28+ topics listed.

---

## Step 12: Test Kong Health (From Inside Cluster)

```bash
kubectl run curl-test -n api-gateway --rm -it --image=curlimages/curl -- sh
```

Inside the pod:

```sh
# Kong status
curl -s http://kong-gateway:8100/status

# Kong admin API — list routes
curl -s http://kong-gateway:8001/routes | head -50

# Kong admin API — list services
curl -s http://kong-gateway:8001/services | head -50
```

Exit:

```sh
exit
```

---

## Step 13: Test All Backend Health Endpoints (Through Kong)

From your local machine (Postman or curl):

```bash
# Health checks through Kong (no auth required)
curl -s https://api.zordnet.com/edge/health
curl -s https://api.zordnet.com/intent/health
curl -s https://api.zordnet.com/relay/health
curl -s https://api.zordnet.com/outcome/health
curl -s https://api.zordnet.com/evidence/health
curl -s https://api.zordnet.com/intelligence/health
curl -s https://api.zordnet.com/prompt/health
curl -s https://api.zordnet.com/token/health
```

ALL should return a JSON health response.

---

## Step 14: Test Frontend (Public Access)

### Browser Test

Open: `https://zordnet.com`

Expected:
- Page loads without errors
- No browser certificate warning
- Login or console UI appears

### Check No Backend Leaks

Open browser DevTools (F12) → Network tab. Navigate the app.

All API calls should go to:
- `https://zordnet.com/api/...` (Next.js API routes)

NO calls should go to internal URLs like `http://zord-edge:8080/...`

---

## Step 15: Test Full API Flow (From Postman)

### 15.1 Register a Tenant

```
POST https://api.zordnet.com/v1/admin/tenantReg

Headers:
  X-Zord-ADMIN-KEY: zord123
  Content-Type: application/json

Body:
{
  "name": "TestCompany"
}
```

Expected: JSON with APIKEY and TenantId

### 15.2 Bulk Ingest (CSV Upload)

```
POST https://api.zordnet.com/v1/bulk-ingest

Headers:
  Authorization: Bearer <APIKEY from step 15.1>
  X-Zord-Source-Type: CSV
  X-Zord-Source-Class: INTENT
  X-Zord-Tenant-Type: BANK

Body (form-data):
  file: (attach CSV file)
```

CSV format:
```csv
tenant_id,amount,currency,beneficiary_name,beneficiary_account,beneficiary_ifsc,purpose
testcompany,50000,INR,John Doe,1234567890,HDFC0001234,salary
```

Expected: JSON with EnvelopeIDs and Status "Accepted"

### 15.3 Check Intents Created

```
GET https://api.zordnet.com/v1/intents?tenant_id=<TenantId>&limit=10

Headers:
  Authorization: Bearer <APIKEY>
```

### 15.4 Upload Settlement

```
POST https://api.zordnet.com/v1/settlement/upload?tenant_id=<TenantId>&psp=razorpay

Headers:
  Batch-Id: 12345

Body (form-data):
  file: (attach .xlsx file)
```

### 15.5 Check Reconciliation

```
GET https://api.zordnet.com/v1/reconciliation?tenant_id=<TenantId>

Headers:
  Authorization: Bearer <APIKEY>
```

### 15.6 Check Evidence Packs

```
GET https://api.zordnet.com/v1/evidence?tenant_id=<TenantId>

Headers:
  Authorization: Bearer <APIKEY>
```

### 15.7 AI Copilot Query

```
POST https://api.zordnet.com/v1/query

Headers:
  Content-Type: application/json
  X-Tenant-Id: <TenantId>
  Authorization: Bearer <APIKEY>

Body:
{
  "query": "show me recent payout risk"
}
```

---

## Step 16: Test Kong Rate Limiting

```bash
# Send 35 requests quickly to bulk-ingest (limit is 30/min)
for i in $(seq 1 35); do
  echo "Request $i:"
  curl -s -o /dev/null -w "%{http_code}" https://api.zordnet.com/v1/bulk-ingest
  echo ""
done
```

Expected: First 30 return `401` (no auth), request 31+ return `429` (rate limited).

Check rate limit headers in response:

```bash
curl -v https://api.zordnet.com/v1/bulk-ingest 2>&1 | grep -i "x-ratelimit"
```

---

## Step 17: Test Kong Admin UI

Open: `https://kong-admin.zordnet.com`

Login:
- Username: admin
- Password: (from `kubernetes/api-gateway/kong-admin-ui/secret.yaml`)

Expected: Dashboard showing all routes, services, and plugins.

---

## Step 18: Test Observability UIs

### Grafana

Open: `https://grafana.zordnet.com`

Login:
- Username: admin
- Password: (from `kubernetes/monitoring/grafana/secret.yaml`)

Expected: Grafana dashboard. Import Kong dashboard (ID 7424).

### Kibana

Open: `https://kibana.zordnet.com`

Login:
- Username: elastic
- Password: (from `kubernetes/logging/kibana/secret.yaml`)

Expected: Kibana UI. Create index pattern `zord-logs-*`.

### Jaeger

Open: `https://jaeger.zordnet.com`

Login:
- Username: admin
- Password: (from `kubernetes/tracing/jaeger/secret.yaml`)

Expected: Jaeger trace search UI.

---

## Step 19: Test S3 Access

```bash
kubectl logs -n zord deploy/zord-edge --tail=50 | grep -i "s3\|access denied"
kubectl logs -n zord deploy/zord-evidence --tail=50 | grep -i "s3\|access denied"
```

If you see `Access Denied`:
- Check: `kubectl describe sa zord-aws-access -n zord`
- Verify IAM role trust policy has correct OIDC provider
- Verify IAM policy has correct bucket ARNs

---

## Step 20: Verify Security

```bash
# No service should be type LoadBalancer in zord namespace
kubectl get svc -n zord | grep LoadBalancer
# Expected: empty (no results)

# Kong admin API should NOT be accessible from internet
curl -s https://api.zordnet.com:8001/routes
# Expected: connection refused or 404 (not Kong admin response)

# Backend services should NOT be directly accessible
curl -s https://zordnet.com:8080/health
# Expected: connection refused
```

---

## Step 21: Final Success Checklist

```bash
echo "=== Nodes ===" && kubectl get nodes
echo "=== App Pods ===" && kubectl get pods -n zord
echo "=== Kong Pods ===" && kubectl get pods -n api-gateway
echo "=== Secrets ===" && kubectl get externalsecret -n zord
echo "=== App Services ===" && kubectl get svc -n zord
echo "=== Kong Services ===" && kubectl get svc -n api-gateway
echo "=== Ingress (Kong) ===" && kubectl get ingress -n api-gateway
echo "=== Ingress (Observability) ===" && kubectl get ingress -n monitoring -n logging -n tracing
echo "=== HPA ===" && kubectl get hpa -n zord && kubectl get hpa -n api-gateway
echo "=== PDB ===" && kubectl get pdb -n zord && kubectl get pdb -n api-gateway
```

Deployment is healthy when ALL of these are true:

- [ ] All nodes are `Ready`
- [ ] All pods in `zord` namespace are `Running` (or `Completed` for jobs)
- [ ] All pods in `api-gateway` namespace are `Running`
- [ ] Both ExternalSecrets show `SecretSynced` / `True`
- [ ] `zord-app-secrets` and `zord-edge-signing-key` secrets exist
- [ ] `zord-aws-access` service account has IAM role annotation
- [ ] Kong Ingress shows ALB address
- [ ] `https://zordnet.com` opens in browser (frontend)
- [ ] `https://api.zordnet.com/edge/health` responds (Kong routing)
- [ ] All 8 backend health endpoints respond through Kong
- [ ] Kafka has 28+ topics created
- [ ] HPA targets show actual percentages (not `<unknown>`)
- [ ] No service is type `LoadBalancer` in zord namespace
- [ ] No S3 access denied errors in logs
- [ ] Kong rate limiting works (429 after limit exceeded)
- [ ] Kong Admin UI accessible at `https://kong-admin.zordnet.com`
- [ ] Grafana accessible at `https://grafana.zordnet.com` (if deployed)
- [ ] Kibana accessible at `https://kibana.zordnet.com` (if deployed)
- [ ] Jaeger accessible at `https://jaeger.zordnet.com` (if deployed)

---

## Quick Test (Short Version)

```bash
# Cluster health
kubectl get pods -n zord
kubectl get pods -n api-gateway
kubectl get externalsecret -n zord
kubectl get ingress -n api-gateway

# Kong routing
curl -s https://api.zordnet.com/edge/health
curl -s https://api.zordnet.com/intent/health

# Frontend
curl -s https://zordnet.com/api/health

# Kafka
kubectl exec -n zord zord-kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --list
```

Then open `https://zordnet.com` in browser.

---

## Viewing Logs

### Option 1: Kibana (Recommended — persistent, searchable)

Open `https://kibana.zordnet.com` → Discover → Select `zord-logs-*`

Useful filters:
- `service: "zord-edge"` — show only edge logs
- `namespace: "zord"` — show only app logs
- `namespace: "api-gateway"` — show only Kong logs
- `stream: "stderr"` — show only errors

### Option 2: kubectl (quick, real-time)

```bash
# Live streaming logs
kubectl logs -n zord deploy/zord-edge -f
kubectl logs -n zord deploy/zord-intent-engine -f
kubectl logs -n zord deploy/zord-relay -f
kubectl logs -n api-gateway deploy/kong-gateway -f

# Last N lines
kubectl logs -n zord deploy/zord-edge --tail=50

# Both replicas of a service
kubectl logs -n zord -l app.kubernetes.io/name=zord-edge --tail=20

# Previous crashed pod logs
kubectl logs -n zord deploy/zord-intelligence --previous

# All services quick check
for svc in zord-edge zord-intent-engine zord-token-enclave zord-relay zord-outcome-engine zord-evidence zord-intelligence zord-prompt-layer zord-console; do
  echo "=== $svc ==="
  kubectl logs -n zord deploy/$svc --tail=5
  echo ""
done
```

---

## DNS Records Summary

| Domain | Points to | Purpose |
|--------|-----------|---------|
| `zordnet.com` | Kong ALB | Frontend + API |
| `www.zordnet.com` | Kong ALB | Frontend (www) |
| `api.zordnet.com` | Kong ALB | API (Postman testing) |
| `kong-admin.zordnet.com` | Kong ALB | Kong Admin Dashboard |
| `grafana.zordnet.com` | Observability ALB | Metrics dashboards |
| `kibana.zordnet.com` | Observability ALB | Log search |
| `jaeger.zordnet.com` | Observability ALB | Trace viewer |

---

## Deploy Order

```bash
# 1. Application services
kubectl apply -k kubernetes/eks
sleep 120
kubectl rollout restart deployment zord-relay zord-intent-engine zord-token-enclave zord-intelligence zord-outcome-engine -n zord

# 2. Kong API Gateway
kubectl apply -k kubernetes/api-gateway

# 3. Observability (optional — deploy anytime)
kubectl apply -k kubernetes/monitoring
kubectl apply -k kubernetes/logging
kubectl apply -k kubernetes/tracing
```

---

## Troubleshooting Reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| Pod `Pending` | No StorageClass or EBS CSI missing | `kubectl get storageclass`, install EBS CSI |
| Pod `ImagePullBackOff` | Image not in ECR or wrong tag | Push image, verify tag |
| Pod `CreateContainerConfigError` | Missing secret key | `kubectl describe pod`, check secret keys |
| Pod `CrashLoopBackOff` | App crash (DB/Kafka unreachable) | `kubectl logs <pod>`, wait for Kafka |
| Kong 502 Bad Gateway | Backend service not running | Check pod status in `zord` namespace |
| Kong 404 Not Found | Path doesn't match any route | Check URL spelling, compare with configmap |
| Kong 429 Too Many Requests | Rate limit exceeded | Wait 1 minute, or increase limit in configmap |
| ALB not created | LB Controller missing or bad cert | Check controller + certificate ARN |
| S3 Access Denied | IRSA not configured | Check SA annotation + IAM role |
| HPA `<unknown>` | metrics-server missing | Install metrics-server |
| Kafka OOM (exit 137) | Not enough memory | Already fixed: 4Gi limit |
| Services can't reach Kafka | Kafka not ready when services started | `kubectl rollout restart deployment <name> -n zord` |
| Observability ALB not created | Stacks not deployed | Deploy monitoring/logging/tracing first |
| Kibana "No indices" | Fluentd not shipping logs | Check fluentd pod logs, create index pattern |
| Grafana "No data" | Prometheus not scraping | Check Prometheus targets in Grafana Explore |
