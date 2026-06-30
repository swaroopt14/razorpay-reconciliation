# Zord EKS Deployment Guide — Step by Step

This guide deploys the entire Arealis Zord platform (9 microservices + Kong API Gateway + Postgres + Kafka + Observability) to AWS EKS.

---

## Prerequisites

Before starting, you need:

- AWS CLI installed and configured
- kubectl installed
- Docker installed (for building images)
- Access to AWS account `522189039032`
- Access to the infrastructure repo: `Zord-Infrastructure-aws`
- Access to this app repo: `Arealis-Zord-intent`
- ACM certificate for `*.zordnet.com` (wildcard) — covers all subdomains

---

## Platform Architecture

```
Internet
  │
  ├── zordnet.com / api.zordnet.com / kong-admin.zordnet.com
  │     → ALB (shared) → Kong API Gateway (api-gateway namespace)
  │                         ├── / → zord-console:3000
  │                         ├── /v1/admin, /v1/bulk-ingest, /v1/ingest → zord-edge:8080
  │                         ├── /v1/intents, /v1/dlq, /v1/etl → zord-intent-engine:8083
  │                         ├── /v1/dispatch → zord-relay:8082
  │                         ├── /v1/settlement, /v1/reconciliation → zord-outcome-engine:8081
  │                         ├── /v1/evidence, /v1/verify → zord-evidence:8088
  │                         ├── /v1/intelligence/rca → zord-intelligence:8089
  │                         └── /v1/query, /v1/chat → zord-prompt-layer:8086
  │
  └── grafana.zordnet.com / kibana.zordnet.com / jaeger.zordnet.com
        → Same ALB (shared) → Grafana / Kibana / Jaeger
```

## DNS Records (All Subdomains)

All subdomains point to the **same shared ALB** (single ALB for cost savings):

| Domain | Purpose |
|--------|---------|
| `zordnet.com` | Frontend UI |
| `www.zordnet.com` | Frontend UI (www) |
| `api.zordnet.com` | API (Postman / mobile) |
| `kong-admin.zordnet.com` | Kong Admin Dashboard |
| `grafana.zordnet.com` | Metrics dashboards |
| `kibana.zordnet.com` | Log search |
| `jaeger.zordnet.com` | Trace viewer |
| `jaeger.zordnet.com` | Observability ALB | Trace viewer |

---

## Step 1: Create AWS Secrets Manager Secrets (Terraform)

This step creates 2 secrets in AWS Secrets Manager using Terraform from the infrastructure repo.

### 1.1 Set GitHub Actions Secrets

Go to `Zord-Infrastructure-aws` repo → Settings → Secrets and variables → Actions.

Create these 5 secrets:

| Secret Name | Value |
|-------------|-------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |
| `TF_STATE_BUCKET` | Your Terraform state S3 bucket name |
| `ZORD_APP_SECRETS_JSON` | Full JSON below |
| `ZORD_EDGE_SIGNING_KEY_JSON` | Full JSON below |

### 1.2 Value for `ZORD_APP_SECRETS_JSON`

Copy this entire JSON and paste as the secret value:

