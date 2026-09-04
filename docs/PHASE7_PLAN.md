# Phase 7 — Evidence, Provenance & Auditability

**Status:** implemented in `backend/zord-evidence/internal/finance/`, outcome-engine emit, and prompt-layer HTTP tools. Merkle/ed25519 intent packs were not reused.

**Locked definition:** Build an immutable, provenance-aware evidence layer that captures the authoritative source records, financial links, deterministic calculations, reconciliation decisions, agent findings, and system actions behind every exception and investigation. Generate a reproducible **Evidence Pack** for each investigation, enforce evidence-backed agent conclusions, preserve `UNKNOWN` when the evidence is insufficient, and provide integrity and tenant-isolation verification.

Phase 6 already answers **what happened to the money**. Phase 7 answers **can we prove why the system reached that conclusion?**

```text
Phase 6 determines financial truth.
Phase 7 proves financial truth.
Agent investigates / narrates. It cannot become the calculator or the ledger.
```

This clone only. Reuse [`backend/zord-evidence/`](backend/zord-evidence/). No new microservice. No LangGraph / MCP. Tools stay HTTP (same pattern as Phase 6B). Do not rebuild the existing intent Merkle / ed25519 pack path; do not turn this phase into blockchain, PDF dispute, or a Finance Controller UI.

---

## What already exists vs what Phase 7 adds

| Already there | Phase 7 adds |
|---|---|
| Phase 4–6B canonical payments/payouts, settlement lines, bank rows | Evidence **references** to those records (do not copy the whole row) |
| Phase 6 `evidence_refs` JSON on results/exceptions | Materialized evidence rows + **minimal immutable snapshots** of the fields used at decision time |
| Phase 5 `settlement_bank_match_decisions` + candidate IDs | Decision trace that **keeps rejected candidates** |
| Deterministic amounts / `variance_amount` | Machine-readable `calculation_trace` (formula + inputs + output) |
| Prompt-layer finance graph + `get_evidence` IDs | Pack + audit + verify; agent still cannot invent IDs |
| `zord-evidence` Merkle packs for **intent/payout-command** leaves | A **finance** evidence pack for recon/investigation. Existing Merkle/signing stays later / unused for this path |

Hard rules that still hold: Razorpay `settled` is never `bank_credited`. `MATCHED` ≠ `fully_reconciled` ≠ `bank_credited`. Razorpay status is never renamed. Agent inference **never overrides** authoritative evidence. Financial impact is copied from structured calculation, not LLM math.

---

## Architecture

```text
                    FINANCIAL SOURCES (canonical, already stored)
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
     Payment            Settlement          Bank
     Payout             Refund line         (ledger later)
        └──────────────────┼──────────────────┘
                           ↓
                 Phase 6 Reconciliation + Investigation
                           ↓
              ┌────────────────────────┐
              │       PHASE 7          │
              │ 1. Source evidence     │
              │ 2. Provenance          │
              │ 3. Decision + calc     │
              │ 4. Audit trail         │
              │ 5. Integrity (SHA-256) │
              └────────────┬───────────┘
                           ↓
                    Finance Evidence Pack
                           ↓
                     Ask Zord / UI (Phase 8+)
```

Four concepts stay **separate** (do not collapse them into one “audit log”):

| Layer | Question | Example |
|---|---|---|
| **Evidence** | What proves the claim? | `pay_123`, bank `txn_456`, webhook `evt_789` |
| **Provenance** | Where did that information come from? | Razorpay API / webhook, observation id, `sha256:…`, `observed_at` |
| **Decision + calculation trace** | How did observations become a result? | Rule `failed_with_bank_movement` true; settlement/refund false; variance = bank amount |
| **Audit trail** | Who/what did what, when? | SYSTEM ran recon; AGENT searched bank; SYSTEM sealed pack |

---

## 1. Evidence ≠ copy of the source

