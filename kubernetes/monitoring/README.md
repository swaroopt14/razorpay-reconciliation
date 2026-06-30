# Monitoring Stack — Fresh Deployment Guide (Prometheus + Grafana)

Deploy Prometheus + Grafana + Exporters from scratch on EKS with password authentication.

---

## Prerequisites

- Logged into Bastion EC2 (`ssh -i key.pem ec2-user@bastion-ip`)
- `kubectl` configured for `arealis-zord-prod-eks`
- Code pulled: `cd ~/Arealis-Zord-intent`

---

## Step 1: Clean Up (delete everything in monitoring namespace)

```bash
kubectl delete namespace monitoring --ignore-not-found
```

Wait until fully deleted:
```bash
kubectl get namespace monitoring
# Should show: "not found"
```

---

## Step 2: Deploy everything (one command)

```bash
kubectl apply -k kubernetes/monitoring
```

Wait for all pods to be ready (takes 60-90 seconds):
```bash
kubectl get pods -n monitoring -w
```

Expected output:
```
grafana-xxx              1/1   Running   0
kafka-exporter-xxx       1/1   Running   0
kube-state-metrics-xxx   1/1   Running   0
node-exporter-xxxxx      1/1   Running   0  (one per node)
postgres-exporter-xxx    1/1   Running   0
prometheus-xxx           1/1   Running   0
```

---

## Step 3: Verify Prometheus is scraping

```bash
kubectl exec -it deploy/prometheus -n monitoring -- wget -qO- http://localhost:9090/api/v1/targets | head -50
```

---

## Step 4: Login to Grafana

Open: `https://grafana.zordnet.com`

```
Username: admin
Password: zord-grafana-2026
```

---

## Quick Reference — All Commands

```bash
# 1. Delete old stack
kubectl delete namespace monitoring --ignore-not-found
sleep 10

# 2. Deploy everything
kubectl apply -k kubernetes/monitoring

# 3. Wait for pods
kubectl get pods -n monitoring -w

# 4. Verify
kubectl get pods -n monitoring
```

---

## Components

| Component | Purpose | Port |
|-----------|---------|------|
| **Prometheus** | Scrapes metrics from all services every 15s | 9090 |
| **Grafana** | Dashboards & visualization | 3000 |
| **Node Exporter** | Host-level metrics (CPU, memory, disk, network) | 9100 |
| **Kube State Metrics** | Kubernetes object metrics (pods, deployments, nodes) | 8080 |
| **Postgres Exporter** | PostgreSQL database metrics | 9187 |
| **Kafka Exporter** | Kafka broker, topic, consumer group metrics | 9308 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  All Services (zord, api-gateway namespaces)                      │
│       │                                                           │
│       └── /metrics endpoint (annotation: prometheus.io/scrape)    │
│                    │                                              │
│                    ▼                                              │
│  Prometheus (scrapes every 15s) ──→ stores 15 days of data       │
│                    │                                              │
│                    ▼                                              │
│  Grafana (visualizes) ──→ grafana.zordnet.com                    │
│                                                                   │
│  Exporters:                                                       │
│    ├── node-exporter (DaemonSet — one per node)                  │
│    ├── kube-state-metrics (1 pod)                                │
│    ├── postgres-exporter → zord-postgres.zord.svc.cluster.local  │
│    └── kafka-exporter → zord-kafka.zord.svc.cluster.local:9092   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Used