```json
{
  "POSTGRES_SUPERUSER_PASSWORD": "",
  "EDGE_DB_PASSWORD": "",
  "INTENT_DB_PASSWORD": "",
  "RELAY_DB_PASSWORD": "",
  "TOKEN_DB_PASSWORD": "",
  "OUTCOME_DB_PASSWORD": "",
  "EVIDENCE_DB_PASSWORD": "",
  "INTELLIGENCE_DB_PASSWORD": "",
  "ZORD_VAULT_KEY": "",
  "INTERNAL_ADMIN_KEY": "",
  "MASTER_KEY": "",
  "TOKEN_SECRET": "",
  "JWT_SIGNING_SECRET": "",
  "ENCLAVE_INTERNAL_TOKEN": "",
  "EVIDENCE_SIGNING_PRIVATE_KEY_BASE64": "",
  "EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64": "",
  "GEMINI_API_KEYS": "",
  "EDGE_S3_BUCKET": "swaroop-vault",
  "INTENT_S3_BUCKET": "swaroop-vault",
  "OUTCOME_S3_BUCKET": "swaroop-vault2",
  "EVIDENCE_S3_BUCKET": "swaroop-vault2",
  "RELAY_SERVICES_0_AUTH_TOKEN": "",
  "RELAY_SERVICES_1_AUTH_TOKEN": "",
  "RELAY_SERVICES_2_AUTH_TOKEN": "",
  "RELAY_DB_URL": "postgres://relay_user:relay_password@zord-postgres:5432/zord_relay_db?sslmode=disable",
  "INTELLIGENCE_DATABASE_URL": "postgres://zpi:zpi_secret@zord-postgres:5432/zord_intelligence?sslmode=disable",
  "EDGE_READ_DSN": "postgres://zord_user:zord_password@zord-postgres:5432/zord_edge_db?sslmode=disable",
  "INTENT_READ_DSN": "postgres://intent_user:intent_password@zord-postgres:5432/zord_intent_engine_db?sslmode=disable",
  "RELAY_READ_DSN": "postgres://relay_user:relay_password@zord-postgres:5432/zord_relay_db?sslmode=disable",
  "INTELLIGENCE_READ_DSN": "postgres://zpi:zpi_secret@zord-postgres:5432/zord_intelligence?sslmode=disable",
  "EVIDENCE_READ_DSN": "postgres://evidence_user:evidence_password@zord-postgres:5432/zord_evidence_db?sslmode=disable",
  "OUTCOME_READ_DSN": "postgres://outcome_user:outcome_password@zord-postgres:5432/zord_outcome_db?sslmode=disable",
  "SLACK_LEADS_WEBHOOK_URL": "",
  "SLACK_SUPPORT_WEBHOOK_URL": ""
}
```

**Total: 34 keys** (includes JWT_SIGNING_SECRET for Kong JWT plugin, ENCLAVE_INTERNAL_TOKEN for token-enclave auth, OUTCOME_READ_DSN for prompt-layer, SLACK_LEADS_WEBHOOK_URL for lead notifications, SLACK_SUPPORT_WEBHOOK_URL for support tickets)

### 1.3 Value for `ZORD_EDGE_SIGNING_KEY_JSON`

```json
{
  "ed25519_private.pem": "-----BEGIN PRIVATE KEY-----\nYOUR_ed25519_private\n-----END PRIVATE KEY-----"
}
```

### 1.4 Run the Terraform Workflow

Go to `Zord-Infrastructure-aws` repo → Actions → `Secret Manager Terraform` → Run workflow:
- Set `action` = `apply`
- Click "Run workflow"

Wait for it to complete. This creates:
- `production/zord/app-secrets` in AWS Secrets Manager
- `production/zord/edge-signing-key` in AWS Secrets Manager

---

## Step 2: Create EKS Cluster (Terraform)

### 2.1 Run the EKS Terraform Workflow

Go to `Zord-Infrastructure-aws` repo → Actions → `EKS Terraform` → Run workflow:
- Set `action` = `apply`
- Click "Run workflow"

Wait for it to complete (takes 15-20 minutes). This creates:
- EKS cluster
- Node group (3 nodes)
- VPC, subnets, security groups
- EBS CSI driver
- Cluster Autoscaler
- External Secrets Operator IAM access

### 2.2 Connect kubectl to EKS

```bash
aws eks update-kubeconfig --region ap-south-1 --name <your-cluster-name>
```

### 2.3 Verify Connection

```bash
kubectl config current-context
# Must show: arn:aws:eks:... (NOT docker-desktop)

kubectl get nodes
# All nodes must show: Ready
```

Do NOT continue until all nodes show `Ready`.

---

## Step 3: Verify EKS Add-ons

Run all 4 checks:

```bash
# 1. External Secrets Operator
kubectl get pods -n external-secrets
# Must show running pods

# 2. metrics-server
kubectl get pods -n kube-system | grep metrics-server
# Must show running pod
# Install metrics server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 3. AWS Load Balancer Controller
kubectl get deployment -A | grep aws-load-balancer
# Must show a deployment
# or install in Zord-Infrastructure-aws/AWS Load Balancer Controller.sh

# 4. EBS CSI Driver
kubectl get pods -n kube-system | grep ebs
# Must show running pods
```

