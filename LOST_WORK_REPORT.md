# Lost local work report — 3 Sep 2026

**Verdict:** the last session’s ingest + Optimizer drawer work was **never committed and never pushed**. After the Mac restart, `/tmp/razorpay-reconciliation` was wiped. GitHub does **not** contain it.

Durable clone (GitHub only): `/Users/swaroopthakare/hackthon/razorpay-reconciliation`

---

## What happened

1. The working tree lived at `/tmp/razorpay-reconciliation` (same path as `/private/tmp/razorpay-reconciliation`).
2. All last-session edits were **uncommitted**.
3. macOS emptied `/tmp` on reboot.
4. Time Machine was not configured. Cursor history kept only two snapshots (`razopay detaild from there docs.md` and a `.env`), not the source tree.

---

## What GitHub still has (not lost)

Remote: `https://github.com/swaroopt14/razorpay-reconciliation.git`

| Ref | HEAD | Notes |
|---|---|---|
| `origin/main` | `52c7afad` | Phase 2 Razorpay webhook ingestion |
| `origin/feat/new-feature` | `5b0d77b6` | 7 commits ahead of main (~30k insertions): IMPLEMENTATION.md, phases 4/6/8, connector/webhook/backfill, settlement amount sync |

Those 7 commits **do not** include the Optimizer drawer, `FinanceSurface`, smoke `finance.js`, or Retry-After header handling.

On `feat/new-feature` today:

- `Retry-After` is **set in a test** and mentioned in docs; `client.go` **does not read** the header (only `maxRetryAfter` backoff).
- No `PaymentDrawer.tsx`, `FinanceSurface.tsx`, `optimizer_recon.go`, `finance.js`.
- No symbol `optimizer_settlement_unobserved` or `EncodeSettlementCursor`.

---

## What was built locally and is **not** on GitHub

This is the work from the plan **“Ingest robustness, then Optimizer-honest payment drawer”**. All six todos were implemented in `/tmp` and then lost.

### Constraints that were in force (do not reverse these when rebuilding)

- Do **not** clone Razorpay Transactions tabs. Dock `grid` stays the payout intent journal. The drawer lives on **Finance ops**.
- Do **not** invent an Optimizer recon REST API. Optimizer Single View is a **Dashboard download**. Combined `/settlements/recon/combined` is Razorpay’s own join table only.
- Do **not** compare `payment.amount` to `settlement.amount` 1:1.

---

### Tier 2 — ingest (lost)

#### 2a. Honor `Retry-After` on 429

**Files:** `backend/zord-outcome-engine/internal/poll/providers/razorpay/client.go`, `client_test.go`

**What GitHub has:** 429 is retryable; delay capped at 30s; tests *set* `Retry-After: 1` but `doRaw` never reads it.

**What was implemented and lost:**

- Parse `Retry-After` as seconds **or** HTTP-date (`parseRetryAfter`).
- Wait `max(computedBackoff, retryAfter)` capped at 30s.
- Pagination stayed sequential (no concurrent batches).
- Test `Test429HonorsRetryAfterOverBackoff`: 429 + `Retry-After: 1` waits ~1s, not 250ms.

#### 2b. Refund backfill job window

**Files:** `refunds.go`, `backfill_provider.go`, `backfill_service.go`, `backfill_service_test.go`

**What GitHub has:** `ListRefundsPage` only sends `skip`/`count`; paginate walks the whole account.

**What was lost:**

- Pass `from`/`to` UNIX seconds (same as payments).
- Thread `job.WindowFrom` / `job.WindowTo` through `RefundsProvider` and `BackfillAdapter.ListRefundsPage`.
- Fakes/tests assert the query includes the window.

#### 2c. Settlement cursor is day-local

**Files:** `backfill_service.go`, `backfill_window.go` (new helpers), `backfill_service_test.go`

**What GitHub has:** API uses a local `daySkip`, but persisted `cursor.PageSkip` is a running total across days. Resume restarts at day one (data not corrupted; job re-fetches).

**What was lost:**

- `EncodeSettlementCursor` / `DecodeSettlementCursor` as `YYYY-MM-DD:<daySkip>` in `last_provider_id`.
- `PageSkip` is day-local; resume continues the same civil day at that skip, then advances days.
- Test: two-day window, fail after day 1 page 1; resume must **not** re-fetch day 1 page 0 as the only progress signal.

