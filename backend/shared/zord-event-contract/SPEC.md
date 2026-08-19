# Event/schema version contract (INT-07)

This is the checked-in source of truth for the `event_version` and `schema_version` fields
carried on every cross-service event in this system (`zord-intent-engine` → `zord-relay` →
`zord-outcome-engine` / `zord-intelligence`). It exists because these three services are
independent Go modules with no shared import path — see "Why not a shared Go package" below.

## What these fields mean

- `event_version` — the version of the event envelope/routing contract for a given
  `event_type` (e.g. `intent.created.v1`).
- `schema_version` — the version of the payload schema carried inside the event.

Today there is no separate minor-version axis: a full event_type string (e.g.
`intent.created.v1`) already carries its own `vN` suffix, and `event_version`/`schema_version`
are the flat compatibility unit for the envelope and payload shape respectively.

## Canonical values (current)

```json
{
  "event_version_v1": "v1",
  "schema_version_v1": "v1"
}
```

See `spec.json` in this directory for the machine-readable copy. Both fields use the same
representation (`"v1"`) — prior to INT-07, `event_version` was inconsistently `"1"` while
`schema_version` was `"v1"`, which is exactly the vocabulary drift this ticket eliminated.

## Compatibility policy

**Unsupported or unrecognized `event_version`/`schema_version` values are never coerced to the
latest known version — they are rejected.** Concretely, per service:

- **zord-relay**: `worker/route_guard.go`'s strict allow-list does an exact-match lookup on
  `(source_service, event_type, event_version, schema_version)`. Any event that doesn't match a
  configured rule is routed to the poison DLQ (`worker/processor.go`'s
  `routeIntentToPoisonDLQ` / `routeToPoisonDLQ` / `routeEdgeToPoisonDLQ`) rather than
  default-routed or guessed at.
- **zord-outcome-engine**: `handlers/intent_event_handler.go`'s intent-event consumer compares
  the incoming `schema_version` against the local canonical constant and dead-letters any
  mismatch to the `intent_event_dead_letters` table (`rejection_stage = "UNSUPPORTED_VERSION"`)
  instead of processing it under assumed-compatible rules.

This behavior already existed in code before INT-07; this document is what makes it an explicit,
findable policy instead of tribal knowledge.

## Enforcement — how each repo stays in sync with this spec

Each of the three repos keeps its own local Go constants (see below) rather than importing this
directory as a Go package (see "Why not a shared Go package"). Two things keep them from
drifting:

1. **No raw literals** — production code in each repo must reference the local constant, never a
   hardcoded `"v1"` string. Enforced by `TestINT07_NoRawVersionLiterals` in each repo's
   `testing/` (or `testing/audittests/`) package, which fails the build if a new literal is
   introduced.
2. **Spec match** — each repo's local constants must equal this spec's values. Enforced by
   `TestINT07_LocalConstantsMatchSpec` in the same test files.

| Repo | Local constants file |
|---|---|
| `zord-intent-engine` | `internal/services/event_contract.go` |
| `zord-relay` | `model/event_contract.go` |
| `zord-outcome-engine` | `models/event_contract.go` |

## Why not a shared Go package

A real importable Go module (`replace zord-event-contract => ../shared/zord-event-contract`)
was considered and rejected: all three services' Dockerfiles copy only their own repo directory
into the build context (`context: .` in each `docker-compose.yml`, `COPY go.mod go.sum ./` then
`COPY . .` in each `Dockerfile`). A relative `replace` pointing outside that directory builds
fine on a local machine (where the sibling directory exists on disk) but fails inside every
Docker build, since the build context can't see `../shared/...`. This spec directory avoids that
risk entirely — it's documentation + a test fixture, not a build-time dependency.

## Changing the canonical value in the future

If a new version is ever introduced (e.g. `v2`), it must be added to this spec's
`supported_event_versions`/`supported_schema_versions` arrays and to all three repos' local
constants **in one coordinated change**, the same way the `"v1"` canonical-value fix (INT-07)
had to update `zord-intent-engine`'s constant and `zord-relay/config.yaml`'s allow-list together
to avoid a rollout window where relay's strict allow-list would poison real traffic. Bumping the
*default/only supported* value is a coordinated, same-window deploy across services — not a
rolling, independent one.