If any are missing, install them before continuing.

---

## Step 4: Set gp2 as Default StorageClass

```bash
kubectl get storageclass
```

If `gp2` exists but is not marked `(default)`:

```bash
kubectl patch storageclass gp2 -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

---

## Step 5: Build and Push Docker Images to ECR

### 5.1 Login to ECR

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 522189039032.dkr.ecr.ap-south-1.amazonaws.com
```

### 5.2 Build and Push Each Service

```bash
# zord-edge
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-edge:v2 ./backend/zord-edge
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-edge:v2

# zord-intent-engine
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-intent-engine:v2 ./backend/zord-intent-engine
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-intent-engine:v2

# zord-token-enclave
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-token-enclave:v2 ./backend/zord-token-enclave
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-token-enclave:v2

# zord-relay
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-relay:v2 ./backend/zord-relay
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-relay:v2

# zord-outcome-engine
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-outcome-engine:v2 ./backend/zord-outcome-engine
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-outcome-engine:v2

# zord-evidence
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-evidence:v2 ./backend/zord-evidence
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-evidence:v2

# zord-intelligence
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-intelligence:v2 ./backend/zord-intelligence
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-intelligence:v2

# zord-prompt-layer
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-prompt-layer:v2 ./backend/zord-prompt-layer
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-prompt-layer:v2

# zord-console
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-console:v3 ./backend/zord-console
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-console:v3

# ml-service (Python ML inference)
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/ml-service:v1 ./backend/ml-service
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/ml-service:v1
```

Note: Jenkins automates this step in CI/CD.

### 5.3 Mirror Third-Party Images to ECR (One-Time)

These are infrastructure images (Kafka, Kong, Fluentd, etc.) that must be in YOUR ECR to avoid Docker Hub rate limits. Run once before first deploy:

```bash
# Create mirror repos
for img in kong konga cp-kafka fluentd; do
  aws ecr create-repository --repository-name mirror/$img --region ap-south-1 2>/dev/null
done

# Pull from Docker Hub → Push to your ECR
docker pull kong:3.9 && docker tag kong:3.9 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kong:3.9 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kong:3.9

docker pull pantsel/konga:0.14.9 && docker tag pantsel/konga:0.14.9 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/konga:0.14.9 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/konga:0.14.9

docker pull confluentinc/cp-kafka:7.6.0 && docker tag confluentinc/cp-kafka:7.6.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/cp-kafka:7.6.0 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/cp-kafka:7.6.0

docker pull fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch8-1 && docker tag fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch8-1 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/fluentd:v1.16-debian-elasticsearch8-1 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/fluentd:v1.16-debian-elasticsearch8-1
```

> **NOTE:** Manifest files already point to these ECR mirrors. You only need to run this if the mirror repos are empty (first time or after deleting ECR repos). See `kubernetes/docker to ecr.md` for full details.

---

## Step 6: Update Manual Values (One-Time Only)

These 3 files need manual values set once:

### 6.1 Service Account IAM Role

File: `kubernetes/eks/shared/serviceaccount.yaml`
and
File : 'kubernetes\api-gateway\kong\serviceaccount.yaml'

```yaml
annotations:
  eks.amazonaws.com/role-arn: arn:aws:iam::522189039032:role/ZordAppS3AccessRole
```

Replace with your actual IAM role ARN.

#### How to Create the S3 IAM Role in AWS Console

Use this when you want to create the role manually in AWS Console.

**Step A: Copy the EKS OIDC provider**

Open AWS Console:

```
EKS -> Clusters -> your cluster -> Overview
```

Find:

```
OpenID Connect provider URL
```

Copy it. It looks like:

```
https://oidc.eks.ap-south-1.amazonaws.com/id/ABC123
```

For IAM trust policy, remove `https://`. Use this shape:

```
oidc.eks.ap-south-1.amazonaws.com/id/ABC123
```

