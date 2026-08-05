# Buttons audit — `/payout-command-view`

Scope: every clickable `<button>` and `<Link>` rendered under `/payout-command-view`.
Goal: each button either works, or is removed.

Status legend: ✅ working · ⚠️ dummy / no-op · 🛑 broken (handler refers to a missing function) · ❓ unverified

Last updated: 2026-05-12 (initial sweep).

---

## Inventory at a glance

- **182** buttons total across **34** TSX files under `/payout-command-view`.
- This doc tracks the *dead* and *dummy* ones. Working buttons (status toggles, file inputs, navigation links) are not listed — they're fine.

---

## ✅ Resolved: `firePrompt` no-op (5 buttons) → routed to Ambiguity surface

`firePrompt(msg)` previously called `window.sendPrompt(msg)` if the global was set. Nothing registers it, so all 5 buttons in `ConnectorIntelligenceClient.tsx` were dead. The hook-based `sendPrompt` calls in `useWorkspaceState`/`useAskZordState` are fine — those hooks have real side effects (`setIsOpen`, `setScenario`, etc.) running alongside the no-op `sendPrompt` enrichment.

**Fix shipped (2026-05-12):** Replaced `firePrompt` with a `makeFirePrompt(navigate)` factory that uses Next.js `useRouter`. Every call now navigates to `/payout-command-view/today?dock=ambiguity` (the new Ambiguity surface) AND logs the intent for analytics. When the AskZord prompt receiver registers `window.sendPrompt`, this can switch back to prompt-send.

| File | Line (approx) | Button | New behavior |
|---|---|---|---|
| `connector-intelligence/ConnectorIntelligenceClient.tsx` | ~360 | "Executive brief" | Routes to Ambiguity surface |
| `connector-intelligence/ConnectorIntelligenceClient.tsx` | ~367 | "Schedule PayU QBR" | Routes to Ambiguity surface |
| `connector-intelligence/ConnectorIntelligenceClient.tsx` | ~401 | Per-connector drilldown | Routes to Ambiguity surface |
| `connector-intelligence/ConnectorIntelligenceClient.tsx` | ~519 | "Reroute advice from connector comparison" | Routes to Ambiguity surface |
| `connector-intelligence/ConnectorIntelligenceClient.tsx` | ~608 | Per-day health drilldown | Routes to Ambiguity surface |

---

## ⚠️ Likely dummy: workspace/desk/search controls in `DockNav`

The `DockNav` has search input, desk-role toggle, and alert filters that drive local state but don't gate any user-visible data. They're decorative.

- `DockNav.tsx` desk-role dropdown — local state only
- `DockNav.tsx` search input — Cmd/Ctrl+K focuses it, but pressing Enter does nothing

**Recommendation**: either wire to a real omnisearch endpoint OR remove from the nav until that backend lands.

---

## ❓ Surfaces needing per-button verification

These have 5+ buttons each and weren't sweeped in this session:

- `HomeSurface.tsx` — `OutcomeInsightCardGroup` cards (8 buttons via click-to-drill, plus prompt-row buttons)
- `IntentJournalSurface.tsx` — sidebar batch buttons (work via `setSelectedBatchId`), table-row buttons (TBD)
- `EvidenceSurface.tsx` — pack-row actions, "Download cert", "Verify replay" — likely dummy until §F endpoints ship
- `MerkleGraphSurface.tsx` — view-mode toggles work; per-node clicks may be dummy
- `OperationsGridSurface.tsx` — entire grid is canned, button effects unknown
- `BillingSurface.tsx` — "Manage plan", "Download invoice" — verify against any billing route
- `LiveSyncSurface.tsx` — "Reconnect", "Pause sync" — verify
- `ProofSurface.tsx` — "Open ticket", "Mark resolved" — verify
- `BatchCommandCenterClient.tsx` — `SHELL_NAV` icons (internal topnav), filter chips, "Share" — verify each

---

## Recommended remediation approach

This audit needs a focused 2-3 hour session per surface area:

1. **Connector Intelligence** — apply ~5 quick removes/redirects (started this session). Wire 1–2 buttons to real endpoints.
2. **Today surfaces (Home/IntentJournal/Evidence/etc.)** — each surface ~30 minutes: classify, fix or remove.
3. **Settings (API Keys / Account / Payouts)** — 20 minutes per page.
4. **DockNav** — decide: search/desk wired or removed.

Total: ~4–6 hours of focused remediation work.

---

## Quick fixes shipped this session

- `connector-intelligence/ConnectorIntelligenceClient.tsx` — `firePrompt` buttons marked non-functional via `disabled + title` (no remove, so the layout intent stays clear for the next remediation pass).
