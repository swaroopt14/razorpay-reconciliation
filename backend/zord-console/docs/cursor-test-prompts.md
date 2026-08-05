# Cursor test harness — 4 carryover tasks

Self-contained prompts you can paste into Cursor (Opus 4.7) one at a time, then grade the
output against the success criteria below.

Cursor will auto-load [`.cursorrules`](../../../.cursorrules) on every session. These prompts
are designed to be **abstract enough to test the model's planning intelligence**, but
**specific enough that a correctly-operating agent should succeed**.

How to use:
1. Open a fresh Cursor chat in this repo.
2. Paste the **"Brief"** section verbatim — that's all the user-facing context the model gets.
3. Watch for the **Expected behavior** checklist. The model should hit most of those before
   writing code.
4. After it's done, grade against **Success criteria**.

---

## Task 1 — Ambiguity page split (Sprint A, frontend-only)

### Brief

> Read `docs/product-north-star.md` and `docs/next-iteration-gaps.md §I.5`.
>
> Start Sprint A from the north-star plan: split the current `AmbiguityLeakageSurface` into
> two separate surfaces — `AmbiguitySurface` (ops-focused) and `LeakageSurface` (CFO-focused).
> Frontend only. The Ambiguity page is partially backend-blocked (5 fields missing per §I.5);
> wire what's available, leave the rest with the `LiveDataHint` "demo data" pill.
>
> Don't touch any other surface. End with a test plan.

### Context Cursor should pull (first 5 mins)

- [ ] `docs/product-north-star.md` §4 (Ambiguity page build plan) + §5 (Leakage page build plan)
- [ ] `docs/next-iteration-gaps.md §I.5` (which ambiguity fields are present vs missing)
- [ ] `app/payout-command-view/today/_components/surfaces/AmbiguityLeakageSurface.tsx` (current state)
- [ ] `app/payout-command-view/today/_components/surfaces/index.ts` (export barrel)
- [ ] `services/payout-command/prod-api/intelligenceTypes.ts` (which fields exist on the endpoint)
- [ ] `services/payout-command/model.ts` — `dockItems` array (does it have separate entries for
      ambiguity and leakage, or just one combined?)

### Expected behavior

Before writing code, the model should:
- [ ] Confirm whether `dockItems` has one entry or two. If one, it must propose either adding
      a second entry **or** routing both surfaces under one dock ID with a sub-tab.
- [ ] Ask a multi-choice question about navigation: keep one combined dock entry with internal
      tabs, OR add a second dock entry for the new surface.
- [ ] Surface that 5 ambiguity KPIs are backend-blocked and the new `AmbiguitySurface` will
      ship partial — confirm acceptable.
- [ ] List which file moves / creates / deletes will happen, in order.

Then execute:
- [ ] Rename or split `AmbiguityLeakageSurface.tsx` → `LeakageSurface.tsx` (CFO content)
- [ ] Create new `AmbiguitySurface.tsx` (ops content + triage queue + breakdown)
- [ ] Update `surfaces/index.ts` exports
- [ ] Update `dockItems` (if model + user agreed to two entries)
- [ ] Update `PayoutCommandViewClient.tsx` to route the new surface
- [ ] Run `npx tsc --noEmit` after each file. No new errors beyond preexisting.

### Success criteria

- ✅ Two surfaces render at separate dock IDs (or tabs) and don't share JSX
- ✅ Leakage hero shows: leakage % + risk tier (KPI 6), Trapped capital (KPI 3),
     Dispute exposure (KPI 4 from ambiguity endpoint), Reversal exposure (KPI 8),
     Orphan strip (KPI 6) — same as current state, just on the new file
- ✅ Ambiguity surface shows: `ambiguous_intent_count` (hero), `ambiguity_rate`,
     `avg_attachment_confidence`, `provider_ref_missing_rate` (these 4 ARE in the API today)
- ✅ Ambiguity surface displays `LiveDataHint` amber pill for sections that need the 5
     missing KPIs (`ambiguous_amount_rate`, `low_confidence_attachment_rate`,
     `candidate_collision_rate`, `carrier_completeness_rate`, `ambiguity_severity`)
