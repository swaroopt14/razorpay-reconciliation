# CON-P1-06 — Final Test Results

**Ticket:** CON-P1-06 — Normalize public BFF errors; do not leak internal upstream URLs/details  
**Priority:** P1 — High / Security & UX  
**Product:** Zord Console V1 (`backend/zord-console`)  
**Branch:** `fix/con-p1-06-normalize-bff-errors`  
**Commit:** `b7edd8f08` — `fix(console): normalize public BFF errors without upstream leaks`  
**PR:** #603 → master  
**Diff:** 14 files, +202 / −76  
**Test date:** 2026-08-12  
**Overall:** **PASS**

---

## 1. What was wrong (pre-fix)

Bulk/settlement/prompt/evidence/intelligence BFF failures returned upstream URLs (`localhost`, `host.docker.internal`, internal DNS) and raw `error.message` / `details` to the browser.

---

## 2. What we fixed

Shared `publicBffError` returns only `{ code, message, trace_id }` (+ `x-trace-id` header). Upstream URL and exception text are logged server-side as `[zord-bff]` with the same `trace_id`.

---

## 3. Scenarios tested — results

### Test 1 — Prompt-layer: no internal topology — PASS

**Setup:** `docker stop zord-prompt-layer`

**Actual:**

```http
HTTP/1.1 502 Bad Gateway
cache-control: no-store
content-type: application/json
x-trace-id: e87c6b36-36e6-47b9-aaea-d975513ab372

{"code":"UPSTREAM_UNAVAILABLE","message":"Ask Zord is temporarily unavailable. Retry shortly.","trace_id":"e87c6b36-36e6-47b9-aaea-d975513ab372"}
```

| Criterion | Result |
|-----------|--------|
| Public shape `{code,message,trace_id}` | Pass |
| `x-trace-id` matches `trace_id` | Pass |
| No localhost / host.docker.internal / zord-edge / ECONNREFUSED | Pass |
| No `upstream` URL field | Pass |

**Note on leak-check `True`:** A later PowerShell match used bare `upstream`, which also matches the **string** `UPSTREAM_UNAVAILABLE` (false positive). Safer pattern:

```powershell
$body -match 'localhost|host\.docker\.internal|zord-edge|zord-prompt|ECONNREFUSED|"upstream"'
```

With that pattern the result was **`False`**.

**Bulk-ingest attempt:** `401 UNAUTHORIZED` with fake API key — did not reach the upstream-unavailable path (auth gate first). Not required once prompt-layer already proved the normalized 502 body.

---

### Test 2A — Intelligence leakage (service down) — PASS

**Setup:** `docker stop zord-intelligence-service`

**Actual:**

```http
HTTP/1.1 200 OK
{"data_available":false,"reason":"Intelligence service is temporarily unavailable."}
```

| Criterion | Result |
|-----------|--------|
| Generic customer-facing reason | Pass |
| No internal hosts / `"upstream"` / ECONNREFUSED | Pass (`Leak check: False`) |

(KPI empty-shell path is intentional for leakage; still must not leak topology.)

---

### Test 2B — Settlement upload — PASS (no leak; business 400)

**Actual:**

```http
HTTP/1.1 400 Bad Request
{"error":"unsupported psp \"test\" — supported: cashfree, razorpay"}
```

| Criterion | Result |
|-----------|--------|
| No internal hosts in body | Pass (`Leak check: False`) |
| Hit `UPSTREAM_UNAVAILABLE` shape | Not this run (validation failed before upstream) |

To force settlement upstream miss next time, use a **supported** PSP (e.g. `cashfree` / `razorpay`) with Edge/settlement down.

---

### Test 3 — Server logs `[zord-bff]` — PASS

```powershell
docker logs zord-console --tail 100 2>&1 | Select-String "zord-bff"
```

Multiple `[zord-bff]` log lines present (ops-only; includes upstream/error with `trace_id` server-side).

---

## 4. Scorecard

| # | Scenario | Expected | Verdict |
|---|----------|----------|---------|
| 1 | Prompt-layer down | `{code,message,trace_id}` only | **PASS** |
| 1b | No topology in body | No localhost/docker DNS/ECONNREFUSED | **PASS** |
| 2A | Intelligence down | Generic message / empty KPI, no leaks | **PASS** |
| 2B | Settlement | No internal hosts | **PASS** |
| 3 | Server `[zord-bff]` logs | Present | **PASS** |

---

## 5. What this means

