# Product north star — Defensibility Score + Ambiguity / Leakage split

Strategic doc. Defines (1) why Ambiguity and Leakage stay on separate pages, (2) the Defensibility Score as the product's north-star metric, and (3) the concrete build plan for each surface.

Last updated: 2026-05-11.

---

## 1. Decision: Ambiguity and Leakage are separate pages

Same root cause, different consequences, different buyers, different urgency. Mixing them on one page means neither buyer gets a clean view.

| Dimension | Ambiguity page | Leakage page |
|---|---|---|
| Primary buyer | Ops manager | CFO / Finance |
| When they look | 9am daily, during incident triage | Month-end close, board prep |
| Question they ask | "Which signals are open, which batches have conflicts?" | "How much money is this costing me, where is it going?" |
| Unit of analysis | Intents and signals (count) | Rupees (amount) |
| Action on the page | Resolve, escalate, replay | Quantify, attribute, forecast |
| Cadence of value | Hourly relevance | Monthly relevance |

**Build implication:** keep the existing `AmbiguityLeakageSurface` split into two distinct surfaces. The current single surface conflates ops and finance perspectives — split it.

---

## 2. The Defensibility Score — Zord's north-star metric

> *"Of all the money your business moved this period — X% is cryptographically proven. Y% is not."*

A single number. Expressed as a percentage. Computed at the tenant level, the batch level, and the intent level.

### Why this earns money

Every enterprise — marketplace, NBFC, B2B SaaS, gig platform, bank — has money moving every day. None of them know what percentage of it is actually *provable*. They assume it's fine. It's not. The gap between what they think is settled and what is actually defensible is where all the risk lives:
- Disputes they'll lose
- Capital they can't release
- Regulators they can't satisfy
- Audit findings they can't answer

### Why only Zord can produce this number

Three things have to live in one system to compute the score:
1. **Canonical intent** (what the business intended to pay)
2. **Signal fusion** (PSP push + poll + bank statement + carrier reference reconciliation)
3. **Merkle certificate** (cryptographic anchor of the evidence pack)

No other product holds all three. That's the moat.

### Sales motion this unlocks

The free audit doesn't show "reconciliation gaps." It shows the prospect's **Defensibility Score for the last 90 days** — a number they've never seen before, a number that immediately translates to a ₹ exposure.

CFO sees `94.3% defensible, 5.7% exposed` → two questions, both answered by Zord:
1. "What does that 5.7% cost me?" → routes to **Leakage page**
2. "How do I close it?" → routes to **Recommendations**

### Retention mechanism (compounding score)

| Month | Score | Value created |
|---|---|---|
| Month 1 | 91.2% | baseline |
| Month 3 | 94.8% | ₹18 L exposure closed |
| Month 6 | 97.1% | 11/11 disputes won, ₹34 L capital released |

Renewal conversation is just showing this graph. Nobody cancels something that is measurably making their business more certain every month.

### The one-line product truth

> *"Zord is the only infrastructure that tells you exactly how defensible your payments are — and closes the gap."*

Works for a marketplace ops manager, an NBFC compliance officer, a fintech CTO, and a GCC payments CEO. Same sentence. Different reasons it resonates.

---

## 3. Where the Defensibility Score lives in the product

The score is the **anchor** of every surface. It's not buried on one page — it threads through everything.

| Surface | How the score appears |
|---|---|
| **HomeSurface** | **Hero number** at the top. The single biggest element on the page. Color-coded (green ≥95, amber 80–95, red <80). |
| **EvidenceSurface** | Hero stat (already wired). Per-pack score in the packs table. Tier badge (`EXCELLENT/GOOD/FAIR/POOR`). |
| **IntentJournalSurface** | Per-batch defensibility column in the sidebar list. Replaces the current "Dispatch Confidence" label on the right pane. |
| **Leakage page** | Companion stat: "₹X.Y L exposed = (100 − defensibility) × intended_volume." Direct ₹ translation of the gap. |
| **Ambiguity page** | The remediable subset: "Of your X% exposure, Y% is closable today by resolving these signals." |
| **Intent Journal / intelligence recs** | Each recommendation can show: "Apply this → defensibility +N.N pts." Quantifies the lift. |
| **BillingSurface** | "This month: defensibility improved 91.2% → 94.8% (+3.6 pts). ₹18 L exposure closed." Renewal anchor. |
| **Audit / export** | Defensibility certificate downloadable per period. Becomes the document the customer hands to their auditor. |