Do **not** dump the full provider payload or the whole canonical row into evidence.

Each evidence item is a **pointer** plus a **minimal snapshot** of the fields the decision actually used (so Day-3 settlement appearing later cannot rewrite Day-1’s investigation).

```json
{
  "evidence_id": "ev_001",
  "entity_type": "payment",
  "entity_id": "pay_123",
  "evidence_type": "PAYMENT_RECORD",
  "source_type": "razorpay_payment",
  "source_id": "canonical_payments.id",
  "source_hash": "sha256:abc…",
  "observed_at": "2026-09-03T00:02:12Z",
  "role": "PRIMARY",
  "authority": "AUTHORITATIVE",
  "snapshot": {
    "payment_id": "pay_123",
    "amount_minor": 10000,
    "currency": "INR",
    "status": "failed"
  }
}
```

Once attached to a completed investigation: **immutable**. A later observation creates a **new** evidence row, never a silent UPDATE.

### Authority (hard rule)

```text
AUTHORITATIVE  →  Razorpay / webhook / settlement file / bank row
DERIVED        →  variance, expected net, match score (code only)
INFERRED       →  agent narrative / recommendation
```

Agent inference cannot override AUTHORITATIVE records or DERIVED amounts. Missing tool result → `UNKNOWN`, never invent a bank/payout/settlement row. Ledger / refund API stay `source_not_in_this_phase` until those phases exist; evidence types may be reserved, not faked.

### Controlled vocabularies

`evidence_type`: `PAYMENT_RECORD` | `PAYOUT_RECORD` | `SETTLEMENT_RECORD` | `BANK_TRANSACTION` | `WEBHOOK_EVENT` | `REFUND_LINE` | `RECONCILIATION_RESULT` | `MATCH_DECISION` | `CALCULATION` | `AGENT_FINDING` | `ABSENT_SEARCH` (settlement/refund/bank searched, none returned).

`source_type`: `razorpay_payment` | `razorpay_payout` | `razorpay_webhook` | `settlement` | `bank` | `reconciliation` | `investigation`.

`role`: `PRIMARY` | `CORROBORATING` | `CONTRADICTING` | `DERIVED` | `CALCULATION_INPUT` | `CALCULATION_OUTPUT` | `MATCH_EVIDENCE` | `DECISION_EVIDENCE`.

`finding_certainty`: `PROVEN` | `LIKELY` | `POSSIBLE` | `UNKNOWN`. Do not force a root cause.

---

## 2. Decision trace + rejected candidates

Do not store only `result = UNRESOLVED`. Store **which rules ran** and **which candidates lost**.

```json
{
  "decision": "UNRESOLVED",
  "reason": "failed_with_bank_movement",
  "rules": [
    {"rule": "FAILED_LIKE", "result": true},
    {"rule": "BANK_MOVEMENT", "result": true},
    {"rule": "SETTLEMENT_FOUND", "result": false},
    {"rule": "REFUND_LINE_FOUND", "result": false}
  ]
}
```

For AMBIGUOUS / Phase 5 candidates, **retain losers**:

```text
Settlement A  EXACT_PAYMENT_ID   1.00  selected
Settlement B  DATE_WINDOW        0.74  rejected
```

That is the proof that the engine **refused to force MATCHED**. Re-run the same snapshot → same decision (100% reproducibility).

Phase 6 already has `candidate_ids` and Phase 5 decision rows. Phase 7 freezes that rationale; it does **not** re-score UTR or call `recon.Match()`.

---

## 3. Calculation trace

Dedicated `calculation_trace`. The LLM is not the calculator.

```json
{
  "formula": "gross - fee - tax + adjustment",
  "inputs": {"gross": 10000, "fee": 200, "tax": 36, "adjustment": 0},
  "output": 9764,
  "actual": 9500,
  "variance": 264,
  "currency": "INR"
}
```

Failed + unexplained bank movement: impact = structured bank amount (already `variance_amount` in Phase 6). Pack copies it; agent does not recompute it.

