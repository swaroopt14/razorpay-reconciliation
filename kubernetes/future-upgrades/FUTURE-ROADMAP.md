# Future Upgrades — Complete Roadmap

This document lists everything to implement as the platform grows. Prioritized by when you'll need it.

---

## Priority 1 — Before Production Traffic (First Paying Customer)

### 1. AlertManager — Slack/Email Notifications

**Why:** Prometheus and Kibana alerts fire, but nobody gets notified. You have to manually check dashboards.

**What it does:** When an alert fires → sends Slack message / email / PagerDuty notification immediately.

**Implementation:**
- Deploy AlertManager in `monitoring` namespace
- Configure Slack webhook URL
- Connect Prometheus alert rules → AlertManager → Slack
- Alert channels: `#ops-alerts` (critical), `#ops-warnings` (non-critical)

**Files to create:**
```
kubernetes/monitoring/alertmanager/
├── deployment.yaml
├── service.yaml
└── configmap.yaml (Slack webhook, routing rules)
```

**Effort:** 2-3 hours

---

### 2. AWS RDS Multi-AZ (Replace In-Cluster Postgres)

**Why:** Single Postgres pod = if it dies, ALL services go down. RDS gives automatic failover, backups, and patches.

**See:** `kubernetes/future-upgrades/README.md` for full step-by-step migration guide.

**Files to change:**
- `kubernetes/eks/shared/aws-config.yaml` (DB_HOST, DB_SSLMODE)
- AWS Secrets Manager (connection strings)
- `kubernetes/eks/kustomization.yaml` (remove postgres resources)

**Effort:** 1 day (including testing)

---

### 3. AWS MSK (Replace In-Cluster Kafka)

**Why:** Single Kafka pod = if it dies, event processing stops. MSK gives 3+ brokers, auto-recovery, managed upgrades.

**See:** `kubernetes/future-upgrades/README.md` for full step-by-step migration guide.

**Files to change:**
- `kubernetes/eks/shared/aws-config.yaml` (KAFKA_BROKERS)
- `kubernetes/eks/shared/relay-config.yaml` (kafka.brokers)
- `kubernetes/eks/kustomization.yaml` (remove kafka resources)

**Effort:** 1 day (including testing)

---

### 4. Jaeger SPM (Service Performance Monitoring)

**Why:** The Jaeger Monitor tab (latency/error rate/request rate graphs) doesn't work yet because the spanmetrics connector was crashing.

**What's needed:**
- Update OTel Collector image to latest stable
- Re-enable `spanmetrics` connector in `kubernetes/tracing/otel-collector/configmap.yaml`
- Rebuild all service Docker images (so traces flow)
- Configure Prometheus to scrape spanmetrics endpoint

**When:** After Docker images are rebuilt with tracing code

**Effort:** 2 hours

---

### 5. NetworkPolicies (Service Isolation)

**Why:** Any pod can talk to any other pod. In a fintech platform, you should restrict: only relay can call PSP, only specific services can access Postgres, etc.

**Implementation:**
```yaml
# Example: only relay can reach token-enclave
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-relay-to-token-enclave
  namespace: zord
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: zord-token-enclave
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: zord-relay
```

**Files to create:**
```
kubernetes/eks/network-policies/
├── postgres-policy.yaml
├── kafka-policy.yaml
├── token-enclave-policy.yaml
└── default-deny.yaml
```

**Effort:** Half day

---

## Priority 2 — When You Scale (10+ Customers, Team Grows)

### 6. Argo CD Deployment (GitOps)

**Why:** Currently you manually run `kubectl apply`. Argo CD auto-deploys when you push to GitHub.

**Status:** Manifests already created in `kubernetes/argocd/`. Just needs deployment.

**Deploy:**
```bash
kubectl apply -f kubernetes/argocd/namespace.yaml
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.3/manifests/install.yaml
kubectl apply -f kubernetes/argocd/argocd-cm-patch.yaml
kubectl apply -f kubernetes/argocd/ingress.yaml
kubectl apply -f kubernetes/argocd/apps/
```

**Access:** `https://argocd.zordnet.com`

**Effort:** 1 hour

---

### 7. SSO for Observability (Cloudflare Access / AWS Cognito)

**Why:** Currently Grafana has basic auth, Kibana/Jaeger have no auth. SSO gives team-level access with Google/Microsoft login.

**Options:**
- **Cloudflare Access** — free for 50 users, instant setup
- **AWS Cognito** — free tier, integrates with IAM

**Implementation:** Put observability ALB behind Cloudflare Access or add Cognito authorizer to ALB.

**Effort:** Half day

---

### 8. Kong JWT Plugin (Gateway-Level Auth)

**Why:** Currently each service validates API keys internally. Moving auth to Kong means one auth layer for all services.

**Implementation:**
- Enable JWT plugin on specific routes in `kong/configmap.yaml`
- Register consumers with JWT credentials
- Remove auth validation from individual services

**Effort:** 1 day (needs code changes in services)

---

### 9. Staging Environment

**Why:** Currently you deploy directly to production. A staging environment lets you test before going live.

**Implementation:**
- Create second EKS cluster (Terraform with `environment=staging`)
- Deploy same manifests with different ConfigMap values
- Use `staging.zordnet.com` subdomain

**Cost:** ~$150/month additional (smaller node group)

**Effort:** 1 day

---

### 10. Pod Security Standards

**Why:** Container hardening — prevent containers from running as root, writing to filesystem, escalating privileges.

