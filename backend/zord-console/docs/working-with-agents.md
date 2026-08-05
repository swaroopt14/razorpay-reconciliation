# Working with AI agents (Cursor / Claude Code)

The full operating manual for any AI agent (Cursor with Opus 4.7, Claude Code,
or other tools) lives at the **repo root**: [`.cursorrules`](../../../.cursorrules).

That file is auto-loaded by Cursor on every session, and it's the closest thing
this repo has to persistent agent memory. Read it before starting work.

## TL;DR for new sessions

1. The agent is a **consultant + builder**, not autocomplete. Give it abstract ideas;
   it will plan, ask clarifying questions, then build.
2. The agent must **read context first** — grep, find, `git log` — before writing code.
3. The agent must **type-check after every file change** and confirm no new errors
   beyond the known preexisting ones.
4. The agent ends every task with a **tight summary** containing what changed
   (with file:line links), a 2–4 step test plan, and any deferred work.

## Update protocol

When you teach the agent something the next session needs, add it to `.cursorrules`
(usually under §9 institutional memory, or extending a relevant section).

## Related decision docs

- [`product-north-star.md`](./product-north-star.md) — Defensibility Score north-star,
  Ambiguity / Leakage page split plan.
- [`next-iteration-gaps.md`](./next-iteration-gaps.md) — backend ↔ frontend handoff
  status, missing endpoints, gap audit.
- [`buttons-audit.md`](./buttons-audit.md) — dead/dummy button inventory,
  remediation plan.
- [`frontend-backend-integration.md`](./frontend-backend-integration.md) — canonical KPI
  doc (§8.1–8.6 numbering).