---

## 4. Build plan — Ambiguity page (ops-focused, NEW)

Split from the current `AmbiguityLeakageSurface`. Rename the existing file to `LeakageSurface.tsx`, create new `AmbiguitySurface.tsx`.

### Page structure (top → bottom)

1. **Hero strip** (3 stats)
   - Open signals count: `ambiguous_intent_count` (KPI 7)
   - Ambiguity rate: `ambiguity_rate * 100` (KPI 8)
   - Average attachment confidence: `avg_attachment_confidence * 100` (KPI 9)

2. **"Triage now" panel** — actionable queue
   - List of unresolved intents grouped by failure stage (Validation / Dispatch / Processing / Settlement)
   - Each row: reason code, age, owner, action button (Replay / Escalate / Dismiss)
   - Source: **new endpoint G** (per-intent enrichment) + `/api/prod/dlq`

3. **Root-cause breakdown** (3 small cards)
   - Provider-ref missing rate: `provider_ref_missing_rate` (KPI 10)
   - Carrier completeness: derived from per-intent `mapping_uncertain_flag`
   - Duplicate-risk rate: derived from per-intent `idempotency.duplicate_risk_flag`

4. **By-connector / By-rail / By-amount-band tables** — same as today but pulling from **endpoint group A**

5. **Defensibility tie-in footer**
   - *"Resolving these N signals would lift your defensibility from 91.2% to 93.8%."*
   - Pulled from a new endpoint that simulates the score lift (stretch — defer to v2)

### Endpoints needed
- ✅ `/v1/intelligence/dashboard/ambiguity` (live)
- 🛑 **A** — by-connector / by-rail / by-amount-band breakdowns
- 🛑 **G** — per-intent enrichment for the triage queue
- 🛑 **D** — recommendations contracts (for "Apply rule" actions)

### Build sequence
1. Frontend: extract current ambiguity-relevant cards from `AmbiguityLeakageSurface` into `AmbiguitySurface.tsx`. Wire hero (already have hook).
2. Backend ships endpoint G → frontend wires triage queue.
3. Backend ships endpoint A → frontend wires breakdowns.
4. Backend ships endpoint D → frontend wires recommendations.

---

## 5. Build plan — Leakage page (CFO-focused, NEW)

Same source file split. The existing `AmbiguityLeakageSurface.tsx` becomes `LeakageSurface.tsx` after extraction.

### Page structure (top → bottom)

1. **Defensibility Score hero** — the big number (94.3%)
   - Sub-text: `(100 - defensibility) × total_intended_amount_minor` shown as ₹ exposure
   - Delta vs prior period: "+1.4 pts this month"
   - Color: tier-based (green/amber/red)

2. **Where the exposure is — 4 buckets**
   - Unmatched (KPI 2): `unmatched_amount_minor`
   - Under-settled (KPI 3): `under_settlement_amount_minor`
   - Reversal exposure (KPI 5): `reversal_exposure_minor`
   - Orphan settlements (KPI 4): `orphan_amount_minor` — informational only, not in leakage %

3. **Leakage trend chart** — last 6 months
   - X-axis: month
   - Y-axis: ₹ exposure
   - Stacked: unmatched / under-settled / reversal
   - Needs **new timeseries endpoint** (extension of B)

4. **"What Zord closed" — ROI proof**
   - 3 stats: ambiguity closed (₹), disputes won (count), capital released (₹)
   - Source: **endpoint E**

5. **By corridor** (reuse "By connector" / "By rail" tables from endpoint A but show **₹ exposure**, not ambiguity-rate)

6. **CFO actions** — exportable PDF: "Defensibility certificate · period MM-YYYY"
   - Needs **new endpoint**: `GET /v1/intelligence/exports/defensibility-certificate?tenant_id=…&period=…` → PDF stream

