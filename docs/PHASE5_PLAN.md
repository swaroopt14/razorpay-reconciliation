# Phase 5A + 5B plan

**Scope:** Settlement-line truth, bank truth, Settlement↔Bank candidates only.  
**Not this phase:** intent-batch attachment (already exists), full Payment↔Settlement↔Bank recon (Phase 6), refunds, AI.

Hard rules: Razorpay `settled` is never `bank_credited`. Do not rebuild XLSX parsers or `AttachmentEngine`. Do not call `recon.Match()` or write `payment_proof_subjects` / `fully_reconciled`.

```
Intent batch  ←already matched→  Settlement XLSX (attachment)     LEAVE ALONE

Payment (Phase 4)  ←payment_id→  Settlement lines (5A)
                                      │
                                     UTR
                                      ↓
                               Bank CREDIT (5B)
                                      ↓
                    settlement_bank_match_decisions
                    EXACT / AMBIGUOUS / CONFLICTED / UNRESOLVED / ORPHAN_BANK
                                      ↓
                         Phase 6: did the money reconcile?
```

---

## 5A — Settlement truth on the recon table

**Table:** `provider_settlement_line_observations`  
**Writers:** imports commit + API backfill upsert  
**Do not** route through `canonical_settlement_observations` or the attachment engine.

Already on the table: `settlement_id`, `entity_id`, `payment_id`, `order_id`, `settlement_utr`, `amount_minor`, `fee_minor`, `tax_minor`, `debit_minor`/`credit_minor`, `currency`, `settled`, `settled_at`, unique `(tenant_id, connector_id, settlement_id, entity_id)`.

### New migration (do not edit applied 20260902 files)

Add:

- `adjustment_minor BIGINT NOT NULL DEFAULT 0`
- `provider_status TEXT`, `canonical_status TEXT`
- `source_file TEXT`, `source_row BIGINT`, `raw_reference TEXT`
- `payment_link TEXT NOT NULL DEFAULT 'unlinked'` (`linked` | `unlinked` | `partial`)

### Neutral type + writers

Extend `NeutralSettlementLine` in `internal/poll/providers/razorpay/backfill_provider.go`.

Update:

- `internal/imports/settlement.go` `MapReconItem` — keep provider gross/fee/tax/credit; never fold adjustment into fee; use provider net (`credit_minor`) when present
- `internal/persistence/import_store.go` `upsertSettlement`
- `internal/persistence/backfill_store.go` `UpsertSettlementLine`

Line types already parsed: `payment` / `refund` / `transfer` / `adjustment`. Map only known types to `canonical_status` (`settled`, `reversed`, `adjusted`). Missing `payment_id` → accept row, `payment_link=unlinked`. Invalid amount/date/currency → row error in `import_row_results`, do not reject the whole file. Currency: 3-letter ISO; do not hardcode INR on this mapper.

**`payment_link`:** exact `payment_id` → `canonical_payments`. Missing → `unlinked`. Amounts agree → `linked`. Settlement strictly less than captured payment → `partial`. Never amount-only without `payment_id`.

### Duplicate file / row

`data_imports` already has `UNIQUE (tenant_id, import_type, file_sha256)`, but `Upload` currently **errors** on duplicate hash.

Change: second same-hash upload records/returns the import as `status=DUPLICATE`, `inserted_rows=0`. No second financial dataset.

Same `(settlement_id, entity_id)` + same `payload_hash` → no second observation. Different hash on same identity → update (existing backfill behavior).

### Tests

Extend `internal/imports/import_test.go` (and mapper tests beside it). Keep current parser tests green.

Cover: valid line; duplicate file; duplicate row; missing payment_id accepted; invalid amount/date quarantined; non-INR allowed if 3-letter; fee/tax/net preserved; adjustment not converted to fee; refund/transfer classified; partial vs Phase 4 payment.

---

## 5B — Bank truth (Edge ingress)

Do **not** use `zord-edge/services/bank_parser.go` (that is payout intents).

### Edge: `POST /v1/bank-statements`

Authenticated group (same as `/bulk-ingest` in `routes/intent_route.go`).

Multipart: `file`, `account_id`, optional `connector_id`, date window, `bank_name`/`profile`, `currency`.