Confidence is evidence-aware (not a bare float):

```json
{
  "confidence": 0.82,
  "basis": ["bank_movement_found", "settlement_missing", "refund_missing"],
  "uncertainty": ["bank_row_does_not_identify_payment"]
}
```

---

## 4. Audit trail + correlation

Separate table from evidence.

```text
actor_type: SYSTEM | AGENT | USER | PROVIDER
action:     RECON_RUN | INVESTIGATION_STARTED | TOOL_CALLED |
            EVIDENCE_ATTACHED | PACK_SEALED | VERIFY
```

`correlation_id` = recon run id (or investigation id). Trace: ingest → recon → exception → investigation → pack.

Idempotency: `(tenant_id, event_id)` / `(tenant_id, source_type, source_id, source_hash)` so Kafka replay does not duplicate evidence.

---

## 5. Finance Evidence Pack (the Phase 7 artifact)

One pack per investigation (or per exception if no investigation). This is what Ask Zord / a future UI consume — not 20 raw tables.

```json
{
  "pack_id": "fpack_…",
  "entity": {"type": "payment", "id": "pay_123"},
  "financial_position": {
    "status": "failed",
    "reconciliation": "UNRESOLVED",
    "reason": "failed_with_bank_movement",
    "exposure_minor": 10000
  },
  "source_evidence": [],
  "absent": ["SETTLEMENT_RECORD", "REFUND_LINE"],
  "calculations": [],
  "matching_decision": {},
  "investigation": {
    "root_cause": "UNKNOWN",
    "certainty": "UNKNOWN",
    "confidence": 0.82,
    "recommendation": "REQUEST_REVIEW"
  },
  "audit_trail": [],
  "integrity": {"algorithm": "SHA-256", "status": "VALID"}
}
```

Demo shape (failed payment + bank, no settlement/refund):

```text
Razorpay status     failed          (unchanged)
Reconciliation      UNRESOLVED
Exposure            ₹10,000         (copied variance)
Payment / webhook   ✓
Bank movement       ✓
Settlement/refund   ✗
Root cause          UNKNOWN
Integrity           VERIFIED
```

Completion guard: an investigation is `COMPLETED` only if finding + structured impact + existing evidence IDs + no integrity conflict. Otherwise `INVESTIGATION_INCOMPLETE`.

---

## 6. Integrity (v1 only)

```text
canonical snapshot JSON  →  SHA-256  →  snapshot_hash
verify: recompute == stored  →  VALID | INVALID
missing source               →  UNKNOWN (not invented)
```

Merkle trees, pack signatures, dispute PDF, tamper-evident hash chains: **later**. `zord-evidence` already has Merkle/ed25519 for intent packs; do not wire finance packs through that leaf set this phase.

Tenant isolation is enforced in the repository (`tenant_id` + `entity_id`). Prompt text is not a security boundary. Test: tenant A requesting tenant B evidence → denied.

---

## 7. Where the code lives

Reuse `zord-evidence`. Add a **finance** package beside the existing intent-pack code. Do not invent a second deployable. Do not rewrite `RequiredLeafTypes` / 14-leaf intent packs.

```text
backend/zord-evidence/
  internal/finance/          # new
    models, repository, service, handlers, consumers
  db/migrations/
    20260903*_phase7_finance_evidence.sql
```

Outcome-engine keeps producing `reconciliation.decision.v1` and investigation rows. Phase 7 **consumes** those (outbox / Kafka), idempotently. Prompt-layer adds HTTP tools only:

```text
get_evidence              (already; keep)
get_evidence_pack
get_decision_trace
get_calculation_trace
get_audit_trail
verify_evidence
get_source_snapshot
```

Still stub: `get_ledger_entry`. No MCP facade (Phase 9). Agent cannot mint evidence IDs; IDs come from tool JSON.