- ✅ Type-check passes (only preexisting errors)
- ✅ End-of-task summary includes file:line links + 4-step test plan

### What good output looks like

Cursor's final message should look something like this:

> **What changed**
> - Renamed [AmbiguityLeakageSurface.tsx → LeakageSurface.tsx](backend/...) — CFO content kept as-is
> - Created [AmbiguitySurface.tsx](backend/...) — 3 hero stats + triage queue placeholder
> - Updated [surfaces/index.ts](backend/...) + [dockItems in model.ts](backend/...)
> - Wired the new surface into [PayoutCommandViewClient.tsx](backend/...)
>
> **Test plan**
> 1. `npm run dev`, navigate to `/payout-command-view/today`
> 2. Click the new "Ambiguity" dock item — confirm 3 live KPI stats render
> 3. Click "Leakage" — confirm hero + 3 buckets + orphan strip render
> 4. With a tenant that has no events, both pages should fall back to canned text + amber pill
>
> **Skipped**
> - 5 ambiguity KPIs blocked by backend (§I.5) — surfaced with `LiveDataHint`

### Grading rubric (out of 10)

| Criterion | Points |
|---|---|
| Read both docs before coding | 2 |
| Asked clarifying question about navigation | 1 |
| Listed file moves before executing | 1 |
| Type-checked after each file | 1 |
| New surfaces are clean splits (no shared JSX/state leak) | 2 |
| Used existing patterns (`useSessionTenantId`, `useIntelligenceKpis`, `LiveDataHint`) | 1 |
| Ended with structured summary + file:line links | 1 |
| No new TS errors beyond preexisting | 1 |

---

## Task 2 — Ambiguity page: wire the 5 missing KPIs (backend + frontend)

### Brief