1. Hash body, store via existing Edge S3 helper.
2. Persist `bank_ingest_runs` (new Edge migration): tenant, connector, account_id, filename, `file_sha256`, `storage_uri`, status `RECEIVED` | `DUPLICATE` | `FAILED`.
3. Same hash → 202 `DUPLICATE`, **no second outbox**, ingest-run still recorded.
4. Same TX: `ingress_outbox` event `bank.statement.received` (ingest_id, hash, storage_uri, tenant/connector/account — no file bytes, no secrets).
5. Return **202** `{ ingest_id, status: ACCEPTED }`. Do not parse CSV in Edge.

`GET /v1/bank-statements/:ingest_id` for status.

### Outcome-engine consume

Same dual path as observations:

- Kafka / relay on `bank.statement.received`
- `POST /internal/bank-statements/ingest` (relay token) for local tests

Parse with existing `internal/imports/bank.go` (`ParseBankCSV`, `ProfileByName`: generic + hdfc/icici/sbi). Wrap profiles in a small registry **inside imports**, not a new `internal/bank/` tree.

Keep `POST /v1/bank-statements/upload` (`OneShotBankUpload`) working. After commit, matching runs **outside** `imports` so `TestPackageDoesNotImportMatcher` stays true.

`data_imports` lifecycle: `RECEIVED` → `PARSING` → `CANONICALIZING` → `MATCHING` → `COMPLETED` | `PARTIAL` | `FAILED` | `DUPLICATE`.

### Extend `bank_transaction_observations`

New migration:

- `credit_debit TEXT` (`CREDIT` / `DEBIT`) — from credit_minor vs debit_minor; never match DEBIT to settlement net via `abs(amount)`
- `utr_raw TEXT` — keep `utr` as normalized
- `observation_identity_hash TEXT` unique when present

Keep `UNIQUE (tenant_id, account_id, row_hash)`. **Not** `UNIQUE(utr)`.

UTR normalize (safe): trim, uppercase, drop spaces/dashes; reject `-` / `n/a` / too long (existing `normalizeUTR`). Store raw + normalized. Missing UTR → row still accepted.

Update `upsertBank`, `imports.BankObservation`, `recon.BankTxn`.

Outbox: keep `bank.observation.normalized.v1`.

---

## Settlement ↔ Bank candidates only

Extract `attachBank` / `bankProven` / `bankL5` from `internal/recon/matcher.go` into `internal/recon/settlement_bank.go`. Reuse `ScoreUTRAndAmount`. Do **not** set `ProofVerified` or `ReconFullyReconciled`.

New table `settlement_bank_match_decisions`:

- `settlement_line_id`, `bank_observation_id` (nullable)
- `state`: `EXACT_MATCH` | `HIGH_CONFIDENCE` | `AMBIGUOUS` | `UNRESOLVED` | `CONFLICTED` | `VARIANCE` | `ORPHAN_BANK`
- `confidence`, `rule`, `candidates` JSONB, `evidence` JSONB

Rules:

1. Unique UTR + amount + currency + CREDIT → `EXACT_MATCH`
2. Unique UTR + amount mismatch → `CONFLICTED` / `VARIANCE`
3. No UTR: unique net + currency + date window + CREDIT → `HIGH_CONFIDENCE` (not exact)
4. Narration may raise score; never `EXACT_MATCH` from narration alone
5. Two equal candidates → `AMBIGUOUS` (both ids, no forced pick)
6. Settlement, no bank → `UNRESOLVED`
7. Bank CREDIT, no settlement → `ORPHAN_BANK` (keep the bank row)

Trigger after bank (and optionally settlement) commit via `MatchSettlementBank` — not inside `imports.Commit`.

Outbox: `bank.match.completed.v1`. Do **not** emit `reconciliation.decision.v1`.

Metrics: rows ingested/rejected/duplicates; `bank_utr_exact_matches`, `bank_ambiguous`, `bank_unresolved`, `bank_conflicted`.

---

## Integration gate

Against `zord_outcome_phase3` when `DATABASE_URL` is set:

1. Phase 4 captured payment `pay_123` / 10000
2. Settlement line same `payment_id`, UTR `UTR123`, net 9728
3. Bank CSV CREDIT 9728 + UTR123
4. Three rows queryable; decision `EXACT_MATCH`; **no** `fully_reconciled` proof row

Negatives: amounts 10000 / 9728 / 9500 preserved; settlement without bank → `UNRESOLVED`; bank without settlement → `ORPHAN_BANK`; two same-amount no-UTR banks → `AMBIGUOUS`.

---

## Docs + out of scope

Update `README.md` and `docs/PHASE_STATUS_REPORT.md` when implementation lands.

Out: intent-batch attach, five extra bank parsers, AI, Settlement Journal UI, full-chain recon, refunds.