| Before | After |
|--------|--------|
| Customer JSON could show `upstream: http://localhost:8086/...` or `ECONNREFUSED` | Only `code` + safe `message` + `trace_id` |
| Exception text / hosts exposed topology | Internals only in server `[zord-bff]` logs |
| Harder support correlation | Match browser `trace_id` / `x-trace-id` to ops logs |

---

## 6. Why merge conflicts arose (and how we resolved them)

CON-P1-06 branched from an older `master` and edited the **same BFF route files** that later security tickets also changed. When merging into current `master`, Git could not auto-combine those overlapping edits.

### Root cause

| Factor | What happened |
|--------|----------------|
| Shared files | P1-06 touched `intelligence/[...path]`, `prompt-layer/query`, `settlement/upload` to wrap failures in `publicBffError` |
| Parallel P0/P1 landings | Meanwhile `master` received **CON-P0-05** (kill intelligence catch-all), **CON-P1-01** (CSRF / same-origin), and related auth cookie helper signature changes |
| Same lines, different intent | Both sides changed imports, error JSON, and/or the whole catch-all body — classic content conflict |

### Conflicted files

| File | Why it conflicted | Resolution (merge commit `087fad18`) |
|------|-------------------|--------------------------------------|
| `app/api/intelligence/[...path]/route.ts` | P1-06 still had a **proxy** that normalized 502s with `publicBffError`. Master **CON-P0-05** deleted the tunnel and always returns **`404 NOT_FOUND`**. | Kept **master’s hard 404** — never restore the catch-all proxy. No `publicBffError` needed here (no upstream call). |
| `app/api/prompt-layer/query/route.ts` | P1-06 swapped leaky `{details,upstream,error}` for `publicBffError`. Master still used older `resolveProxyForwardAuthorization` (client identity headers). | **First merge (`087fad18`) was incomplete** — kept publicBffError but **regressed CON-P0-04 + CON-P1-01**. Restored below. |
| `app/api/settlement/upload/route.ts` | P1-06 used `publicBffError` on upstream miss. Master added **CSRF** (`assertCookieMutationProtection`), no env API-key fallback, and `applyAuthCookies(..., req)`. | Combined: **master CSRF/session auth** + **`publicBffError`** on 502 + cookie helpers with `req`. |

### Prompt-layer regression + restore (post-merge)

Accepting “master auth + publicBffError” alone was wrong: master’s prompt-layer still forwarded browser `x-tenant-id` / `x-user-id` / `x-session-id` and had no CSRF gate.

**Restored (must keep on every future conflict):**

1. `requireSessionIdentityForProdProxy` in `resolvePayoutTenant.server.ts` (CON-P0-04)
2. Route: `assertCookieMutationProtection` → session identity → rate limit → strip body identity fields → session-derived upstream headers → **`publicBffError` only** on 4xx/502 (CON-P0-04 + P1-01 + P1-06)
3. Client `postPromptLayerQuery`: cookies + CSRF headers only — **never** send identity headers
4. Smoke: anonymous + forged headers → **401**; cross-site Origin → **403**

### Conflict-safe MERGE RULES (do not drop again)

| File | Never accept | Always keep |
|------|--------------|-------------|
| `intelligence/[...path]/route.ts` | Any upstream proxy / `publicBffError` tunnel | Hard **404 NOT_FOUND** (CON-P0-05) |
| `prompt-layer/query/route.ts` | Client identity forwarding / leaky `{upstream,error}` body / missing CSRF | CSRF + `requireSessionIdentityForProdProxy` + `publicBffError` |
| `settlement/upload/route.ts` | Env API-key fallback / leaky upstream JSON | CSRF + session auth + `publicBffError` |

Route file header comments encode the same rules so conflict editors see them in-file.

### Why GitHub still showed conflicts

Until the resolved merge was **committed and pushed**, GitHub’s PR conflict UI still showed the three files. After push of `087fad18`, leave/cancel the web conflict editor and refresh the PR — it should be mergeable.

### Lesson

Security tickets that all edit the same BFF routes should merge/rebase onto latest `master` often (or land in order: tunnel removal → session identity → CSRF → error normalization). When resolving conflicts, **combine behaviors** — never pick one ticket’s diff and discard another’s security gate.

---

## 7. Overall verdict

**CON-P1-06 — PASS** (with prompt-layer security restore)

Public BFF errors are normalized; internal upstream URLs and raw exception details are not returned to the customer body. Intelligence catch-all stays 404. Prompt-layer again enforces session identity + CSRF alongside `publicBffError`.