> Read `docs/next-iteration-gaps.md §I.5` carefully.
>
> The 5 ambiguity KPIs we need are: `ambiguous_amount_rate`, `low_confidence_attachment_rate`,
> `candidate_collision_rate`, `carrier_completeness_rate`, `ambiguity_severity`. They aren't
> in the current `/v1/intelligence/dashboard/ambiguity` response.
>
> I'm OK with backend changes for this one. Add the 5 fields to the backend response (use
> placeholder values for now — e.g. compute from existing fields or hardcode reasonable
> stubs), update the frontend type, and wire them into `AmbiguitySurface` (or
> `AmbiguityLeakageSurface` if Task 1 hasn't run yet).
>
> Don't ship a database migration. These are derived/computed in the handler.

### Context Cursor should pull

- [ ] `docs/next-iteration-gaps.md §I.5` — the 5 fields + their semantic meaning
- [ ] Where the intelligence service lives — find the Go handler that returns the ambiguity
      dashboard. It's likely under `backend/zord-intelligence/` or wherever the `:8089` service
      is implemented (Cursor will need to find this).
- [ ] `services/payout-command/prod-api/intelligenceTypes.ts` — `AmbiguityKpiResolved` type
- [ ] `app/api/prod/intelligence/ambiguity/route.ts` — proxy (no change needed unless type
      passthrough matters)

### Expected behavior

Before writing code:
- [ ] Find the actual Go handler. **If it's not in this repo** (the service might live elsewhere),
      explicitly say so and stop. Don't invent a path.
- [ ] Once found, propose how each of the 5 fields will be derived. For example:
  - `ambiguous_amount_rate` = `value_at_risk_minor / total_attached_amount_minor` (if we have it)
  - `ambiguity_severity` = composite of `ambiguity_rate × 0.25 + ...` per the doc
  - For ones with no derivation possible, return `0.0` with a comment that it's a placeholder.
- [ ] Ask whether to ship placeholder values vs wait for real derivation logic.

Then execute:
- [ ] Backend: add 5 fields to the handler response + return placeholder values
- [ ] Frontend: extend `AmbiguityKpiResolved` type with the 5 fields
- [ ] Frontend: render the new fields on the Ambiguity surface (replace amber `LiveDataHint`
      with live values)
- [ ] `go build ./...` for backend, `npx tsc --noEmit` for frontend
- [ ] Update `docs/next-iteration-gaps.md §I.5` to mark the 5 fields ✅ (now present, placeholder).

### Success criteria

- ✅ Backend response now contains all 5 new fields (verify with `curl localhost:8089/v1/intelligence/dashboard/ambiguity?tenant_id=…`)
- ✅ TS type matches the new shape
- ✅ Ambiguity surface renders the 5 new stats (or charts), no `LiveDataHint` amber pill
- ✅ Each placeholder is commented in the Go handler with what would compute it for real
- ✅ Type-check + Go build both clean
- ✅ Gap doc updated

### What to watch for

- **The model invents a Go file path that doesn't exist.** Push back hard. The handler must be
  found, not imagined.
- **The model hardcodes 0.0 for all 5 fields without thinking.** Some are derivable today
  (e.g. `ambiguous_amount_rate` from existing volume fields). Push for derivation where possible.
- **The model forgets to update the gap doc.** Persistent memory hygiene matters.

---

## Task 3 — Buttons audit: full remediation

### Brief

> Read `docs/buttons-audit.md`. Do a full pass on the 182 buttons in `/payout-command-view`.
>
> For each button: either wire it to a real handler, or remove it. No more "looks like it
> works but doesn't" surfaces.
>
> Suggested order: ConnectorIntelligence (already partially done) → HomeSurface →
> IntentJournalSurface → settings/{api-keys,account} → batch-command-center filter chips →
> the rest of `today/_components`.
>
> Update `buttons-audit.md` as you go so the doc reflects reality at the end.

### Context Cursor should pull

- [ ] `docs/buttons-audit.md` — the inventory and known dead patterns
- [ ] Each surface file as you work through it (don't try to load all 34 at once)

### Expected behavior

Before starting:
- [ ] Estimate hours. Doc says ~4–6 hours. Confirm the user has time, or propose a
      time-boxed subset.
- [ ] Propose ordering by **visibility / blast radius**, not just file size. ConnectorIntelligence
      and HomeSurface are most-seen; settings are least-seen.
- [ ] Ask which to remove vs which to wire — different decisions for different buttons.

For each button (the inner loop):
- [ ] Identify the button (line + label)
- [ ] Trace its onClick. Does it call a real function? Does the function actually do something?
- [ ] Classify: ✅ works | ⚠️ dummy | 🛑 broken
- [ ] For broken/dummy: either wire to a real action (preferred) or remove + delete dead code.
- [ ] No "marked disabled with title='coming soon'" placeholders. Either it works or it's gone.

After each surface:
- [ ] Update `buttons-audit.md` — move that surface from "❓ unverified" to a status list
- [ ] Commit (or stage) — don't batch a 4-hour change into one commit.

### Success criteria

- ✅ All 182 buttons accounted for in the audit doc, none ❓
- ✅ No button rendered in `/payout-command-view` that does nothing when clicked
- ✅ `firePrompt`-style no-op pattern eliminated (either wired to a real AskZord registration
     or buttons removed)
- ✅ Each surface diff is independently reviewable
- ✅ `npx tsc --noEmit` and `npm run build` both clean

### What to watch for

- **The model wires every button to `console.info` and calls it done.** Push back — that's the
  same anti-pattern we just got rid of. A logged button is still a dead button to the user.
- **The model removes a button without checking whether it was a critical entry point.** Each
  removal should be justified in the commit message / audit doc.
- **The model doesn't update the audit doc.** Hygiene rule.

### Stretch

If the model finishes in <4 hours, ask it to also audit `/customer/*`, `/admin/*`, `/ops/*`.
Different scope, separate session probably.

---

## Task 4 — Fix the two preexisting type errors on main

### Brief

> There are two type errors on `main` that I've been ignoring as preexisting. Fix them.
>
> Error 1: `app/payout-command-view/today/_components/PayoutCommandViewClient.tsx` —
> `'Quarter'` is compared to `HomeTimeframe` which has no `'Quarter'` variant. Also
> `setTimeframe('Quarter')` is called. Something is out of sync between the union and the
> usage.
>
> Error 2: `ProofSurface.tsx` — Recharts `Tooltip formatter` signature changed; our callbacks return
> `[string, string]` or `[number, string]` but the new Formatter type expects something else.
>
> Both are real fixes (no `@ts-ignore`). End with both errors gone from the type-check output.

### Context Cursor should pull

- [ ] `app/payout-command-view/today/_components/PayoutCommandViewClient.tsx` line ~87
- [ ] `services/payout-command/model.ts` — find the `HomeTimeframe` type definition + see
      what variants exist
- [ ] `app/payout-command-view/today/_components/surfaces/ProofSurface.tsx` lines ~142 and ~225
- [ ] `node_modules/recharts/types/component/Tooltip.d.ts` — actual Formatter signature

### Expected behavior

Before fixing:
- [ ] Baseline the errors with `git stash --include-untracked && npx tsc --noEmit ... | tee
      /tmp/baseline.txt && git stash pop` to confirm these are the ONLY ones to fix.
- [ ] For Error 1: decide whether to add `'Quarter'` to the `HomeTimeframe` union (forward
      compatible) or remove the `setTimeframe('Quarter')` call (cleaner but might break UI).
      Ask the user.
- [ ] For Error 2: read the Recharts type and write a compatible formatter signature. Don't
      cast with `as` unless absolutely necessary.

Then fix:
- [ ] Edit the union OR the call site (per user's answer)
- [ ] Update each Recharts formatter to match the type — likely `(value, name, item, index, payload) => ReactNode | [ReactNode, ReactNode]`
- [ ] `npx tsc --noEmit` — confirm both errors gone, no new ones introduced

### Success criteria

- ✅ Both errors removed from `npx tsc --noEmit` output
- ✅ No new errors introduced
- ✅ No `@ts-ignore` / `@ts-expect-error` / `as any` used
- ✅ Charts still render correctly (smoke-test in browser)
- ✅ Diff is small and targeted (< 30 lines total across all three files)

### What to watch for

- **The model uses `as any` to silence the Recharts error.** That's a fail.
- **The model rewrites the entire chart instead of just fixing the formatter.** Scope discipline.
- **The model doesn't smoke-test the chart visually.** Type-passing isn't the same as
  rendering-correctly. Recharts tooltip behavior should still show the right values.

---

## Cross-task grading: how well is Cursor working?

After running 2+ of these tasks, score Cursor's behavior on these axes:

| Axis | What good looks like |
|---|---|
| **Reads context first** | Pulls 5+ relevant files before writing code |
| **Asks at the right time** | Asks 1–2 multi-choice questions on architectural decisions, nothing else |
| **Scope discipline** | Diff is tight, matches the task, doesn't refactor unrelated code |
| **Type-check hygiene** | Runs `tsc --noEmit` after each file, baselines preexisting errors |
| **Reuses existing patterns** | Uses `useSessionTenantId`, `useIntelligenceKpis`, `LiveDataHint` correctly |
| **End-of-task summary** | Has the 4 sections: what changed / test plan / skipped / next |
| **Updates docs** | Modifies `buttons-audit.md` / `next-iteration-gaps.md` when work invalidates them |
| **Pushes back when wrong** | If the user gives a bad instruction, says so with evidence |

If Cursor scores ≥ 6/8 on a task, the `.cursorrules` is working. If it scores ≤ 4, either:
- The task brief is unclear → tighten the brief
- The model isn't loading `.cursorrules` → check Cursor settings (Settings → General → Rules
  for AI → ensure project rules are enabled)
- The model needs more § references → add explicit "Read `.cursorrules §X` first" to the brief

---

## Tips for running these in Cursor

1. **Start each task in a fresh chat.** Cursor's context window fills up; old context degrades.

2. **Reference `.cursorrules` in the brief if the model isn't following it.** Add:
   *"Before doing anything, read `.cursorrules` and confirm you understand §1 (the working loop)
   and §10 (end-of-task summary format)."*

3. **Use Cursor's "Composer" mode** for multi-file changes. Inline edits are for single-file
   touch-ups.

4. **Watch the file context Cursor pulls.** If it's not pulling the right files automatically,
   `@` mention them in the chat: `@docs/next-iteration-gaps.md`, `@.cursorrules`.

5. **If the model is stalling, the rules file is too long.** Trim `.cursorrules` to the
   essentials and move the rest into separate docs the model can `@` mention.