---

### Tier 4 — attribution (lost)

#### 4a. Payment API fields already in DB

**Files:** `internal/recon/financial.go` (`PaymentFact`), `internal/persistence/financial_store.go` (`toPaymentFact`), `handlers/financial_handler.go` (`GetPayment`), `financial_handler_contract_test.go`, `backend/payout-smoke-simulator/src/finance.js`

**What GitHub has:** `canonical_payments` columns `method`, `order_id`, `provider`, `provider_created_at`. Facts and GET JSON drop them. Smoke `finance.js` **does not exist** on GitHub.

**What was lost:**

GET payment JSON keys:

- `method`
- `order_id`
- `provider` (connector name, e.g. `razorpay` — **not** Optimizer “Processed by”)
- `provider_created_at` (unix or null)
- `notes` (map; empty object if nil)

Smoke catalogue: every payment object got `paymentFields()` (`method`, `order_id`, `provider`, `provider_created_at`, `notes`). Two miss rows became Optimizer-unobserved (`pay_smoke_miss_001` netbanking/`billdesk_optimizer`, `pay_smoke_miss_002` upi/`paytm_pg`). Hold rows had `processed_by: payu_optimizer`.

`canonical_payments` still has **no notes column**; notes were in-memory / smoke / `NeutralPayment` only.

#### 4b. Honest Optimizer gap + file ingest

**Reasoning (lost):**

After 48h settlement cycle with **no** combined-recon payment row:

- Razorpay-settled → keep `captured_missing_settlement`
- Method/notes look Optimizer (`optimizer`, `billdesk_optimizer`, `paytm_`, `payu_`) → **`optimizer_settlement_unobserved`** (still `UNRESOLVED`)
- Inside 48h → still `awaiting_settlement_cycle` even if Optimizer-routed
- Unknown capture time → no grace (already the rule)

Helper: `LooksLikeOptimizerRouting(PaymentFact)`.

**File ingest (lost):**

- Import type `optimizer_recon_import`
- `ParseOptimizerRecon` for Dashboard CSV **or** XLSX (excelize first sheet → CSV)
- Default missing `type` → `payment`; missing `entity_id` → copy `payment_id`
- Header aliases: `Payment Id`, `Settlement Id`, `On Hold`, `UTR`, etc.
- Upsert settlement lines with `source=optimizer_recon_import`, `source_file` = filename
- `on_hold` / `dispute_id` / `order_receipt` written on import upsert
- Honest message: combined Razorpay recon does not cover Optimizer-settled traffic
- Upload detection: filename contains `optimizer` + `.csv`/`.xlsx`, or `import_type=optimizer_recon_import`
- Testdata: `testdata/razorpay/settlements/optimizer_single_view.csv`

**Agent copy (lost):**

- Investigate `ClassifyReason` → `MISSING_SETTLEMENT`; `Recommend` → **MONITOR** (do not chase bank UTR)
- `BuildPlan` omits `search_bank_transactions`
- Hypotheses: combined recon will not contain this row until Single View upload
- Ask Zord limitation: *Optimizer Single View recon report was not uploaded. Combined recon will not contain this row. Do not invent MATCHED.*
- Glossary `exception_reasons.md` entry
- Smoke `INVESTIGATION_COPY` + Ask limitations for the same reason
- Deterministic investigation root cause/recommendation in `exceptions.go`

---

### Tier 5 — Finance ops payment drawer (lost)

**New file:** `backend/zord-console/src/features/payout-command/finance/PaymentDrawer.tsx`

**Changed:** `FinanceSurface.tsx` (removed two `<pre>` JSON dumps), `FinanceExceptionsTable.tsx` (add `optimizer_settlement_unobserved` to gap reasons)

**Behaviour:**

- Fixed right-hand aside (same pattern as connector intelligence), `data-testid="finance-payment-drawer"`
- Keep `PaymentLifecycleStrip`
- Open from exceptions `onOpen` and `?dock=finance&entity_id=`
- No `pay_*` grid; exceptions stay the work queue
- No new Transactions dock

