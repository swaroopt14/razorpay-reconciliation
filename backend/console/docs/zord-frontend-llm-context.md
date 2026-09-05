# Zord Frontend Concept (LLM Context Guide)

This document is for engineers and AI agents working on the Zord frontend.
It explains what Zord is, what it does, what each page shows, and how to extend it safely.

## 1) What Zord Is

Zord is a payout operating layer for institutions that need **reliable payout finality, recovery, reconciliation, and audit-ready proof**.

In plain terms:
- It watches payout intent flow across PSPs and bank rails.
- It helps operators recover value when routes degrade.
- It tracks whether payouts are actually final (not just “attempted”).
- It assembles evidence needed by finance, auditors, and compliance teams.

Zord is designed for high-trust environments where “payment sent” is not enough.  
It focuses on **explaining what happened** and **proving it with evidence**.

## 2) What Zord Does

At product level, Zord does five things:

1. **Command & routing visibility**  
   Shows where routed payout value is concentrated, where lane quality is degrading, and where overflow is moving.

2. **Recovery orchestration**  
   Tracks recovery lift from rerouting and highlights pending pressure.

3. **Traceability**  
   Gives payout-level trace + references so an operator can answer “what happened to this payment?”

4. **Reconciliation & finality**  
   Surfaces reconciled vs pending vs mismatch posture across PSP/bank-confirmed records.

5. **AI intelligence on top of evidence**  
   Prompt layer answers operational questions using the same business context shown in the dashboard.

## 3) What Zord Shows (Current Frontend Surfaces)

Primary route:
- `/payout-command-view/today`

Dock surfaces in code (`DockId`):

- `home` → **Home overview**  
  High-signal snapshot for morning scan:
  - recovered payout value
  - exception handling cost
  - recovery lift vs baseline
  - insight narrative
  - trend chart with timeframe switch (Week/Month/Quarter/Year)
  - floating AI prompt bar

- `workspace` → **Payout command view**  
  Main operating workspace:
  - command scope card
  - provider posture
  - recovery intelligence
  - escalation readiness
  - AI Intelligence Layer panel (tabs + chat-like reasoning)

- `grid` → **Trace & Evidence**  
  Payment-level drilldown:
  - intent trace journal table
  - status, refs, timestamps, action paths
  - evidence-focused operations

- `sync` → **Payout Intelligence**  
  Aggregated intelligence:
  - trend and cohort behavior
  - risk concentration by rail/PSP/client bands
  - graph-heavy analytic views for concentration and anomaly spotting

- `proof` → **Failure Intelligence**  
  Error taxonomy and queue ownership:
  - top failure categories
  - queue-by-owner views (client fix / PSP fix / bank follow-up)
  - open exception depth

Additional page:
- `/payout-command-view/batch-command-center`  
  File/batch payout operations with timeline, progress, failure reasons, and row-level drilldown.

## 4) Core Product Vocabulary (Frontend-safe)

- **Intent**: business request to execute a payout.
- **Route posture**: quality and reliability condition of active lanes.
- **Recovery lift**: value recovered after reroute/retry vs baseline.
- **Pending finality**: payout not yet fully confirmed by all required signals.
- **Evidence readiness**: whether proof material is sufficient for export/audit.
- **Exception queue**: payouts needing manual or owner-specific intervention.

Use this language in UI copy.  
Avoid exposing low-level backend field names in user-facing text.

## 5) Prompt Layer Concept

The AI layer is an operator assistant, not a generic chatbot.

It should:
- answer with operational clarity
- reference business state (routing, bank lag, proof readiness, ownership)
- propose next action

It should not:
- leak internal schema names
- expose raw system internals not needed by operators
- provide ambiguous “maybe” responses when actionability is possible

## 6) Design System Intent (Current Direction)

- Typography: DM Sans / Geist / Plus Jakarta Sans style stack
- Palette: grayscale-first with restrained accent usage
- Chart posture: scan-friendly, compact labels, high contrast on active ranges
- Cards: consistent radius, spacing rhythm, minimal ornament

Design goal: **institutional control surface**, not consumer dashboard noise.

## 7) Backend Integration Shape (High Level)

Frontend expects:
- overview KPIs
- intents list/detail
- envelope list/detail
- DLQ/exception posture
- tenant/context metadata
- intelligence snapshots (risk, ambiguity, defensibility, recommendations)
- prompt-layer query response for chat panel

Detailed API mapping lives in:
- `docs/payout-command-backend-api-delivery-spec.md`

Use this file for endpoint contracts and service ownership.

## 8) What Another LLM Should Do First In This Repo

1. Read this file.
2. Read `docs/payout-command-backend-api-delivery-spec.md`.
3. Read page entry:
   - `app/payout-command-view/today/page.tsx`
4. Read surface client:
   - `app/payout-command-view/today/_components/PayoutCommandViewClient.tsx`
5. Read model/config:
   - `services/payout-command/model.ts`

Then implement feature work surface-by-surface, not by adding large monolithic TSX blocks.

## 9) Implementation Guardrails

- Keep frontend-only repos free of backend secrets/internal infra details.
- Keep UI copy business-readable and compliance-friendly.
- Prefer modular components per surface and per chart block.
- Keep simulation mode clearly separable from live API mode.
- When adding charts, ensure responsive containers have explicit height to avoid zero-size chart runtime warnings.

## 10) One-line Product Summary

Zord is a payout command center that turns fragmented payout signals into **operational decisions, financial finality, and audit-ready proof**.