**Implementation:**
```yaml
securityContext:
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

Apply to all service deployments.

**Effort:** 2-3 hours

---

## Priority 3 — When You Grow Big (50+ Customers, Compliance)

### 11. AWS WAF on ALB

**Why:** DDoS protection, bot blocking, SQL injection filtering, geo-blocking.

**Implementation:**
- Create WAF Web ACL in AWS Console
- Associate with Kong ALB
- Add rules: rate-based, SQL injection, XSS, geo-block

**Cost:** ~$5/month + $0.60 per million requests

**Effort:** 2 hours

---

### 12. Canary Deployments (Traffic Splitting)

**Why:** Deploy new version to 5% of traffic first. If errors increase, auto-rollback. If stable, gradually increase to 100%.

**Implementation options:**
- Kong traffic splitting (weighted routes)
- Argo Rollouts (Kubernetes-native canary)
- Flagger (progressive delivery)

**Effort:** 1 day

---

### 13. Multi-Region Deployment

**Why:** If ap-south-1 region goes down, your platform is offline. Multi-region gives disaster recovery.

**Implementation:**
- Deploy EKS in second region (e.g., ap-southeast-1)
- Route53 failover routing
- Cross-region RDS read replica
- MSK cross-region replication

**Cost:** 2x infrastructure cost

**Effort:** 1 week

---

### 14. Elasticsearch HA (3-Node Cluster)

**Why:** Currently single Elasticsearch node — if it dies, logs are lost and Kibana goes down.

**Implementation:**
- Change `replicas: 1` to `replicas: 3` in StatefulSet
- Update Elasticsearch config for multi-node discovery
- Change index `number_of_replicas` to `1` (data replicated across nodes)

**Effort:** Half day

---

### 15. Kafka Consumer Lag Alerting (via AlertManager)

**Why:** If a consumer falls behind, payments get delayed. AlertManager notifies immediately.

**Implementation:**
- Add Prometheus alert rule for `kafka_consumergroup_lag > 1000`
- Route to Slack via AlertManager
- Per-consumer-group thresholds

**Effort:** 1 hour (after AlertManager is deployed)

---

### 16. Backup & Restore Automation

**Why:** If data is lost, you need point-in-time recovery.

**Implementation:**
- **Postgres:** RDS automated snapshots (daily, 7-day retention)
- **Kafka:** MSK topic backup to S3
- **Elasticsearch:** Snapshot to S3 (weekly)
- **Evidence S3:** Cross-region replication
- **Signing keys:** Backed up in separate AWS account

**Effort:** 1 day

---

### 17. Cost Optimization

**Why:** Save money as you scale.

**Implementation:**
- **Spot instances** for non-critical workloads (monitoring, logging)
- **Right-sizing pods** — reduce over-provisioned CPU/memory limits
- **Reserved instances** for Karpenter/node groups (1-year commitment = 40% savings)
- **S3 lifecycle rules** — move old evidence to Glacier after 90 days
- **EBS volume type** — switch to gp3 (20% cheaper than gp2)

**Savings:** 30-50% infrastructure cost reduction

---

### 18. PCI DSS / SOC 2 Compliance

**Why:** Required when handling real payment data for regulated entities.

**Implementation:**
- Encryption at rest (EBS, RDS, S3) — already done
- Encryption in transit (TLS) — already done via Kong/ALB
- Access logging — already done via Fluentd/Elasticsearch
- Vulnerability scanning — add Trivy to CI/CD
- Penetration testing — annual third-party audit
- Data retention policies — already done via ILM
- Incident response plan — document + alerting
- Key rotation — automate via Secrets Manager rotation

**Effort:** 2-4 weeks (mostly documentation + process)

---

## Already Completed (No Future Work Needed)

| Feature | Status |
|---------|--------|
| Kong API Gateway (routes, plugins, rate limiting) | ✅ |
| Prometheus + Grafana (5 dashboards, 11 alerts, recording rules) | ✅ |
| EFK Stack (logs, 6 Kibana alerts, ILM, saved searches) | ✅ |
| Jaeger + OTel Collector (tracing infrastructure) | ✅ |
| PostgreSQL + Kafka Exporters | ✅ |
| Node Exporter + kube-state-metrics | ✅ |
| All 8 services instrumented for tracing | ✅ |
| Cluster Autoscaler (v1.32) | ✅ |
| External Secrets Operator (AWS) | ✅ |
| Jenkins CI/CD (SonarQube + ECR + manifest update) | ✅ |
| DNS + TLS (wildcard ACM cert) | ✅ |
| HPA + PDB for all services | ✅ |
| Kong Admin UI (Konga) | ✅ |
| Argo CD manifests (ready to deploy) | ✅ |
| Future upgrades documentation (RDS + MSK guide) | ✅ |
| Redeployment guide | ✅ |
| End-to-end testing guide | ✅ |
| API testing guide (Postman) | ✅ |

---

## Implementation Order (Recommended Timeline)

| Week | What to Do |
|------|-----------|
| Week 1 | Rebuild Docker images (tracing works) + Deploy Argo CD |
| Week 2 | Migrate to RDS + MSK |
| Week 3 | Deploy AlertManager (Slack notifications) |
| Week 4 | Add NetworkPolicies + Pod Security Standards |
| Month 2 | Staging environment + Kong JWT |
| Month 3 | SSO for observability + WAF |
| Month 6+ | Multi-region + compliance |