**Step B: Create the S3 policy**

Go to:

```
IAM -> Policies -> Create policy -> JSON
```

Paste this policy and replace the bucket names:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_EDGE_BUCKET/*",
        "arn:aws:s3:::YOUR_INTENT_BUCKET/*",
        "arn:aws:s3:::YOUR_OUTCOME_BUCKET/*",
        "arn:aws:s3:::YOUR_EVIDENCE_BUCKET/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_EDGE_BUCKET",
        "arn:aws:s3:::YOUR_INTENT_BUCKET",
        "arn:aws:s3:::YOUR_OUTCOME_BUCKET",
        "arn:aws:s3:::YOUR_EVIDENCE_BUCKET"
      ]
    }
  ]
}
```

Click `Next`.

Use this policy name:

```
ZordAppS3AccessPolicy
```

Click `Create policy`.

**Step C: Create the IAM role**

Go to:

```
IAM -> Roles -> Create role
```

For trusted entity type, choose:

```
Custom trust policy
```

Paste this trust policy and replace:
- `<ACCOUNT_ID>` with your AWS account ID
- `<OIDC_WITHOUT_HTTPS>` with the OIDC URL from Step A (without `https://`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/<OIDC_WITHOUT_HTTPS>"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "<OIDC_WITHOUT_HTTPS>:aud": "sts.amazonaws.com",
          "<OIDC_WITHOUT_HTTPS>:sub": [
            "system:serviceaccount:zord:zord-aws-access",
            "system:serviceaccount:api-gateway:zord-aws-access"
          ]
        }
      }
    }
  ]
}
```

> **Note:** Both the `zord` namespace (app services) and `api-gateway` namespace (Kong)
> need access to AWS Secrets Manager. The `api-gateway` ServiceAccount pulls the
> `JWT_SIGNING_SECRET` used by Kong to validate JWT tokens at the gateway level.

Example with real values:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::522189039032:oidc-provider/oidc.eks.ap-south-1.amazonaws.com/id/09562C64F0660D8AD0F20E6745688055"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "oidc.eks.ap-south-1.amazonaws.com/id/09562C64F0660D8AD0F20E6745688055:sub": [
            "system:serviceaccount:zord:zord-aws-access",
            "system:serviceaccount:api-gateway:zord-aws-access"
          ],
          "oidc.eks.ap-south-1.amazonaws.com/id/09562C64F0660D8AD0F20E6745688055:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}

```

Click `Next`.

**Step D: Attach the S3 policy**

Search for:

```
ZordAppS3AccessPolicy
```

Select it, then click `Next`.

Use this role name:

```
ZordAppS3AccessRole
```

Click `Create role`.

**Step E: Copy the role ARN**

Open:

```
IAM -> Roles -> ZordAppS3AccessRole
```

Copy the ARN. It looks like:

```
arn:aws:iam::522189039032:role/ZordAppS3AccessRole
```

**Step F: Add the role ARN to the Kubernetes service account**

Open: `kubernetes/eks/shared/serviceaccount.yaml`

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: zord-aws-access
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::522189039032:role/ZordAppS3AccessRole
```

Replace the ARN with your real role ARN from Step E.

**Step G: Add Secrets Manager policy to the role**

The role needs Secrets Manager access for External Secrets Operator to pull secrets.

Go to:

```
IAM -> Roles -> ZordAppS3AccessRole -> Add permissions -> Create inline policy -> JSON
```

Paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:ap-south-1:522189039032:secret:production/zord/app-secrets-*",
        "arn:aws:secretsmanager:ap-south-1:522189039032:secret:production/zord/edge-signing-key-*",
        "arn:aws:secretsmanager:ap-south-1:522189039032:secret:production/zord/evidence-signing-key-*"
      ]
    }
  ]
}
```

Use this policy name:

```
ZordSecretsManagerReadPolicy
```

Click `Create policy`.

**Important:** The `*` at the end of each ARN is required because AWS appends a random suffix to secret ARNs.

### 6.2 ALB Certificate and Domain

File: `kubernetes/api-gateway/ingress/alb-ingress.yaml`

```yaml
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-1:522189039032:certificate/6dc91f57-59fd-4e76-b6ae-8cc53ffc6564
```

Replace with your actual ACM certificate ARN. Must be a wildcard cert (`*.zordnet.com`) to cover all subdomains.

```yaml
rules:
  - host: zordnet.com
  - host: www.zordnet.com
  - host: api.zordnet.com
  - host: kong-admin.zordnet.com
```

Replace with your actual domain.

### 6.3 Secret Store Region

File: `kubernetes/eks/shared/secret-store.yaml`

```yaml
region: ap-south-1
```

Must match the region where your AWS Secrets Manager secrets are stored.

---

## Step 7: Dry Run (Validate Manifests)

```bash
# Validate application services
kubectl kustomize kubernetes/eks

# Validate Kong API Gateway
kubectl kustomize kubernetes/api-gateway

# Validate observability (optional)
kubectl kustomize kubernetes/monitoring
kubectl kustomize kubernetes/logging
kubectl kustomize kubernetes/tracing
```

If all print resources without errors, you're ready to deploy.

---

## Step 8: Deploy Application Services (Step by Step)

Deploy in order — wait for each group to be healthy before moving to the next.

### 8.1 Deploy Shared Config + Infrastructure (Postgres + Kafka + Redis)

```bash
# Apply namespace, secrets, configmaps, postgres, kafka, redis
kubectl apply -f kubernetes/eks/namespace.yaml

# Step 7: Redeploy everything from scratch
kubectl apply -k kubernetes/eks

# Step 8: Wait for infrastructure
kubectl wait --for=condition=Ready pod/zord-postgres-0 -n zord --timeout=300s
kubectl wait --for=condition=Ready pod/zord-kafka-0 -n zord --timeout=300s
```

### 8.2 Final Check — All Pods Running

```bash
kubectl get pods -n zord
```

---

## Step 8.5: Deploy Kong API Gateway

After all services are running in the `zord` namespace, deploy Kong:

```bash
# Deploy Kong API Gateway
kubectl apply -k kubernetes/api-gateway

# Wait for Kong pods
kubectl get pods -n api-gateway -w

# Expected:
# kong-gateway-xxx   1/1   Running
# kong-gateway-yyy   1/1   Running

# Verify Kong can reach backend services
kubectl exec -n api-gateway deploy/kong-gateway -- wget -qO- http://zord-edge.zord.svc.cluster.local:8080/health

# Check ALB is created
kubectl get ingress -n api-gateway
```

See [kubernetes/api-gateway/README.md](./api-gateway/README.md) for full Kong documentation.

---

## Step 8.6: Deploy Observability Stack (Optional)

Deploy after all services are running. Each stack is independent:

```bash
# Metrics (Grafana + Prometheus)
kubectl apply -k kubernetes/monitoring

# Logs (Kibana + Elasticsearch + Fluentd)
kubectl apply -k kubernetes/logging

# Traces (Jaeger + OpenTelemetry)
kubectl apply -k kubernetes/tracing

# Verify
kubectl get pods -n monitoring
kubectl get pods -n logging
kubectl get pods -n tracing

# Check observability ALB is created
kubectl get ingress -n monitoring
```

Access after DNS is configured:
- `https://grafana.zordnet.com` (admin / see `monitoring/grafana/secret.yaml`)
- `https://kibana.zordnet.com` (elastic / see `logging/kibana/secret.yaml`)
- `https://jaeger.zordnet.com` (admin / see `tracing/jaeger/secret.yaml`)

See [kubernetes/observability-README.md](./observability-README.md) for full documentation.

---## Step 9: Watch Pods Come Up

```bash
kubectl get pods -n zord -w
```

**Expected startup order:**
1. Postgres starts first (30-60 seconds)
2. Kafka starts next (60-120 seconds)
3. All 9 app services start after Kafka is ready

**Expected final state — all pods Running:**

```
zord-postgres-0          1/1  Running
zord-kafka-0             1/1  Running
zord-kafka-topics-xxx    0/1  Completed
zord-edge-xxx            1/1  Running
zord-intent-engine-xxx   1/1  Running
zord-token-enclave-xxx   1/1  Running
zord-relay-xxx           1/1  Running
zord-outcome-engine-xxx  1/1  Running
zord-evidence-xxx        1/1  Running
zord-intelligence-xxx    1/1  Running
zord-prompt-layer-xxx    1/1  Running
zord-console-xxx         1/1  Running
zord-ml-service-xxx      1/1  Running
```

---

## Step 10: Verify Deployment

```bash
# All pods running
kubectl get pods -n zord
kubectl get pods -n api-gateway

# Check image versions running on each service
kubectl get deployment zord-edge -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-intent-engine -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-token-enclave -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-relay -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-outcome-engine -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-intelligence -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-evidence -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-prompt-layer -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-console -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment zord-ml-service -n zord -o jsonpath='{.spec.template.spec.containers[0].image}'

# Services created
kubectl get svc -n zord
kubectl get svc -n api-gateway

# Ingress created (ALB — now in api-gateway namespace)
kubectl get ingress -n api-gateway

# HPA working
kubectl get hpa -n zord
kubectl get hpa -n api-gateway

# Secrets synced
kubectl get externalsecret -n zord

# Frontend accessible through Kong
curl https://zordnet.com/api/health

# Test Kong routing
curl https://zordnet.com/edge/health
```

---

## Step 11: Point DNS to ALB

After the ALB is created:

```bash
kubectl get ingress -n api-gateway
```

Copy the ALB DNS name (e.g., `k8s-apigate-kongpubl-xxx.ap-south-1.elb.amazonaws.com`).

Go to your DNS provider (Route53 or other) and create:
- `zordnet.com` → CNAME → ALB DNS name
- `www.zordnet.com` → CNAME → ALB DNS name
- `api.zordnet.com` → CNAME → ALB DNS name

---

## Configuration Reference

### Centralized ConfigMap

File: `kubernetes/eks/shared/aws-config.yaml`

All shared infrastructure values in one place:

```yaml
data:
  AWS_REGION: ap-south-1
  AWS_EC2_METADATA_DISABLED: "true"
  KAFKA_BROKERS: zord-kafka:9092
  DB_HOST: zord-postgres
  DB_PORT: "5432"
  DB_SSLMODE: disable
```

To change any of these (e.g., switch to RDS or MSK), edit this one file and redeploy.

### Resource Allocation

| Component | CPU (req/limit) | Memory (req/limit) | Storage |
|-----------|----------------|-------------------|---------|
| Postgres | 500m / 2 | 1Gi / 2Gi | 50Gi |
| Kafka | 500m / 2 | 2Gi / 4Gi | 50Gi |
| Redis | 50m / 200m | 128Mi / 300Mi | — |
| Kong Gateway | 250m / 1 | 512Mi / 1Gi | — |
| zord-edge | 200m / 750m | 384Mi / 768Mi | — |
| zord-intent-engine | 200m / 750m | 384Mi / 768Mi | — |
| zord-token-enclave | 100m / 500m | 256Mi / 512Mi | — |
| zord-relay | 250m / 1 | 512Mi / 1Gi | — |
| zord-outcome-engine | 200m / 750m | 384Mi / 768Mi | — |
| zord-evidence | 200m / 750m | 384Mi / 768Mi | — |
| zord-intelligence | 500m / 1.5 | 1Gi / 2Gi | — |
| zord-prompt-layer | 200m / 750m | 384Mi / 1Gi | — |
| zord-console | 100m / 500m | 256Mi / 512Mi | — |
| ml-service | 200m / 1 | 512Mi / 1Gi | — |

### HPA (Auto-Scaling)

| Service | Min Replicas | Max Replicas | Scale-up at |
|---------|-------------|-------------|-------------|
| Kong Gateway | 2 | 6 | 70% CPU |
| zord-edge | 2 | 5 | 70% CPU |
| zord-intent-engine | 1 | 8 | 70% CPU |
| zord-token-enclave | 1 | 4 | 70% CPU |
| zord-relay | 1 | 6 | 70% CPU |
| zord-outcome-engine | 1 | 4 | 70% CPU |
| zord-evidence | 1 | 4 | 70% CPU |
| zord-intelligence | 1 | 5 | 70% CPU |
| zord-prompt-layer | 1 | 4 | 70% CPU |
| zord-console | 1 | 5 | 70% CPU |
| zord-ml-service | 1 | 3 | 70% CPU |

---

## Folder Structure

```
kubernetes/
├── api-gateway/                    ← Kong API Gateway (Phase 5)
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── kong/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   ├── hpa.yaml
│   │   └── pdb.yaml
│   ├── ingress/
│   │   └── alb-ingress.yaml
│   ├── routes/                     ← documentation
│   └── plugins/                    ← documentation
├── eks/
│   ├── kustomization.yaml          ← single apply entrypoint
│   ├── namespace.yaml
│   ├── shared/
│   │   ├── aws-config.yaml
│   │   ├── serviceaccount.yaml
│   │   ├── secret-store.yaml
│   │   ├── external-secret-app-secrets.yaml
│   │   ├── external-secret-edge-signing-key.yaml
│   │   ├── relay-config.yaml
│   │   └── postgres-bootstrap-config.yaml
│   ├── infrastructure/
│   │   ├── postgres/
│   │   │   ├── service.yaml
│   │   │   └── statefulset.yaml
│   │   ├── kafka/
│   │   │   ├── headless-service.yaml
│   │   │   ├── service.yaml
│   │   │   ├── statefulset.yaml
│   │   │   └── topic-job.yaml
│   │   └── redis/
│   │       ├── deployment.yaml      ← Redis for prompt-layer memory
│   │       └── service.yaml
│   ├── services/
│   │   └── <service-name>/
│   │       ├── deployment.yaml
│   │       ├── service.yaml
│   │       ├── pdb.yaml
│   │       └── hpa.yaml
│   └── ingress/
│       └── public-alb.yaml         ← DEPRECATED (fallback only)
├── argocd/                         ← Argo CD GitOps
├── monitoring/                     ← Prometheus + Grafana
├── logging/                        ← Elasticsearch + Fluentd + Kibana
└── tracing/                        ← OpenTelemetry + Jaeger
```

---

## Troubleshooting

### Pods stuck in Pending

```bash
kubectl describe pod <pod-name> -n zord
kubectl get pvc -n zord
kubectl get storageclass
```

Cause: No default StorageClass or EBS CSI not installed.

### Pods in CrashLoopBackOff

```bash
kubectl logs <pod-name> -n zord --tail=20
```

Common causes:
- Kafka not ready yet → wait 2 minutes, services auto-recover
- Missing secret key → check `kubectl get externalsecret -n zord`
- DB connection refused → Postgres not ready yet

### Pods in CreateContainerConfigError

```bash
kubectl describe pod <pod-name> -n zord
```

Cause: A secret key referenced in the deployment doesn't exist in `zord-app-secrets`.

### Kafka keeps restarting

Check logs:
```bash
kubectl logs zord-kafka-0 -n zord --tail=20
```

Common causes:
- OOM killed (exit 137) → already fixed with 4Gi memory limit
- DNS resolution error → already fixed with `localhost:9093` for quorum voter
- `lost+found` directory error → already fixed with `subPath: kafka-data` in volume mount
- Corrupt data → wipe PVC and redeploy:
  ```bash
  kubectl delete statefulset zord-kafka -n zord
  kubectl delete pvc data-zord-kafka-0 -n zord
  kubectl apply -k kubernetes/eks
  ```

### ALB not created

```bash
kubectl get ingress -n api-gateway
kubectl describe ingress kong-public -n api-gateway
```

Check:
- AWS Load Balancer Controller is installed
- ACM certificate ARN is valid
- Public subnets are tagged correctly

### Services can't connect to Kafka after restart

```bash
kubectl rollout restart deployment <service-name> -n zord
```

Or delete all pods to force fresh restart:
```bash
kubectl delete pods -n zord -l app.kubernetes.io/name=<service-name>
```

---

## Important Notes

- `EVIDENCE_SIGNING_PRIVATE_KEY_BASE64` and `EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64` must be EMPTY in secrets — the service auto-generates keys
- Kafka uses KRaft mode (no ZooKeeper) with `localhost:9093` for controller quorum
- Postgres bootstrap script creates all 7 databases and users on first start only
- All Kafka-consuming services have `terminationGracePeriodSeconds: 45`
- Relay auth tokens are in ConfigMap (`relay-config.yaml`) because Viper cannot map array env vars
- All traffic flows through Kong API Gateway (`api-gateway` namespace) → backend services (`zord` namespace)
- Kong uses DB-less mode — all config is declarative YAML in a ConfigMap
- The browser hits Kong → Kong routes to zord-console or backend APIs based on path
- Internal service-to-service calls (relay → edge, relay → intent-engine) bypass Kong and use K8s DNS directly
- The Python `ml-service` communicates with `zord-intelligence` via Kafka topics (`ml.request.events` / `ml.result.events`). It has no HTTP API — only Kafka consumers/producers.

---

## Future Improvements

For higher production reliability:
- Replace in-cluster Postgres with **AWS RDS Multi-AZ** (see `kubernetes/future-upgrades/README.md`)
- Replace in-cluster Kafka with **AWS MSK** (3+ brokers) (see `kubernetes/future-upgrades/README.md`)
- Add **NetworkPolicy** for service isolation
- Add **Pod Security Standards** (runAsNonRoot)
- Add **Cloudflare Access or AWS Cognito** for observability UI SSO (replace basic auth)
- Enable **relay tracing** after deploying tracing stack
- Add **Kong JWT plugin** to move auth validation to gateway level

## Related Documentation

| Document | Path |
|----------|------|
| Kong API Gateway Guide | `kubernetes/api-gateway/README.md` |
| Observability Stack Guide | `kubernetes/observability-README.md` |
| API Testing (Postman) | `docs/KONG-API-TESTING.md` |
| End-to-End Testing | `kubernetes/eks_deployment_end-to-end_testing/Readme.md` |
| Future Upgrades (RDS + MSK) | `kubernetes/future-upgrades/README.md` |
| EKS Environment Variables | `docs/EKS-ENVIRONMENT-VARIABLES.md` |
| Jenkins CI/CD | `jenkins/README.md` |

---

## Destroy & Redeploy

### Delete Everything

```bash
# Delete all (one command)
kubectl delete ns zord api-gateway monitoring logging tracing argocd --ignore-not-found

# Delete persistent data (Postgres + Kafka data gone forever)
kubectl delete pvc --all -n zord --ignore-not-found
kubectl delete pvc --all -n logging --ignore-not-found

# Verify
kubectl get ns
```

### Redeploy Fresh

```bash
cd ~/Arealis-Zord-intent && git pull

# 1. Deploy app services + infra
kubectl apply -k kubernetes/eks

# 2. Wait for DB + Kafka
kubectl wait --for=condition=Ready pod/zord-postgres-0 -n zord --timeout=300s
kubectl wait --for=condition=Ready pod/zord-kafka-0 -n zord --timeout=300s

# 3. Deploy Kong
kubectl apply -k kubernetes/api-gateway

# 4. Deploy observability
# 1. Logging FIRST (wait for ES to be ready)
kubectl apply -k kubernetes/logging
kubectl wait --for=condition=Ready pod -l app=elasticsearch -n logging --timeout=120s

# 2. Then monitoring
kubectl apply -k kubernetes/monitoring

# 3. Then tracing
kubectl apply -k kubernetes/tracing


# 5. Verify all pods
kubectl get pods -n zord
kubectl get pods -n api-gateway

# 6. Check ALB + DNS
kubectl get ingress -n api-gateway
curl -s https://api.zordnet.com/edge/health
```

### Destroy EKS Cluster (Terraform)

After all Kubernetes resources are deleted:

```
Zord-Infrastructure-aws repo → Actions → EKS Terraform → action = destroy → Run
```
