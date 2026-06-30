# EKS Deployment Manifests

These manifests are now split into a real-world style layout: one YAML per Kubernetes resource, grouped by responsibility.

## Folder Layout

```text
kubernetes/eks/
├── kustomization.yaml
├── namespace.yaml
├── shared/
│   ├── serviceaccount.yaml
│   ├── secret-store.yaml
│   ├── external-secret-app-secrets.yaml
│   ├── external-secret-edge-signing-key.yaml
│   ├── relay-config.yaml
│   └── postgres-bootstrap-config.yaml
├── infrastructure/
│   ├── postgres/
│   │   ├── service.yaml
│   │   └── statefulset.yaml
│   └── kafka/
│       ├── headless-service.yaml
│       ├── service.yaml
│       ├── statefulset.yaml
│       └── topic-job.yaml
├── services/
│   ├── zord-edge/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-intent-engine/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-token-enclave/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-relay/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-outcome-engine/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-evidence/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-intelligence/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-prompt-layer/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   └── zord-console/
│       ├── service.yaml
│       └── deployment.yaml
│   └── ml-service/
│       ├── service.yaml
│       └── deployment.yaml
└── ingress/
    └── public-alb.yaml
```

## How Companies Usually Organize It

This style is much closer to how teams normally maintain manifests:

- `shared/`: common config, service accounts, secrets, config maps
- `infrastructure/`: stateful dependencies like Postgres, Kafka, Redis, etc.
- `services/<service-name>/`: every microservice has its own `Deployment` and `Service`
- `ingress/`: public frontend entrypoint through ALB
- `kustomization.yaml`: the single assembly point for the environment

## High Availability

The stateless application tier is now configured for higher availability:

- each microservice deployment runs with `replicas: 2`
- rolling updates use `maxUnavailable: 0`
- each service has a dedicated `PodDisruptionBudget`
- each service has a dedicated `HorizontalPodAutoscaler`
- pod anti-affinity prevents two replicas of the same service from landing on one node
- topology spread tries to distribute replicas across zones and nodes

Important limitation:

- `Postgres` is still a single StatefulSet pod
- `Kafka` is still a single-broker StatefulSet

So this manifest set gives you HA mainly for the application layer, not full platform HA.

For real production-grade HA, companies usually do one of these:

- use Amazon RDS Multi-AZ for Postgres
- use Amazon MSK for Kafka
- run EKS node groups across multiple AZs
- keep app deployments at 2 or more replicas, with PDBs and anti-affinity

## HPA Note

The new HPA manifests need Kubernetes `metrics-server` to be installed in the cluster.

Without `metrics-server`, the HPA objects will exist but will not scale correctly.

## What You Need To Edit

Before applying, replace placeholders in:

- `services/*/deployment.yaml`: replace all ECR image placeholders
- AWS Secrets Manager secret `production/zord/app-secrets`: set passwords, DSNs, API keys, vault keys, and S3 bucket names
- AWS Secrets Manager secret `production/zord/edge-signing-key`: set the private key
- `shared/relay-config.yaml`: replace PSP URL and relay auth tokens if needed
- `ingress/public-alb.yaml`: replace ACM certificate ARN and hostnames
- `shared/serviceaccount.yaml`: replace the IRSA IAM role ARN

## AWS Access For S3

The services that use S3 run with this Kubernetes service account:

```yaml
serviceAccountName: zord-aws-access
```

File:

```text
shared/serviceaccount.yaml
```

Create an IAM role for this service account, give it least-privilege access to the Zord S3 buckets, then add the role ARN as an IRSA annotation:

```yaml
metadata:
  name: zord-aws-access
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/<zord-app-s3-role>
```

The S3 bucket names themselves stay in AWS Secrets Manager under `production/zord/app-secrets`.

## S3 Bucket Names

S3 bucket names are not hardcoded in deployment manifests.

The services still receive the environment variable `S3_BUCKET`, but Kubernetes now loads it from the `zord-app-secrets` Secret:

| Service | AWS Secrets Manager key inside `production/zord/app-secrets` |
| --- | --- |
| `zord-edge` | `EDGE_S3_BUCKET` |
| `zord-intent-engine` | `INTENT_S3_BUCKET` |
| `zord-outcome-engine` | `OUTCOME_S3_BUCKET` |
| `zord-evidence` | `EVIDENCE_S3_BUCKET` |

Add these four keys to `production/zord/app-secrets` before deploying.

## Apply

```bash
kubectl apply -k kubernetes/eks
```

## Public Access Model

The public ALB ingress exposes only:

```text
zordnet.com -> zord-console
```

The backend services stay private inside the cluster. Browser code should call same-origin Next.js API routes, and the `zord-console` server talks to private service DNS names such as:

- `http://zord-edge:8080`
- `http://zord-intent-engine:8083`
- `http://zord-relay:8082`
- `http://zord-outcome-engine:8081`
- `http://zord-intelligence:8089`
- `http://zord-prompt-layer:8086`

Do not expose every backend service publicly. If a public API is required later, expose only `zord-edge` behind a separate reviewed host.

## Verify

```bash
kubectl get pods -n zord
kubectl get svc -n zord
kubectl get ingress -n zord
kubectl logs -n zord deploy/zord-edge
kubectl logs -n zord deploy/zord-intelligence
```

## Repo Notes

- `zord-intelligence` did not previously have a Dockerfile, so one was added for EKS image builds.
- `zord-relay` and `zord-intelligence` now self-apply their schemas on startup instead of relying only on compose-time SQL bootstrap.
- `zord-evidence` listens on `8088`; its Dockerfile port metadata was corrected to match.
- The console still references some legacy backend surfaces that are not fully implemented in this repo, so a few pages may still need backend cleanup after deployment.