Suggested read APIs (JWT, tenant-scoped):

```text
GET  /v1/finance-evidence/:entityType/:entityID
GET  /v1/finance-evidence/:evidenceID
POST /v1/finance-evidence/:evidenceID/verify
GET  /v1/finance-evidence/packs/:investigationID
GET  /v1/finance-evidence/:entityType/:entityID/audit
GET  /v1/finance-evidence/:entityType/:entityID/decisions
GET  /v1/finance-evidence/:entityType/:entityID/calculations
```

No public mutation APIs. Creates happen from recon/investigation consumers.

---

## 8. Tables (logical)

New tables (names can be prefixed `finance_` to avoid colliding with `evidence_packs` / `evidence_items`):

| Table | Purpose |
|---|---|
| `finance_evidence` | Pointer + role + authority + hashes + timestamps |
| `finance_evidence_snapshots` | Minimal immutable field snapshot + `snapshot_hash` |
| `finance_evidence_links` | Graph: payment→webhook, payment→bank, etc. |
| `finance_calculation_traces` | Formula / inputs / output / variance |
| `finance_decision_traces` | Rules + candidates + selected/rejected |
| `finance_investigation_evidence` | investigation_id ↔ evidence_id + role |
| `finance_audit_events` | Actor / action / before/after / correlation_id |
| `finance_evidence_packs` | Sealed pack document + pack hash |

Every row: `tenant_id`. Indexes: `(tenant_id, entity_type, entity_id)`, `(tenant_id, source_type, source_id)`, unique identity on `(tenant_id, source_type, source_id, source_hash)` for idempotency.

---

## 9. Tests (definition of done)

Outcome-engine / evidence:

- Payment, payout, settlement, bank, webhook, and **absent-search** evidence created from Phase 6 refs (not invented)
- Duplicate Kafka / run is idempotent
- Snapshot hash VALID; mutated snapshot INVALID; missing source UNKNOWN
- Rejected AMBIGUOUS candidates retained; re-run same snapshot → same decision
- Calculation output equals structured `variance_amount` / expected net
- Tenant A cannot read tenant B

Prompt-layer:

- Tool none → must not claim settlement/bank/payout exists
- Cannot cite a fabricated evidence ID
- Cannot turn `UNKNOWN` into `PROVEN` or AMBIGUOUS into MATCHED
- Cannot change Razorpay `status`
- Impact equals structured calculation

Do **not** require live RazorpayX, live ledger, or refund API rows. Fixtures only.

---

## 10. Success metrics (when implemented)

| Metric | Target |
|---|---|
| Exceptions with complete evidence refs | ≥ 99% |
| Evidence with source id + type + timestamp + hash | 100% |
| Same snapshot → same decision | 100% |
| Agent conclusions without valid evidence | 0% |
| Cross-tenant leakage | 0 |

---

## Explicitly out of Phase 7

- Merkle / ed25519 finance packs, blockchain, PDF dispute export
- New agent service, LangGraph, MCP
- Ledger service / refund `refund.*` webhooks (types reserved; sources not faked)
- Finance Controller UI / React proof chips
- Ask Zord RAG changes (Phase 8; consume packs later)
- Payout-risk prediction (Phase 10)
- Editing applied `20260902*` goose files

---

## End-to-end lock (demo)

```text
pay_123  ₹10,000  status=failed
Settlement: none    Refund line: none    Bank: ₹10,000 CREDIT

Phase 6  →  UNRESOLVED + failed_with_bank_movement + impact 10000
Agent    →  tools in order → root_cause UNKNOWN (movement proven, why not)
Phase 7  →  E1 payment snapshot  E2 failed webhook  E3 bank
            E4/E5 absent settlement/refund
            D1 rule trace  C1 exposure=10000
            pack hash VERIFIED
```

That is the Finance Controller artifact: **Phase 6 finds the break. Phase 7 proves the break. Phase 8 can ask about it.**
