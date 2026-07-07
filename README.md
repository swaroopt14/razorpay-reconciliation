# Arealis Zord

Arealis Zord is a multi-service ingestion and orchestration platform for financial-intent processing, evidence capture, tenant-aware operations, and downstream workflow automation.

This repository contains the backend services, the Next.js console, deployment assets, and supporting documentation used to run the platform end to end.

## Platform Overview

The current repository includes these main services:

| Component | Purpose |
| --- | --- |
| `zord-edge` | Public ingestion edge, API-key auth, webhook intake, envelope creation |
| `zord-intent-engine` | Validation, canonicalization, idempotency, intent processing |
| `zord-relay` | Event relay and dispatch workflows |
| `zord-token-enclave` | Sensitive-data tokenization and detokenization boundary |
| `zord-contracts` | Contract generation, evidence packaging, signing |
| `zord-outcome-engine` | Outcome ingestion, normalization, correlation, status handling |
| `zord-intelligence` | Policies, projections, actions, SLA-related workers |
| `zord-prompt-layer` | Retrieval and LLM-assisted query workflows |
| `zord-console` | Next.js operator, customer, and admin UI |
| `observability` | Prometheus, Grafana, Jaeger, OpenTelemetry support |

## Repository Structure

| Path | Description |
| --- | --- |
| `backend/` | Application services and local service-level docs |
| `docs/` | Architecture diagrams and design notes |
| `jenkins/` | CI/CD pipeline assets |
| `k8s-file/` | Kubernetes and Argo CD manifests |
| `docker-compose.yml` | Root multi-service local deployment |
| `DEPLOYMENT.md` | EC2 and Jenkins deployment notes |
| `DEPLOYMENT-GUIDE.md` | Additional deployment guidance |
| `SECURITY.md` | Security reporting and hardening policy |

## Quick Start

### Prerequisites

- Docker Desktop or Docker Engine with Compose
- Go 1.24.x for local Go service development
- Node.js 18+ for `zord-console`

### Start the stack from the repository root

```bash
docker-compose up -d --build
```

### Run a single backend service locally

```bash
cd backend/zord-edge
go mod download
go run ./cmd/main.go
```

### Run the console locally

```bash
cd backend/zord-console
npm install
npm run dev
```

## Main Working Areas

- `backend/zord-edge` is the main ingestion front door for API and webhook traffic.
- `backend/zord-console` contains the customer, ops, and admin UI experiences.
- `backend/README.md` documents the broader backend service landscape.
- `backend/observability` contains dashboards, collector config, and test helpers.

## Security

Read [SECURITY.md](./SECURITY.md) before using this repository in any shared or production-like environment.

In particular:

- Replace development or demo secrets before deployment.
- Review authentication and tenant-isolation behavior per service.
- Keep metrics, health, and admin surfaces off the public internet unless intentionally protected.

## Documentation

- [Root deployment notes](./DEPLOYMENT.md)
- [Detailed deployment guide](./DEPLOYMENT-GUIDE.md)
- [Backend overview](./backend/README.md)
- [Contribution guide](./CONTRIBUTING.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [Legal templates](./legal/README.md)
- [Project analysis](./PROJECT_ANALYSIS.md)
- [Vault architecture notes](./docs/development/microservice_zord_vault_architecture.md)

## Status

This repository is under active development. Some areas are production-oriented, while others are still scaffolding, mock-backed, or evolving. Treat the current code and docs as an actively changing system, and validate service-specific assumptions before deploying it to real users or live financial flows.

