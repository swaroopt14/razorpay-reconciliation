# EFK Stack

Deploy Elasticsearch + Fluentd + Kibana from scratch on EKS with full password authentication.

---

## Step 1: Create namespace

```bash
kubectl apply -f kubernetes/logging/namespace.yaml
```

---

## Step 3: Create credentials secret

```bash
kubectl apply -f kubernetes/logging/elasticsearch/credentials-secret.yaml
```

Verify:
```bash
kubectl get secret elasticsearch-credentials -n logging
```

---

## Step 4: Deploy Elasticsearch

```bash
kubectl apply -f kubernetes/logging/elasticsearch/statefulset.yaml
```

Wait for ES to be ready (takes 60-90 seconds):
```bash
kubectl get pods -n logging -w
# Wait until: elasticsearch-0   1/1   Running
```

Verify security is working:
```bash
# Without auth — should return 401
kubectl exec -it elasticsearch-0 -n logging -- curl -s http://localhost:9200

# With auth — should return cluster health
kubectl exec -it elasticsearch-0 -n logging -- curl -s -u "elastic:Arealiszord@2026" http://localhost:9200/_cluster/health?pretty
```

---

## Step 5: Deploy Elasticsearch service

```bash
kubectl apply -f kubernetes/logging/elasticsearch/service.yaml
```

---

## Step 6: Deploy Fluentd (configmap + daemonset)

```bash
kubectl apply -f kubernetes/logging/fluentd/configmap.yaml
kubectl apply -f kubernetes/logging/fluentd/daemonset.yaml
```

Verify Fluentd is running and NOT getting 401:
```bash
kubectl get pods -l app=fluentd -n logging
# All should be 1/1 Running

# Check env vars are set
kubectl exec -it $(kubectl get pods -l app=fluentd -n logging -o jsonpath='{.items[0].metadata.name}') -n logging -- env | grep FLUENT_ELASTICSEARCH
# Must show: FLUENT_ELASTICSEARCH_USER=elastic
# Must show: FLUENT_ELASTICSEARCH_PASSWORD=Arealiszord@2026
```

Wait 30 seconds, then verify logs are flowing:
```bash
sleep 30
kubectl exec -it elasticsearch-0 -n logging -- curl -s -u "elastic:Arealiszord@2026" http://localhost:9200/_cat/indices?v
# Should show: zord-logs-2026.06.19
```

---

## Step 7: Deploy Kibana

```bash
kubectl apply -f kubernetes/logging/kibana/deployment.yaml
kubectl apply -f kubernetes/logging/kibana/service.yaml
```

Wait for Kibana to be ready (takes 60-120 seconds):
```bash
kubectl get pods -l app=kibana -n logging -w
# Wait until: kibana-xxx   1/1   Running
```

---

## Step 8: Run Kibana init job

```bash
kubectl delete job kibana-init -n logging --ignore-not-found
kubectl apply -f kubernetes/logging/kibana/init-job.yaml
```

Watch the job:
```bash
kubectl logs -f job/kibana-init -n logging
# Should end with: "KIBANA SECURITY SETUP COMPLETE"
```

---

## Step 9: Deploy Ingress

```bash
kubectl apply -f kubernetes/logging/ingress.yaml
```

---

## Step 10: Verify everything

```bash
# All pods running
kubectl get pods -n logging

# Expected output:
# elasticsearch-0          1/1   Running     0
# fluentd-xxxxx            1/1   Running     0  (one per node)
# kibana-xxxxx             1/1   Running     0
# kibana-init-xxxxx        0/1   Completed   0

# Indices have data
kubectl exec -it elasticsearch-0 -n logging -- curl -s -u "elastic:Arealiszord@2026" "http://localhost:9200/_cat/indices?v&s=index"
```

---

## Step 11: Login to Kibana

Open: `https://kibana.zordnet.com`

```
Username: elastic
Password: Arealiszord@2026
```

Go to **Discover** → select `Zord Application Logs` → you should see live logs.

---

## Quick Reference — All Commands in Order