| File | Purpose |
|------|---------|
| `monitoring/namespace.yaml` | Creates `monitoring` namespace |
| `monitoring/prometheus/rbac.yaml` | ServiceAccount + ClusterRole for Prometheus |
| `monitoring/prometheus/configmap.yaml` | Prometheus scrape config (targets) |
| `monitoring/prometheus/alerting-rules.yaml` | Alert rules (CPU, memory, pod restarts) |
| `monitoring/prometheus/recording-rules.yaml` | Pre-computed metric queries |
| `monitoring/prometheus/deployment.yaml` | Prometheus pod (20Gi storage) |
| `monitoring/prometheus/service.yaml` | ClusterIP service (port 9090) |
| `monitoring/node-exporter/daemonset.yaml` | Node Exporter (one per node) |
| `monitoring/node-exporter/service.yaml` | Node Exporter service (port 9100) |
| `monitoring/kube-state-metrics/deployment.yaml` | Kube State Metrics pod |
| `monitoring/kube-state-metrics/service.yaml` | Kube State Metrics service (port 8080) |
| `monitoring/postgres-exporter/secret.yaml` | PostgreSQL DSN connection string |
| `monitoring/postgres-exporter/deployment.yaml` | Postgres Exporter pod |
| `monitoring/postgres-exporter/service.yaml` | Postgres Exporter service (port 9187) |
| `monitoring/kafka-exporter/deployment.yaml` | Kafka Exporter pod |
| `monitoring/kafka-exporter/service.yaml` | Kafka Exporter service (port 9308) |
| `monitoring/grafana/secret.yaml` | Grafana admin credentials |
| `monitoring/grafana/datasources.yaml` | Prometheus + ES + Jaeger datasources |
| `monitoring/grafana/dashboard-provisioning.yaml` | Dashboard auto-provisioning config |
| `monitoring/grafana/dashboards-configmap.yaml` | Service-level dashboards |
| `monitoring/grafana/dashboards-nodes.yaml` | Node-level dashboards |
| `monitoring/grafana/dashboards-platform.yaml` | Platform overview dashboards |
| `monitoring/grafana/dashboards-data-layer.yaml` | Kafka + Postgres dashboards |
| `monitoring/grafana/deployment.yaml` | Grafana pod (5Gi storage) |
| `monitoring/grafana/service.yaml` | ClusterIP service (port 3000) |
| `monitoring/ingress.yaml` | Exposes grafana.zordnet.com |

---

## Login Credentials

| Username | Password | Access |
|----------|----------|--------|
| `admin` | `zord-grafana-2026` | Full admin (Grafana) |

---

## Changing Password

Edit `monitoring/grafana/secret.yaml`:
```yaml
stringData:
  ADMIN_USER: admin
  ADMIN_PASSWORD: your-new-password
```

Then re-apply:
```bash
kubectl apply -f kubernetes/monitoring/grafana/secret.yaml
kubectl rollout restart deployment grafana -n monitoring
```

---

## Grafana Dashboards (Pre-loaded)

These dashboards are automatically provisioned on deploy:

| Dashboard | What it shows |
|-----------|--------------|
| Zord Services Overview | Request rate, latency, errors per service |
| Node Resources | CPU, memory, disk per EKS node |
| Platform Overview | Pod status, restarts, namespace health |
| Data Layer | Kafka topics/consumers + Postgres connections/queries |

### Import Additional Dashboards

Go to Grafana → Dashboards → Import → Enter ID → Load:

| Dashboard | ID | What it shows |
|-----------|-----|--------------|
| Kong Official | 7424 | API gateway traffic, latency, errors |
| Kubernetes Cluster | 6417 | Node CPU, memory, pod status |
| Node Exporter Full | 1860 | Detailed node metrics |

---

## How Prometheus Discovers Targets

Services are auto-discovered via pod annotations:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/metrics"
```

Prometheus scrapes all pods with `prometheus.io/scrape: "true"` in these namespaces:
- `zord` (all application services)
- `api-gateway` (Kong)
- `monitoring` (exporters)

---

## Troubleshooting

### Grafana shows "No data"

```bash
# Check Prometheus is running
kubectl get pods -n monitoring | grep prometheus

# Check Prometheus targets
kubectl port-forward deploy/prometheus 9090:9090 -n monitoring
# Open http://localhost:9090/targets — check if targets are UP
```

### Exporter pod in CrashLoopBackOff

```bash
# Postgres exporter — check DSN
kubectl logs deploy/postgres-exporter -n monitoring

# Kafka exporter — check Kafka connectivity
kubectl logs deploy/kafka-exporter -n monitoring
```

### Node Exporter not running on all nodes

```bash
kubectl get daemonset node-exporter -n monitoring
# DESIRED should match number of nodes
```

### Prometheus storage full

```bash
kubectl exec -it deploy/prometheus -n monitoring -- df -h /prometheus
# If full: increase PVC size or reduce retention (currently 15 days)
```

---

## Resource Allocation

| Component | CPU (req/limit) | Memory (req/limit) | Storage |
|-----------|----------------|-------------------|---------|
| Prometheus | 250m / 1 | 512Mi / 2Gi | 20Gi PVC |
| Grafana | 100m / 500m | 256Mi / 512Mi | 5Gi PVC |
| Node Exporter | 50m / 200m | 64Mi / 128Mi | — |
| Kube State Metrics | 50m / 200m | 64Mi / 128Mi | — |
| Postgres Exporter | 50m / 200m | 64Mi / 128Mi | — |
| Kafka Exporter | 50m / 200m | 64Mi / 128Mi | — |

---

**Last Updated:** June 2025
**Author:** Yaswanth Reddy — Lead DevOps Engineer, Arealis Networks