### Endpoints needed
- ✅ `/v1/intelligence/dashboard/leakage` (live)
- ✅ `/v1/intelligence/dashboard/defensibility` (live)
- 🛑 **E** — ROI summary
- 🛑 **A** (reuse) — by-corridor ₹ breakdowns
- 🛑 New: leakage timeseries by month
- 🛑 New: PDF export route

---

## 6. Build plan — Defensibility certificate (the artifact)

The downloadable thing a CFO hands to their auditor. Differentiator no other product can produce.

### Contents of the PDF

1. **Cover page**
   - Tenant name + period
   - Defensibility Score (big number)
   - Tier badge
   - Signed by Zord (Ed25519 signature, visible)

2. **Score breakdown**
   - Evidence pack rate (KPI 11)
   - Governance coverage (KPI 12)
   - Replayability (KPI 13)
   - Audit-ready % / Dispute-ready %

3. **Exposure summary**
   - Total intended volume
   - Defensible portion (₹ + %)
   - Exposed portion (₹ + %) — broken down by category

4. **Period-over-period delta**
   - Last 3 months of scores
   - "Closed this period: ₹X by Zord"

5. **Replay verification instructions**
   - Merkle root for the period
   - Hash chain root
   - Instructions for third-party verification

### Build sequence
1. Backend: design the cert generator service. Reuse defensibility + leakage + replayability endpoints.
2. Frontend: download button on Leakage page + BillingSurface.
3. Frontend: render in-app preview before download.

---

## 7. Sprint priorities (post-Phase-2)

**Sprint A — Ambiguity / Leakage split** (frontend-only, ~2 days)
- Rename `AmbiguityLeakageSurface.tsx` → `LeakageSurface.tsx`
- Extract ambiguity-relevant cards into new `AmbiguitySurface.tsx`
- Update nav / routes / surfaces index
- Defensibility hero on Leakage page (no new endpoint — defensibility already wired)
- ROI strip kept as canned placeholder until endpoint E lands

**Sprint B — Defensibility score as universal hero** (frontend-only, ~1 day)
- Add the score as a top-strip on HomeSurface (no new endpoint)
- Add per-batch defensibility column in IntentJournal sidebar (uses pattern endpoint per batch)
- Surface defensibility lift on recommendation cards where intelligence returns deltas

**Sprint C — Backend unblocks** (parallel)
- Endpoints A, D, E, G (highest ROI — touches Ambiguity, Recommendations, ROI strip, Triage queue)
- New: leakage timeseries by month
- New: defensibility certificate PDF export

**Sprint D — Long tail** (after demo)
- Endpoints B, C, F, H, I from `next-iteration-gaps.md`
- All other static surfaces (Billing, Workspace, Systems, etc.)

---

## 8. Open questions for product

1. **Defensibility tiers** — current API returns `EXCELLENT / GOOD / FAIR / POOR`. Do we want to publish the cut-off thresholds (e.g. EXCELLENT ≥97) so CFOs can target a tier?
2. **Audit certificate** — quarterly or monthly? Both?
3. **Free audit hook** — how do we onboard a tenant just for the 90-day defensibility lookup without full integration? Sandbox mode probably; needs a new "audit-only" tenant tier.
4. **Score weighting** — defensibility is currently a fixed-weight composite (§4.5 of KPI doc). Do we expose the weights to large customers so they can argue for adjustments based on their regulator?
5. **Ambiguity vs Leakage cross-link** — Should the Leakage page have a "Drill into open signals →" CTA that deep-links to the Ambiguity triage queue, filtered to the corridor in question?

---

## 9. Anti-pattern to avoid

> Do not turn the Defensibility Score into a feature toggle, a settings page, or a configuration screen.

It is a **measurement**, not a setting. The customer doesn't configure it — they earn it. Every product surface either shows it, increases it, or explains why it dropped.

If a PM ever proposes "Defensibility Settings" — the answer is no. The score is read-only at the customer level. Only Zord's signal fusion changes it.