```bash
# 1. Delete old stack
kubectl delete namespace logging --ignore-not-found
# Wait until gone
kubectl get namespace logging

# 2. Create namespace
kubectl apply -f kubernetes/logging/namespace.yaml

# 3. Secret
kubectl apply -f kubernetes/logging/elasticsearch/credentials-secret.yaml

# 4. Elasticsearch
kubectl apply -f kubernetes/logging/elasticsearch/statefulset.yaml
kubectl apply -f kubernetes/logging/elasticsearch/service.yaml

# 5. Wait for ES
kubectl get pods -n logging -w

# 6. Fluentd
kubectl apply -f kubernetes/logging/fluentd/configmap.yaml
kubectl apply -f kubernetes/logging/fluentd/daemonset.yaml

# 7. Kibana
kubectl apply -f kubernetes/logging/kibana/deployment.yaml
kubectl apply -f kubernetes/logging/kibana/service.yaml

# 8. Init job
kubectl delete job kibana-init -n logging --ignore-not-found
kubectl apply -f kubernetes/logging/kibana/init-job.yaml

# 9. Ingress
kubectl apply -f kubernetes/logging/ingress.yaml

# 10. Verify
kubectl get pods -n logging
kubectl exec -it elasticsearch-0 -n logging -- curl -s -u "elastic:Arealiszord@2026" http://localhost:9200/_cat/indices?v
```

---

## Troubleshooting

### Fluentd getting 401 errors
```bash
kubectl logs -l app=fluentd -n logging --tail=5

# If 401 errors:
kubectl exec -it $(kubectl get pods -l app=fluentd -n logging -o jsonpath='{.items[0].metadata.name}') -n logging -- env | grep FLUENT_ELASTICSEARCH
# Must show USER=elastic and PASSWORD=Arealiszord@2026

# If missing, re-apply:
kubectl apply -f kubernetes/logging/fluentd/daemonset.yaml
kubectl rollout restart daemonset fluentd -n logging
```

### Kibana shows "server not ready"
```bash
kubectl logs deploy/kibana -n logging --tail=10

# Usually means kibana_system password not set yet
# Fix: re-run init job
kubectl delete job kibana-init -n logging
kubectl apply -f kubernetes/logging/kibana/init-job.yaml
```

### No zord-logs index after 2 minutes
```bash
# Check fluentd logs for errors
kubectl logs -l app=fluentd -n logging --tail=10 | grep -i "error\|401\|retry"

# If "connection refused" — ES not ready yet, wait
# If "401" — credentials issue, re-apply daemonset
```

### ES pod stuck in 0/1 Running
```bash
kubectl describe pod elasticsearch-0 -n logging
# Check events for memory/permission issues
# Usually: vm.max_map_count not set (init container handles this)
```

---

## Files Used

| File | Purpose |
|------|---------|
| `logging/namespace.yaml` | Creates `logging` namespace |
| `logging/elasticsearch/credentials-secret.yaml` | Passwords for elastic + kibana_system |
| `logging/elasticsearch/statefulset.yaml` | ES with xpack.security enabled |
| `logging/elasticsearch/service.yaml` | ES ClusterIP service (port 9200) |
| `logging/fluentd/configmap.yaml` | Fluentd config with user/password auth |
| `logging/fluentd/daemonset.yaml` | Fluentd pods with FLUENT_ELASTICSEARCH_USER/PASSWORD env |
| `logging/kibana/deployment.yaml` | Kibana with ELASTICSEARCH_USERNAME/PASSWORD |
| `logging/kibana/service.yaml` | Kibana ClusterIP service (port 5601) |
| `logging/kibana/init-job.yaml` | Sets kibana_system password, creates data views, alerts, ILM |
| `logging/ingress.yaml` | Exposes kibana.zordnet.com |

---

## Login Credentials

| Username | Password | Access |
|----------|----------|--------|
| `elastic` | `Arealiszord@2026` | Full admin (Elasticsearch + Kibana) |

---

## Add a New User via Kibana UI

1. Login as `elastic`
2. Go to **Stack Management → Security → Users**
3. Click **Create User**
4. Fill in username, password, full name
5. Assign role: `superuser` (full admin) or `kibana_user` + `monitoring_user` (read-only)

---

**Last Updated:** June 2025
**Author:** Yaswanth Reddy — Lead DevOps Engineer, Arealis Networks
