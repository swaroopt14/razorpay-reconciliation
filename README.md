<div align="center">

<img src="docs/assets/mark.svg" width="64" height="64" alt="Razorpay Reconciliation" />

# Razorpay Reconciliation

**Match Razorpay settlements to bank cash. Prove the exceptions.**

Ingest events and files · reconcile a batch · cite evidence

Razorpay `settled` is never `bank_credited`

<br/>

[![Go](https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Razorpay](https://img.shields.io/badge/Razorpay-Test%20Mode-072654?style=flat-square)](https://razorpay.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=flat-square)](./LICENSE)

</div>

---

## Problem

Banks, Razorpay, and internal ledgers each hold a different version of the same payment. Finance teams reconcile that gap in spreadsheets. Matches get forced. Settled is treated as cash received. Exceptions have no evidence trail.

This project closes one loop on a batch of records:

1. Ingest Razorpay payments, settlements, and bank statements
2. Reconcile with confidence — never coerce `AMBIGUOUS` into `MATCHED`
3. Report match rate and the exceptions that could not be resolved
4. Let an agent explain or investigate using tools, not invented amounts

---

## How reconciliation works

| Source | What it is | What it is not |
|---|---|---|
| Razorpay payment (`authorized` / `captured` / `failed`) | Provider lifecycle | Bank cash |
| Razorpay `settled` | PSP marked the payment settled | Money in the merchant account |
| Settlement file / recon API | Line-level fees, tax, net | Bank CREDIT |
| Bank statement CREDIT / DEBIT | Observed cash movement | Razorpay status rename |

`MATCHED` means the books are accounted for. It is not `fully_reconciled` and not `bank_credited`. Failed payments with no settlement and no bank movement are `MATCHED` (nothing moved). Unexplained bank CREDIT/DEBIT is `UNRESOLVED` plus an exception.

---

## System Architecture

Razorpay is a first-class source. Webhooks and the Payments API land as observations. **relay** moves those events between services. **recon** reduces them to canonical payments, matches settlement lines to bank rows, then runs payment-first financial recon. **evidence** hashes the decision. **intel** projects the batch. **agents** read those APIs — they do not re-score UTR or rename Razorpay status.

Folders match the job names. **recon** is only the matching engine. **relay** is communication. **evidence** is cryptographic proof.

```mermaid
flowchart TB
    subgraph razorpay [Razorpay Test Mode]
        API["Payments / settlements REST"]
        WH["Signed webhooks"]
        Files["Settlement + bank files"]
    end

    subgraph ingest [Ingestion]
        Edge["edge<br/>HMAC webhooks, bank upload"]
        ReconIn["recon<br/>Razorpay client + backfill"]
    end

    subgraph bus [Communication]
        Relay["relay<br/>Kafka topics + KRaft quorum<br/>no ZooKeeper"]
    end

    subgraph match [Reconciliation]
        Canonical["Canonical payments and payouts"]
        SettleBank["Settlement ↔ bank candidates"]
        Finance["MATCHED / AMBIGUOUS / UNRESOLVED"]
    end

    subgraph proof [Proof]
        Evidence["evidence<br/>SHA-256 item hashes<br/>Merkle root + ed25519 signature"]
    end

    subgraph explain [Explain]
        Intel["intel + ml<br/>leakage, ambiguity, SLA"]
        Agents["agents<br/>Ask · Investigate · Briefing"]
        Console["console"]
    end

    API --> ReconIn
    WH --> Edge
    Files --> Edge
    Edge --> Relay
    ReconIn --> Relay
    Relay --> Canonical
    Canonical --> SettleBank
    SettleBank --> Finance
    Finance --> Evidence
    Finance --> Intel
    Finance --> Agents
    Evidence --> Console
    Intel --> Console
    Agents --> Console
```

**Relay is not proof.** It is the event bus: Kafka topics, three KRaft brokers (each node is broker + controller, no ZooKeeper). Services publish and consume; a Kafka offset is not a match receipt.

**Evidence is proof.** After recon decides `MATCHED` / `AMBIGUOUS` / `UNRESOLVED`, evidence builds a pack: SHA-256 over each item, a Merkle root over those hashes, then an ed25519 signature over `pack_id + merkle_root + …`. Replay regenerates the pack and checks it still matches.

| Folder | Job |
|---|---|
| **console** | Frontend |
| **edge** | Webhooks, file upload |
| **relay** | Kafka + KRaft communication |
| **intents** | Canonical instructions |
| **recon** | Razorpay client, match, exceptions |
| **evidence** | Cryptographic proof packs |
| **intel** | Leakage, ambiguity, SLA |
| **ml** | Anomaly / leakage scores |
| **agents** | Ask, investigate, briefing |
| **vault** | PII tokens |
| **scheduler** | Backfill jobs |

**Data path**

1. **Connect** — Razorpay Test Mode key, HMAC webhook, optional payments API backfill
2. **Observe** — immutable `provider.observation.received` events on **relay** (Kafka + KRaft); Razorpay status stored as `provider_status`
3. **Canonicalize** — one current `canonical_payments` row; status never walks backwards (`captured` is not overwritten by a late `authorized`)
4. **Match settlement to bank** — candidates only (`EXACT_MATCH` … `ORPHAN_BANK`); this step does not mark cash received
5. **Reconcile** — `POST /v1/reconciliation/run` on payments and payouts; exceptions stay honest
6. **Explain** — Ask copies numbers from APIs; the investigation agent walks exceptions with a tool budget

---

## Intelligence and agents

Deterministic recon owns the numbers. The model only writes prose.

| Capability | Where | Role |
|---|---|---|
| Leakage, ambiguity, defensibility, RCA, pattern, SLA | intel + ml | Project the batch; CatBoost / z-score / HDBSCAN never invent a match |
| Ask | agents | Finance Q&A with citations. Rejects numeric and status hallucinations |
| Investigation | agents | Hypothesis loop on exceptions. Cannot force `MATCHED` or assign `PROVEN` |
| Finance investigator | agents | Walk one payment or payout through recon + evidence tools |
| Close briefing | agents | Rewrite match rate, exceptions, and exposure without adding figures |

Hard rules: `settled` ≠ `bank_credited`. `UNKNOWN` is first-class. `AMBIGUOUS` is never coerced.

Console: `/ask` and `/investigations`.

---

## Key Features

- Razorpay Test/Live client, signed webhooks, and payments API backfill
- Canonical payment and payout truth that preserves native Razorpay status names
- Settlement and bank file ingest with duplicate-file detection
- Payment-first recon with match rate, exception list, and evaluation on 100+ labeled records
- Evidence packs: SHA-256 item hashes, Merkle root, ed25519 signature, replay check
- Ask and investigation agents over HTTP tools (no second matcher)
- Multi-tenant isolation, DLQ, and PII tokenization

---

## Repository Structure

```
razorpay-reconciliation/
├── backend/
│   ├── console/                 # frontend
│   ├── edge/                    # webhooks, bank upload
│   ├── relay/                   # Kafka + KRaft bus
│   ├── intents/                 # canonical instructions
│   ├── recon/                   # Razorpay client, match, exceptions
│   ├── evidence/                # SHA-256 / Merkle / ed25519 packs
│   ├── intel/                   # batch projections
│   ├── agents/                  # Ask, investigate, briefing
│   ├── vault/                   # PII tokens
│   ├── ml/                      # leakage / anomaly scores
│   └── scheduler/               # backfill jobs
├── testdata/razorpay/           # Settlement and bank fixtures
├── docs/                        # Implementation notes
├── functional-tests/
└── performance-tests/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Go 1.24, TypeScript, Python 3.11 |
| APIs | Gin, Next.js 14, FastAPI |
| Data | PostgreSQL 16, Kafka (KRaft), Redis |
| Razorpay | Test Mode REST + webhook HMAC |
| Agents | Go HTTP tools; Gemini for wording only |
| ML | scikit-learn, CatBoost, HDBSCAN |

---

## Getting Started

### Prerequisites

Docker Desktop, Go 1.24, Node.js 18+, npm 9+.

```bash
git clone https://github.com/swaroopt14/razorpay-reconciliation.git
cd razorpay-reconciliation
```

### Console

```bash
cd backend/console
npm install
npm run dev
```

Open http://localhost:3000

### Razorpay engine tests

```bash
cd backend/recon
go test ./internal/poll/providers/razorpay/ ./internal/paymenttruth/ \
  ./internal/poll/ ./internal/observe/ ./internal/recon/ ./handlers/ -count=1

cd backend/edge
go test ./validator ./services ./handler -count=1

cd backend/agents
go test ./agents/askzord/ ./agents/investigate/ ./agents/finance/ ./tools/ -count=1
```

### Evaluation harness

```bash
cd backend/recon
go test ./internal/recon/eval/ -count=1
go run ./cmd/phase11-eval
```

Reports precision, recall, F1, match rate, false-match rate, and exception capture on 100+ labeled payment / payout / orphan records.

---

## Configuration

Copy `.env.example` to `.env` in each service directory you run.

| Variable | Description |
|---|---|
| `RAZORPAY_ENABLED` | Enable the connector (`true` / `false`) |
| `RAZORPAY_MODE` | `test` or `live` |
| `RAZORPAY_API_BASE_URL` | Razorpay API base URL |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Test Mode credentials (gitignored) |
| `JWT_SIGNING_SECRET` | Console / API JWT |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | PostgreSQL |

Live keys are refused unless explicitly allowed. Webhook signatures are verified over the raw body; invalid HMAC stores nothing.

---

## Core APIs

**Connect and ingest**

| Method | Endpoint |
|---|---|
| `POST` | `/v1/connectors/razorpay` |
| `GET` | `/v1/connectors/razorpay/status` |
| `POST` | `/v1/webhooks/razorpay/:connectorID` |
| `POST` | `/v1/bank-statements` |
| `POST` | `/v1/settlement/upload` |

**Reconcile**

| Method | Endpoint |
|---|---|
| `POST` | `/v1/reconciliation/run` |
| `GET` | `/v1/reconciliation/summary` |
| `GET` | `/v1/reconciliation/exceptions` |
| `GET` | `/v1/reconciliation/payments/:payment_id` |
| `GET` | `/v1/reconciliation/payouts/:payout_id` |

**Agents**

| Method | Endpoint |
|---|---|
| `POST` | `/v1/ask-zord/finance/query` |
| `POST` | `/v1/investigations` |
| `GET` | `/v1/investigations/:id` |
| `GET` | `/v1/investigations/:id/trace` |

```bash
curl -X POST http://localhost:8086/v1/ask-zord/finance/query \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"<uuid>","query":"What is the match rate and which exceptions remain?"}'
```

---

## Security

| Layer | Implementation |
|---|---|
| Auth | JWT, per-tenant API keys |
| Razorpay | Basic Auth, HMAC webhooks, redacted logs |
| PII | Token enclave, format-preserving encryption |
| Integrity | SHA-256 evidence snapshots |
| Audit | Immutable observation log and action contracts |

See [SECURITY.md](./SECURITY.md).

---

## License

MIT. See [LICENSE](./LICENSE).

Implementation notes: [docs/](./docs/).

---

## Contact

- **GitHub**: [swaroopt14](https://github.com/swaroopt14)
- **LinkedIn**: [Swaroop Thakare](https://www.linkedin.com/in/swaroop-thakare-136484259/)