Labeled fields:

| Label | Source |
|---|---|
| Payment Id | `payment_id` |
| Amount | `fmtMinor(amount_minor)` |
| Status | `provider_status` **never renamed** |
| Refunds | `/refunds` list, or “No refunds issued yet” |
| Payment method | `method` |
| Gateway / Processed by | notes `processed_by` / similar, else method if Optimizer-like, else `not_in_this_phase` |
| Created At | `provider_created_at` |
| Description / notes | notes map |
| Settlement pill | see below |

Pills:

- `settlement_on_hold` → **Under Review**
- `awaiting_settlement_cycle` → pending
- `captured_missing_settlement` / `optimizer_settlement_unobserved` → missing
- `MATCHED` + `bank_credit_proven` → processed

View Details scrolls to `#finance-settlement-details` (line id, UTR if present, on_hold, fee/tax, ledger lines). No Razorpay settlement deep-link.

---

## Wider finance ops layer also missing from GitHub

The `/tmp` dirty tree already had a **Finance ops** surface that is **not** on `feat/new-feature`. That was uncommitted before the Optimizer plan and is also gone. Reconstruct from git status + this chat:

Untracked / modified in `/tmp` and **absent on GitHub** (confirmed missing files):

- `backend/zord-console/src/features/payout-command/surfaces/FinanceSurface.tsx`
- `backend/payout-smoke-simulator/src/finance.js`
- `backend/zord-console/app/api/prod/finance/[...path]/route.ts` and `_shared.ts` (may or may not exist on feat — treat as rebuild if missing)
- Finance helpers: `FinanceExceptionsTable.tsx`, `LifecycleStrip.tsx`, `financeFetch.ts`
- Surfaces: `ReportsSurface.tsx`, `SignalsSurface.tsx` (present in `/tmp` git status as untracked)

Related recon honesty that was in the same uncommitted `/tmp` tree (verify against `feat/new-feature` before rewriting):

- `on_hold` on settlement lines → reason `settlement_on_hold` (not `settlement_without_bank`)
- `splitLines` treats transfer/adjustment as “other” (not `duplicate_settlement`)
- Captured, no recon row, inside 48h → `awaiting_settlement_cycle`; past window → `captured_missing_settlement`; unknown capture time → no grace
- `redactError` skips empty needles; redacts live key env vars

If any of that already landed in the 7 `feat/new-feature` commits, **do not duplicate**. Check the branch first.

---

## Tests that were green locally (`make test`) and are now gone

- Razorpay client 429 + Retry-After wait
- Refunds query includes `from`/`to`
- Settlement resume across days
- GetPayment JSON contract includes method/order_id/provider/notes
- Recon: Optimizer-routed missing settlement → `optimizer_settlement_unobserved`
- Optimizer still waits inside 48h
- Import: Optimizer CSV maps payment id + on_hold; XLSX parse; commit does not invent MATCHED
- Investigate: Classify/Recommend MONITOR; plan does not search bank txns
- `./internal/imports/...` added to the Makefile `test` target

---

## Ops / demo notes (also lost)

- Console `.env.local` (gitignored): `SMOKE_SIMULATOR_URL=http://localhost:8099`, settlement API key `zord-local-dev-api-key`, `AUTH_COOKIE_SECURE=false`, `ZORD_CONNECTOR_ID=conn_smoke_razorpay`
- Smoke login accepts any email; **password minLength is 8** (`password1` works)
- Sign-in page has **no company name** field on this checkout
- Dev server was on **:3001** because :3000 belonged to `~/hackthon/zord-smoke-simulator-main`
- Disk-full (`ENOSPC`) broke Next compile after login; npm cache was later cleared

---

## How to rebuild (order)

1. Open **`/Users/swaroopthakare/hackthon/razorpay-reconciliation`** (never `/tmp`).
2. Branch from `origin/feat/new-feature` (it already has phases 4/6/8).
3. Re-implement the plan in this order: Retry-After → refund window → settlement cursor → payment JSON fields → Optimizer reason + file ingest → Finance drawer.
4. Commit and push **before** another reboot.

The plan file still exists in Cursor: `~/.cursor/plans/ingest_optimizer_drawer_8977a88b.plan.md`.
