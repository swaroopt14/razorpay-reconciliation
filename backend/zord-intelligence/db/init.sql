-- TABLE 1: projection_state
-- ZPI reads Kafka events and computes KPI numbers from them.
-- For example: "corridor razorpay.UPI has 97% success rate in last 24h"
-- Those computed numbers are stored here.
--
-- THINK OF IT LIKE:
-- A calculator that keeps a running total.
-- Every time a finality certificate arrives, ZPI updates the numbers.
-- The frontend reads from this table via the /v1/intelligence/kpis API.
--
-- EXAMPLE ROWS:
-- tenant_id | projection_key                      | value_json
-- tnt_A     | corridor.success_rate.razorpay_UPI  | {"rate": 0.97, "total": 1000}
-- tnt_A     | corridor.finality_p95.razorpay_UPI  | {"p95_seconds": 480}
-- tnt_A     | tenant.evidence_readiness           | {"rate": 0.91, "total": 500}

CREATE TABLE IF NOT EXISTS projection_state (

    id                 BIGSERIAL    PRIMARY KEY,
    -- BIGSERIAL = auto-incrementing number. Postgres assigns it automatically.
    -- You never set this yourself.

    tenant_id          TEXT         NOT NULL,
    -- Which merchant/tenant this projection belongs to

    projection_key     TEXT         NOT NULL,
    -- The name of what we are measuring.
    -- Format: {what}.{metric}.{scope}
    -- Examples:
    --   "corridor.success_rate.razorpay_UPI"
    --   "corridor.finality_p95.cashfree_IMPS"
    --   "tenant.evidence_readiness"
    --   "tenant.sla_breach_rate"

    window_start       TIMESTAMPTZ  NOT NULL,
    window_end         TIMESTAMPTZ  NOT NULL,
    -- The time period this projection covers.
    -- Most projections use a rolling 24-hour window.
    -- Example: window_start=2024-01-15 00:00, window_end=2024-01-16 00:00

    value_json         JSONB        NOT NULL,
    -- The actual computed numbers stored as flexible JSON.
    -- JSONB = binary JSON. Faster to query than plain TEXT.
    -- Different projections store different shapes here:
    --   success_rate:  {"rate": 0.97, "settled": 970, "total": 1000}
    --   finality_p95:  {"p50_seconds": 120, "p95_seconds": 480, "count": 1000}
    --   evidence:      {"rate": 0.91, "with_evidence": 455, "total": 500}

    computed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- When ZPI last updated this projection

    projection_version INT          NOT NULL DEFAULT 1,
    -- If we change how a projection is calculated, bump this number.
    -- Old version rows stay, new version rows are added alongside.
    -- Prevents confusion when formula changes.

    projection_family  TEXT,
    -- Which of the 7 intelligence families does this projection serve?
    -- Values: 'LEAKAGE' | 'AMBIGUITY' | 'DEFENSIBILITY' | 'RCA'
    --       | 'PATTERN' | 'RELIABILITY' | 'SLA'
    -- NULL for legacy rows written before Phase 1. New rows set this.

    entity_scope_type  TEXT,
    -- What kind of entity is being measured?
    -- Values: 'TENANT' | 'CORRIDOR' | 'BATCH' | 'PSP' | 'SOURCE'
    -- NULL for legacy rows.

    entity_scope_ref   TEXT,
    -- The specific entity ID (e.g. 'razorpay_UPI', 'BATCH-2026-04-01-001').
    -- NULL for TENANT scope (tenant_id is already the identifier).

    source_refs_json   JSONB,
    -- Array of upstream event/artifact IDs that contributed to this state.
    -- Allows deep auditability back to Service 5/6.

    freshness_ts       TIMESTAMPTZ,
    -- The timestamp of the latest upstream event that updated this row.

    -- UNIQUE constraint: only one row per tenant+key+window+version
    -- This makes upsert (insert or update) safe to call multiple times
    CONSTRAINT uq_projection
        UNIQUE (tenant_id, projection_key, window_start, projection_version)
);

-- Index: "give me latest projections for tenant X" — most common query
CREATE INDEX IF NOT EXISTS idx_proj_tenant_key
    ON projection_state (tenant_id, projection_key, window_end DESC);

-- Index: "give me all LEAKAGE projections for tenant X" — intelligence layer query
CREATE INDEX IF NOT EXISTS idx_proj_family_scope
    ON projection_state (tenant_id, projection_family, entity_scope_type, entity_scope_ref)
    WHERE projection_family IS NOT NULL;

-- TABLE 1B: processed_events
-- Tracks Kafka event IDs already processed by ZPI handlers.
-- Used for idempotency to avoid double-counting on retries/replays.
CREATE TABLE IF NOT EXISTS processed_events (
    tenant_id    TEXT        NOT NULL,
    event_id     TEXT        NOT NULL,
    PRIMARY KEY (tenant_id, event_id),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_events_at
    ON processed_events (processed_at DESC);

-- TABLE 1C: processed_finality
-- Business-level idempotency for finality certificates per tenant.
CREATE TABLE IF NOT EXISTS processed_finality (
    tenant_id      TEXT        NOT NULL,
    certificate_id TEXT        NOT NULL,
    processed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, certificate_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_finality_at
    ON processed_finality (processed_at DESC);


-- TABLE 2: policy_registry
-- Rules that ZPI evaluates. When conditions are met, ZPI creates an ActionContract.
--
-- THINK OF IT LIKE:
-- A list of IF-THEN rules stored in the database.
-- "IF corridor success rate drops below 90% THEN escalate to ops"
-- Adding a new rule = INSERT a row here. No code deployment needed.
--
-- EXAMPLE ROWS:
-- policy_id          | trigger               | dsl (the rule text)
-- P_SLA_BREACH_RISK  | cron: every 5 min     | IF finality_p95 > 6h THEN ESCALATE
-- P_FAILURE_BURST    | event: outcome.normal  | IF failure_rate > 30% THEN ESCALATE
-- P_EVIDENCE_GAP     | cron: every hour       | IF evidence_rate < 80% THEN GENERATE

CREATE TABLE IF NOT EXISTS policy_registry (

    policy_id      TEXT        PRIMARY KEY,
    -- Human-readable ID like "P_SLA_BREACH_RISK", "P_FAILURE_BURST"
    -- Not a UUID — kept readable so logs and alerts make sense

    version        INT         NOT NULL DEFAULT 1,
    -- Increment when you change the policy rules

    scope_type     TEXT        NOT NULL,
    -- What this policy looks at:
    -- "tenant"   → evaluates once per tenant
    -- "corridor" → evaluates once per corridor (razorpay_UPI, cashfree_IMPS etc.)
    -- "contract" → evaluates once per individual contract
    CHECK (scope_type IN ('tenant', 'corridor', 'contract')),

    trigger_type   TEXT        NOT NULL,
    -- WHEN does this policy get evaluated?
    -- "event" → fires when a specific Kafka message arrives
    -- "cron"  → fires on a schedule (every 5 min, every hour etc.)
    CHECK (trigger_type IN ('event', 'cron')),

    trigger_value  TEXT        NOT NULL,
    -- For "event" trigger: the Kafka topic name
    --   e.g. "final.contract.updated"
    -- For "cron" trigger: the schedule
    --   e.g. "*/5 * * * *" means every 5 minutes

    dsl            TEXT        NOT NULL,
    -- The actual rule text. Stored as plain text, parsed at evaluation time.
    -- Example:
    --   WHEN corridor.success_rate_1h < 0.90
    --   THEN ACTION ESCALATE severity=HIGH notify=OPS

    enabled        BOOLEAN     NOT NULL DEFAULT false,
    -- Policies start DISABLED for safety.
    -- You must explicitly enable via API: POST /v1/intelligence/policies/{id}/enable

    tenant_id      TEXT,
    -- NULL = applies to ALL tenants
    -- Set this to lock a policy to one specific tenant

    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- ── NEW COLUMNS (Phase 1) ──────────────────────────────────────────────
    policy_family             TEXT,
    -- Which intelligence family does this policy belong to?
    -- Values: 'LEAKAGE' | 'AMBIGUITY' | 'DEFENSIBILITY' | 'RCA'
    --       | 'PATTERN' | 'RECOMMENDATION' | 'SLA' | 'BATCH' | 'COMPLIANCE'
    -- NULL for legacy policies seeded before Phase 1.

    severity                  TEXT        DEFAULT 'MEDIUM',
    -- Promoted from DSL text to a real queryable column.
    -- Values: 'HIGH' | 'MEDIUM' | 'LOW'
    -- The DSL parser still reads severity= from the DSL text as a fallback.
    -- This column is authoritative when set.

    requires_manual_approval  BOOLEAN     NOT NULL DEFAULT false
    -- When TRUE: the ActionContract is created with contract_status = 'PENDING_APPROVAL'.
    -- A human must approve it before the outbox worker delivers it to Kafka.
    -- Use for money-impacting decisions (HOLD, REVIEW_AMBIGUOUS_BATCH).
    -- Default FALSE = all existing policies continue auto-executing normally.
);

-- Index: "give me all enabled policies for this trigger" — policy engine's main query
CREATE INDEX IF NOT EXISTS idx_policy_enabled_trigger
    ON policy_registry (trigger_type, trigger_value)
    WHERE enabled = true;

-- Index: "give me all enabled LEAKAGE policies" — intelligence recommendation engine
CREATE INDEX IF NOT EXISTS idx_policy_family
    ON policy_registry (policy_family, enabled)
    WHERE policy_family IS NOT NULL;


-- TABLE 3: action_contracts
-- Every decision ZPI makes is recorded here as an immutable signed record.
-- This is ZPI's audit trail — you can always answer "why did ZPI do that?"
--
-- GOLDEN RULE: NEVER UPDATE ROWS IN THIS TABLE.
-- Once inserted, a row stays forever exactly as written.
-- This is what makes ZPI audit-grade.
--
-- THINK OF IT LIKE:
-- A court judgment. Once written and signed, it cannot be changed.
-- If you want to override it, you write a NEW judgment referencing the old one.
--
-- EXAMPLE ROWS:
-- action_id | policy_id         | decision   | confidence | scope_refs
-- act_01    | P_SLA_BREACH_RISK | ESCALATE   | 0.95       | {"corridor_id": "razorpay_UPI"}
-- act_02    | P_EVIDENCE_GAP    | GENERATE   | 1.00       | {"tenant_id": "tnt_A"}
-- act_03    | P_FAILURE_BURST   | NOTIFY     | 0.87       | {"corridor_id": "cashfree_IMPS"}

CREATE TABLE IF NOT EXISTS action_contracts (

    action_id        TEXT         PRIMARY KEY,
    -- UUID we generate in Go code: "act_" + uuid

    tenant_id        TEXT         NOT NULL,

    policy_id        TEXT         NOT NULL,
    -- Which policy triggered this action. Links back to policy_registry.

    policy_version   INT          NOT NULL,
    -- Which version of the policy was active when this fired.
    -- Important: policy rules can change, but old actions stay as they were.

    scope_refs       JSONB        NOT NULL,
    -- What this action is about. Flexible JSON because scope varies:
    -- {"contract_id": "ctr_01"}
    -- {"corridor_id": "razorpay_UPI"}
    -- {"tenant_id": "tnt_A", "intent_id": "int_01"}
    -- NO PII here — only IDs and references

    input_refs_json  JSONB        NOT NULL,
    -- What evidence ZPI looked at to make this decision.
    -- Stores projection keys and values that triggered the rule.
    -- Example: {"projection_key": "corridor.success_rate.razorpay_UPI", "value": 0.82}

    decision         TEXT         NOT NULL,
    -- What ZPI decided to do:
    CHECK (decision IN (
        -- ── ORIGINAL DECISIONS ───────────────────────────────────────────────
        'ALLOW',                    -- explicit allow, audit trail only
        'ESCALATE',                 -- create ops incident and alert on-call
        'NOTIFY',                   -- send notification
        'HOLD',                     -- pause payout (requires tenant approval)
        'RETRY',                    -- retry via Service 4 (requires tenant config)
        'GENERATE_EVIDENCE',        -- trigger Service 6 to build evidence pack
        'OPEN_OPS_INCIDENT',        -- open a structured ops ticket
        'ADVISORY_RECOMMENDATION',  -- suggestion only, zero auto-action
        -- ── NEW DECISIONS (Phase 1) ──────────────────────────────────────────
        'PREPARE_AND_SIGN_RECOMMENDED',      -- commercial upsell signal
        'DISPATCH_MODE_RECOMMENDED',         -- deeper control mode suggestion
        'REQUEST_SOURCE_PATCH',              -- fix source system carrier fields
        'REVIEW_AMBIGUOUS_BATCH',            -- human review of high-ambiguity batch
        'REGENERATE_EVIDENCE',               -- rebuild weak evidence pack
        'REQUEST_STRONGER_CARRIER_CONTRACT'  -- ops: renegotiate PSP reference fields
    )),

    confidence       NUMERIC(4,3) NOT NULL,
    -- How certain ZPI was: 0.000 to 1.000
    -- 1.000 = completely certain (e.g. evidence_rate IS 0.60, fact not estimate)
    -- 0.750 = fairly confident (e.g. trend suggests breach coming)
    CHECK (confidence >= 0 AND confidence <= 1),

    payload_json     JSONB        NOT NULL,
    -- Extra data the actuator needs to carry out the action.
    -- Example for ESCALATE: {"severity": "HIGH", "notify": ["OPS"], "message": "..."}
    -- MUST NOT contain PII

    reason_codes_json JSONB,
    -- Structured taxonomy of reasons why this action was taken.
    -- Example: ["MISSING_CLIENT_REF", "VALUE_DATE_MISMATCH"]

    signature        TEXT         NOT NULL,
    -- Cryptographic signature proving this record was not tampered with.
    -- In development: a simple hash. In production: ed25519 signature via KMS.

    idempotency_key  TEXT         NOT NULL UNIQUE,
    -- Prevents creating duplicate action contracts for the same event.
    -- Built from: hash(policy_id + scope_refs + trigger_event_id)
    -- If the same event arrives twice, the second insert is silently ignored.

    -- ── NEW COLUMNS (Phase 1) ──────────────────────────────────────────────
    expires_at       TIMESTAMPTZ,
    -- Optional expiry time for time-sensitive decisions.
    -- Example: a HOLD action should expire after 24h if not reviewed.
    -- NULL = never expires (correct default for all existing and most new rows).

    contract_status  TEXT         NOT NULL DEFAULT 'ACTIVE'
                     CHECK (contract_status IN (
                         'ACTIVE',            -- normal flow, outbox processes it
                         'PENDING_APPROVAL',  -- waiting for human sign-off
                         'APPROVED',          -- human approved, ready for outbox
                         'DISMISSED',         -- human dismissed, no actuation
                         'EXPIRED'            -- approval window passed without action
                     )),
    -- The approval lifecycle of this ActionContract.
    -- DEFAULT 'ACTIVE' = all existing rows get ACTIVE, which is correct.

    policy_family    TEXT,
    -- Which intelligence family created this action.
    -- Values mirror policy_registry.policy_family.

    severity         TEXT,
    -- Queryable severity promoted from DSL/policy metadata.
    -- Values: 'HIGH' | 'MEDIUM' | 'LOW'

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
    -- Set once, never changed. Matches IMMUTABILITY RULE.
);

-- Index: "show recent actions for this tenant" — main dashboard query
CREATE INDEX IF NOT EXISTS idx_ac_tenant_created
    ON action_contracts (tenant_id, created_at DESC);

-- Index: "all actions for contract ctr_01" — scope lookup
-- GIN index makes JSONB searches fast: scope_refs @> '{"contract_id":"ctr_01"}'
CREATE INDEX IF NOT EXISTS idx_ac_scope_refs
    ON action_contracts USING GIN (scope_refs);

-- Index: "how many times did P_SLA_BREACH_RISK fire today?"
CREATE INDEX IF NOT EXISTS idx_ac_policy
    ON action_contracts (policy_id, tenant_id, created_at DESC);

-- Index: "show me all actions pending approval" — ops approval dashboard
CREATE INDEX IF NOT EXISTS idx_ac_pending_approval
    ON action_contracts (tenant_id, created_at DESC)
    WHERE contract_status = 'PENDING_APPROVAL';

-- Index: "find expired approval windows" — background cleanup job
CREATE INDEX IF NOT EXISTS idx_ac_expired
    ON action_contracts (expires_at ASC)
    WHERE contract_status = 'PENDING_APPROVAL'
    AND   expires_at IS NOT NULL;


-- TABLE 4: actuation_outbox 

-- A delivery queue. When ZPI creates an ActionContract that needs to
-- trigger another service (retry, hold, alert), it writes to this table.
-- A background worker (outbox_worker.go) reads this and sends to Kafka.
--
-- WHY NOT SEND TO KAFKA DIRECTLY?
-- If ZPI writes to DB and then tries to send to Kafka, but crashes in between:
--   - DB has the action → good
--   - Kafka never got it → other service never triggered → BAD
--
-- With the outbox pattern:
--   - Write ActionContract + Outbox entry in ONE DB transaction (atomic)
--   - Worker picks up outbox and sends to Kafka separately
--   - If worker crashes, it retries when it restarts
--   - Guaranteed delivery, zero message loss
--
-- EXAMPLE ROWS:
-- event_id | action_id | event_type | status  | attempts
-- evt_01   | act_01    | ESCALATE   | PENDING | 0
-- evt_02   | act_02    | RETRY      | SENT    | 1
-- evt_03   | act_03    | GENERATE   | FAILED  | 5

CREATE TABLE IF NOT EXISTS actuation_outbox (

    event_id       TEXT         PRIMARY KEY,

    action_id      TEXT         NOT NULL
                                REFERENCES action_contracts(action_id),
    -- Links to the ActionContract that created this outbox entry

    event_type     TEXT         NOT NULL,
    -- Mirrors the decision from action_contracts.
    -- Routes to the correct Kafka topic in outbox_worker.go.
    CHECK (event_type IN (
        -- ── ORIGINAL EVENT TYPES ─────────────────────────────────────────────
        'ESCALATE',
        'RETRY',
        'GENERATE_EVIDENCE',
        'NOTIFY',
        'OPEN_OPS_INCIDENT',
        'HOLD',
        'ADVISORY_RECOMMENDATION',
        -- ── NEW EVENT TYPES (Phase 1) ─────────────────────────────────────────
        'BATCH_PATCH_REQUEST',               -- → zpi.actuation.batch_patch (Phase 5)
        'OPS_WEBHOOK',                       -- → tenant-configured webhook (Phase 5)
        'PREPARE_AND_SIGN_RECOMMENDED',      -- → zpi.actuation.alert (advisory)
        'DISPATCH_MODE_RECOMMENDED',         -- → zpi.actuation.alert (advisory)
        'REQUEST_SOURCE_PATCH',              -- → zpi.actuation.alert
        'REVIEW_AMBIGUOUS_BATCH',            -- → zpi.actuation.alert
        'REGENERATE_EVIDENCE',               -- → zpi.actuation.evidence
        'REQUEST_STRONGER_CARRIER_CONTRACT'  -- → zpi.actuation.alert
    )),

    payload        JSONB        NOT NULL,
    -- JSON to publish to Kafka. Built from the ActionContract payload.

    status         TEXT         NOT NULL DEFAULT 'PENDING',
    -- Delivery lifecycle:
    -- PENDING → worker picks it up → sends to Kafka → SENT
    --                                              → fails → FAILED (retried later)
    CHECK (status IN ('PENDING', 'SENT', 'FAILED')),

    attempts       INT          NOT NULL DEFAULT 0,
    -- How many delivery attempts have been made.
    -- After 5 failed attempts, status becomes FAILED permanently.
    -- Requires manual intervention (ops team investigates).

    next_retry_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- When to try delivery next.
    -- Worker query: WHERE status IN ('PENDING','FAILED') AND next_retry_at <= now()
    -- Uses exponential backoff: 30s → 2m → 8m → 32m → permanent fail

    sent_at        TIMESTAMPTZ,
    -- When it was successfully delivered. NULL until delivered.

    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- This is the HOT index — the outbox worker queries this every 5 seconds.
-- Partial index (WHERE status IN ...) only indexes rows that need processing.
-- Much smaller and faster than a full table index.
CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON actuation_outbox (next_retry_at ASC)
    WHERE status IN ('PENDING', 'FAILED');


-- TABLE 5: sla_timers
-- Tracks the SLA (Service Level Agreement) deadline for each intent.
-- When a merchant creates a payout, there is a deadline by which it
-- must reach finality. This table tracks whether we are on time.
--
-- THINK OF IT LIKE:
-- A countdown timer per payout.
-- Intent created at 10:00 + SLA is 4 hours = deadline is 14:00.
-- If it is 13:45 and still PENDING, ZPI should warn ops.
--
-- EXAMPLE ROWS:
-- intent_id | sla_deadline        | status   | notified_at
-- int_01    | 2024-01-15 14:00   | ACTIVE   | null        ← ticking
-- int_02    | 2024-01-15 12:00   | RESOLVED | null        ← finished in time
-- int_03    | 2024-01-15 10:00   | BREACHED | 2024-01-15 10:05 ← late, ops alerted

CREATE TABLE IF NOT EXISTS sla_timers (

    id           BIGSERIAL    PRIMARY KEY,

    intent_id    TEXT         NOT NULL,
    tenant_id    TEXT         NOT NULL,
    corridor_id  TEXT         NOT NULL,

    sla_deadline TIMESTAMPTZ  NOT NULL,
    -- The deadline. Computed when intent arrives:
    -- sla_deadline = intent.created_at + corridor_sla_hours
    -- For now we use a default of 6 hours for all corridors.

    status       TEXT         NOT NULL DEFAULT 'ACTIVE',
    CHECK (status IN (
        'ACTIVE',    -- timer is running, payout not yet finalized
        'RESOLVED',  -- payout reached finality before deadline (good)
        'BREACHED'   -- deadline passed, payout still not finalized (bad)
    )),

    resolved_at  TIMESTAMPTZ,
    -- When finality was reached (NULL if still ACTIVE or BREACHED)

    notified_at  TIMESTAMPTZ,
    -- When we sent the breach notification to ops (NULL if not yet notified)
    -- This prevents sending duplicate alerts for the same breach.

    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- One timer per intent per tenant
    CONSTRAINT uq_sla_intent UNIQUE (tenant_id, intent_id)
);

-- Index: "find all ACTIVE timers approaching their deadline"
-- The sla_worker queries this every 5 minutes
CREATE INDEX IF NOT EXISTS idx_sla_active_deadline
    ON sla_timers (tenant_id, sla_deadline ASC)
    WHERE status = 'ACTIVE';

-- SEED: Pilot policies
--
-- These are the 8 policies required for pilot 
-- All start DISABLED (enabled = false) for safety.
-- The ops team enables them one-by-one via the API after verifying thresholds:
--   POST /v1/intelligence/policies/P_SLA_BREACH_RISK/enable
--
-- ON CONFLICT DO NOTHING means running init.sql twice is safe —
-- existing rows are untouched (idempotent seed).
--
-- DSL guide:
--   WHEN <metric> <op> <threshold>  AND  <metric> <op> <threshold>
--   THEN ACTION <decision> severity=<HIGH|MEDIUM|LOW>
--
-- Time units: 6h = 6 hours, 30m = 30 minutes (handled by parseThreshold in Go)
-- Plain numbers: 0.70 = rate (0–1), 500 = count

INSERT INTO policy_registry
    (policy_id, version, scope_type, trigger_type, trigger_value, dsl, enabled)
VALUES

-- P1: SLA breach risk — fires when p95 finality is over 6h AND backlog > 500
-- scope: corridor (checked per corridor)  trigger: cron every 5 min
('P_SLA_BREACH_RISK', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.finality_p95_seconds > 6h AND corridor.total_pending > 500
THEN ACTION ESCALATE severity=HIGH',
false),

-- P2: Failure burst — fires when success rate drops below 70% in this corridor
-- scope: corridor  trigger: event (fires immediately when outcome arrives)
('P_FAILURE_BURST', 1, 'corridor', 'event', 'outcome.event.normalized',
'WHEN corridor.success_rate < 0.70
THEN ACTION ESCALATE severity=HIGH',
false),

-- P3: Pending backlog aging — fires when 6h+ bucket gets too large
-- scope: corridor  trigger: cron every 5 min
('P_PENDING_BACKLOG_AGING', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.pending_6h_plus > 50
THEN ACTION OPEN_OPS_INCIDENT severity=MEDIUM',
false),

-- P4: Conflict spike — fires when Outcome Fusion conflict rate is very high
-- A high conflict rate means PSP signals are unreliable — needs investigation
-- scope: corridor  trigger: finality cert event
('P_CONFLICT_SPIKE', 1, 'corridor', 'event', 'finality.certificate.issued',
'WHEN corridor.success_rate < 0.85
THEN ACTION NOTIFY severity=MEDIUM',
false),

-- P5: Evidence missing — fires when evidence readiness drops below 80%
-- scope: tenant  trigger: cron every hour (we use */5 for pilot simplicity)
('P_EVIDENCE_MISSING', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.evidence_readiness_rate < 0.80
THEN ACTION GENERATE_EVIDENCE severity=LOW',
false),

-- P6: DLQ retry suggestion — fires when statement match rate drops
-- Low match rate = payouts settled but not in statement = reconciliation exception
-- scope: corridor  trigger: statement match event
('P_STATEMENT_MISMATCH_SPIKE', 1, 'corridor', 'event', 'statement.match.event',
'WHEN corridor.statement_match_rate < 0.90
THEN ACTION OPEN_OPS_INCIDENT severity=MEDIUM',
false),

-- P7: Corridor degradation advisory — fires when success rate falls but not critical
-- Advisory only — suggests human review, no auto-action
-- scope: corridor  trigger: finality cert event
('P_CORRIDOR_DEGRADATION', 1, 'corridor', 'event', 'finality.certificate.issued',
'WHEN corridor.success_rate < 0.90
THEN ACTION ADVISORY_RECOMMENDATION severity=LOW',
false),

-- P8: SLA breach rate rising — fires when breach rate exceeds 5%
-- scope: tenant  trigger: cron every 5 min
('P_SLA_BREACH_RATE_HIGH', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.sla_breach_rate > 0.05
THEN ACTION ESCALATE severity=HIGH',
false)

ON CONFLICT (policy_id) DO NOTHING;

-- ── SEED: ML-driven policies ─────────────────────────────────────────────
-- Makes ML projections actionable via the existing policy engine.
INSERT INTO policy_registry
    (policy_id, version, scope_type, trigger_type, trigger_value, dsl, enabled)
VALUES
('P_ANOMALY_DETECTED', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.anomaly_score > 0.70
THEN ACTION ESCALATE severity=HIGH',
false),
('P_SLA_BREACH_RISK_HIGH', 1, 'corridor', 'cron', '*/5 * * * *',
'WHEN corridor.sla_breach_risk > 0.70
THEN ACTION NOTIFY severity=HIGH',
false),
('P_FAILURE_PATTERN_SHIFT', 1, 'corridor', 'event', 'outcome.event.normalized',
'WHEN corridor.failure_cluster_shift_score > 0.60
THEN ACTION ESCALATE severity=MEDIUM',
false),
('P_SLA_BREACH', 1, 'tenant', 'cron', '*/5 * * * *',
'WHEN tenant.sla_breach_rate > 0.00
THEN ACTION ESCALATE severity=HIGH',
false)
ON CONFLICT (policy_id) DO NOTHING;


-- PHASE 1 ADDITIONS: 4 New Tables + New Policy Seeds
-- These are added to init.sql so fresh databases (dev/CI/Docker) get the
-- complete schema from the start.
-- For existing databases, run db/migrate_phase1.sql instead.


-- TABLE 6: intelligence_snapshots
-- Materialised, explainable intelligence bundles per tenant/scope/window.
-- One snapshot = one complete "answer" to an intelligence question.
-- Example: "What was the leakage for tenant tnt_A in the last 24 hours?"

CREATE TABLE IF NOT EXISTS intelligence_snapshots (

    snapshot_id         TEXT         PRIMARY KEY,
    -- UUID: "snap_" + uuid. Referenced by intelligence_explanations.

    tenant_id           TEXT         NOT NULL,

    snapshot_type       TEXT         NOT NULL,
    -- Which intelligence family produced this snapshot?
    CHECK (snapshot_type IN (
        'LEAKAGE',       -- money-loss analysis (Section 10.1 of new spec)
        'AMBIGUITY',     -- attachment confidence quality (Section 10.2)
        'DEFENSIBILITY', -- evidence and proof strength (Section 10.3)
        'RCA',           -- root cause analysis (Section 10.4, legacy)
        'RCA_CLUSTER',   -- HDBSCAN cluster results (Section 10.4, current)
        'PATTERN',       -- pre-dispatch quality patterns (Section 10.5)
        'RECOMMENDATION' -- actionable next steps (Section 10.6)
    )),

    scope_type          TEXT         NOT NULL,
    -- What level of scope does this snapshot cover?
    CHECK (scope_type IN (
        'TENANT',   -- entire tenant
        'BATCH',    -- one batch of payouts
        'CORRIDOR', -- one payment corridor
        'PSP',      -- one payment provider
        'SOURCE',   -- one source system
        'INTENT'    -- one individual payout intent
    )),

    scope_ref           TEXT,
    -- The specific entity ID for the scope_type.
    -- NULL when scope_type = 'TENANT'.

    window_start        TIMESTAMPTZ  NOT NULL,
    window_end          TIMESTAMPTZ  NOT NULL,
    -- Time window this snapshot covers.

    projection_refs_json JSONB       NOT NULL DEFAULT '[]'::jsonb,
    -- Array of projection_state IDs used to compute this snapshot.
    -- Audit trail: which raw metrics fed this intelligence view?

    snapshot_json       JSONB        NOT NULL,
    -- The full intelligence output. Shape varies by snapshot_type.
    -- See migrate_phase1.sql for documented examples per type.

    model_version       TEXT,
    -- NULL = deterministic. 'ml_v1.0' = ML-assisted.

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snap_tenant_type_window
    ON intelligence_snapshots (tenant_id, snapshot_type, window_end DESC);

CREATE INDEX IF NOT EXISTS idx_snap_scope
    ON intelligence_snapshots (tenant_id, scope_type, scope_ref, window_end DESC)
    WHERE scope_ref IS NOT NULL;


-- TABLE 7: batch_contracts
-- Pre-aggregated status and intelligence for each batch of payouts.
-- Updated incrementally as batch events arrive — avoids expensive aggregations
-- on every dashboard load.

CREATE TABLE IF NOT EXISTS batch_contracts (

    batch_id                    TEXT         PRIMARY KEY,
    -- The batch identifier from the client's source system.

    tenant_id                   TEXT         NOT NULL,

    source_reference            TEXT,
    -- File path or source system reference. NULL for API-submitted batches.

    total_count                 INT          NOT NULL DEFAULT 0,
    success_count               INT          NOT NULL DEFAULT 0,
    failed_count                INT          NOT NULL DEFAULT 0,
    pending_count               INT          NOT NULL DEFAULT 0,
    reversed_count              INT          NOT NULL DEFAULT 0,
    -- Reversed after initially settling — tracked separately.

    partial_recon_count         INT          NOT NULL DEFAULT 0,
    -- Attached to a settlement but with variance (under/over payment).

    total_intended_amount_minor NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Exact decimal monetary amount in MINOR units (paise, cents).
    -- NUMERIC(20,2): up to 18 integer digits + 2 decimal places.
    -- FINTECH RULE: Never use FLOAT for money. Use NUMERIC for exact decimals.

    total_confirmed_amount_minor NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Amount confirmed settled so far.

    original_settled_amount_minor NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Original settled amount reported by Service 5C before any corrections,
    -- from BatchSummaryUpdatedEvent.OriginalSettledAmountMinor.

    total_variance_minor        NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- intended - confirmed. Positive = leakage. Negative = overpayment.

    batch_finality_status       TEXT         NOT NULL DEFAULT 'PROCESSING',
    CHECK (batch_finality_status IN (
        'PROCESSING',
        'FULLY_SETTLED',
        'PARTIALLY_SETTLED',
        'FAILED',
        'REQUIRES_REVIEW',
        'CLOSED'
    )),

    ambiguity_score             NUMERIC(4,3),
    -- 0.000–1.000 from Ambiguity Intelligence. NULL until computed.

    match_confidence            NUMERIC(4,3),
    -- 0.000–1.000 aggregate_match_confidence from BatchSummaryUpdatedEvent (Service 5C).
    -- NULL until the first batch.summary.updated event for this batch.

    defensibility_tier          TEXT,
    CHECK (defensibility_tier IN ('STRONG', 'GOOD', 'WEAK', 'FRAGILE', NULL)),

    -- ── Intent-time batch feature state (Leakage Prediction) ──────────────────
    -- These fields are updated as intent rows arrive so we can score a batch
    -- before settlement data appears. BatchSummaryUpdatedEvent later writes the
    -- authoritative operational totals into the existing aggregate columns above.

    intent_row_count            INT          NOT NULL DEFAULT 0,
    intent_total_amount_minor   NUMERIC(20,2) NOT NULL DEFAULT 0,
    intent_amount_square_sum    NUMERIC(30,2) NOT NULL DEFAULT 0,
    intent_min_amount_minor     NUMERIC(20,2),
    intent_max_amount_minor     NUMERIC(20,2),
    client_payout_ref_present_count INT      NOT NULL DEFAULT 0,

    batch_currency              TEXT,
    batch_source_system         TEXT,
    batch_rail                  TEXT,
    batch_intent_type           TEXT,
    batch_provider_key          TEXT,
    first_intent_created_at     TIMESTAMPTZ,

    -- ── Batch leakage label + prediction state ────────────────────────────────
    -- under_settlement_amount_minor is part of the true leakage label:
    -- unmatched + under_settlement + confirmed_reversal.
    -- predicted_leakage_* are written by the batch leakage prediction model.

    under_settlement_amount_minor NUMERIC(20,2) NOT NULL DEFAULT 0,
    predicted_leakage_rate      NUMERIC(10,6),
    predicted_leakage_minor     NUMERIC(20,2),
    predicted_leakage_model_id  TEXT,
    predicted_at                TIMESTAMPTZ,

    -- ── Per-batch risk attribution (Pattern Intelligence) ─────────────────────
    -- These fields are incremented by individual event handlers (NOT reset by
    -- BatchSummaryUpdatedEvent). They give the frontend per-batch leakage and
    -- risk detail so operators can see exactly which batch is causing issues.

    unmatched_amount_minor      NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Sum of intended_amount_minor for MATCH_UNRESOLVED and MATCH_AMBIGUOUS
    -- attachment decisions. An unmatched intent means no settlement was found,
    -- and an ambiguous intent means a settlement could not be confidently
    -- attached — both leave the amount unconfirmed and at risk.

    reversal_exposure_minor     NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Sum of variance_amount_minor for REVERSAL variance records.
    -- Settled and then reversed — money already paid out but clawed back.

    orphan_amount_minor         NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Sum of settled_amount_minor for orphan settlements (no matching intent).
    -- Settlements that cannot be attributed to any payout intent.

    duplicate_risk_exposure_minor NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Sum of intended_amount_minor for intents with duplicate_risk_flag=true.
    -- Potential duplicate payouts that need review before dispatch or settlement.

    missing_ref_count           INT          NOT NULL DEFAULT 0,
    -- Count of intents/settlements missing critical references:
    -- client_payout_ref (empty), provider_ref (missing), or bank_ref (missing).
    -- High count = attachment ambiguity risk and weak audit trail.

    unexplained_variance_minor  NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Sum of variance_amount_minor for non-whitelisted variance records.
    -- Real unexplained loss — NOT pre-agreed PSP fees or TDS.

    whitelisted_deduction_minor NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Sum of variance_amount_minor for whitelisted (pre-agreed) deductions.
    -- PSP fees, TDS, commissions — expected and approved, NOT real leakage.

    settlement_ref_count        INT          NOT NULL DEFAULT 0,
    -- Total settlement observations (CanonicalSettlementCreatedEvent) seen for
    -- this batch. Denominator for bank_reference_coverage.

    bank_ref_present_count      INT          NOT NULL DEFAULT 0,
    -- Count of settlement observations where bank_ref, UTR, or RRN is present.
    -- Numerator for bank_reference_coverage = bank_ref_present_count / settlement_ref_count.

    decision_ref_count          INT          NOT NULL DEFAULT 0,
    -- Total attachment decisions (AttachmentDecisionCreatedEvent) seen for
    -- this batch. Denominator for client_reference_coverage.

    client_ref_present_count    INT          NOT NULL DEFAULT 0,
    -- Count of attachment decisions where client_reference is present.
    -- Numerator for client_reference_coverage = client_ref_present_count / decision_ref_count.

    last_updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_tenant_updated
    ON batch_contracts (tenant_id, last_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_status
    ON batch_contracts (tenant_id, batch_finality_status)
    WHERE batch_finality_status IN ('REQUIRES_REVIEW', 'PARTIALLY_SETTLED', 'FAILED');

CREATE INDEX IF NOT EXISTS idx_batch_ambiguity
    ON batch_contracts (tenant_id, ambiguity_score DESC)
    WHERE ambiguity_score IS NOT NULL;

-- Heatmap sort index: managed by EnsureProductionIndexes (db/db.go) using
-- CREATE INDEX CONCURRENTLY so live production tables are never write-locked.
-- The IF NOT EXISTS guard here makes this a safe no-op on fresh DBs where
-- EnsureProductionIndexes already built it moments earlier on startup.
CREATE INDEX IF NOT EXISTS idx_batch_tenant_amount
    ON batch_contracts (tenant_id, total_intended_amount_minor DESC NULLS LAST);


-- TABLE 8: ml_feature_store
-- Persists engineered ML features per entity+window for training and scoring.
-- Separates ML concerns from the deterministic projection layer.

CREATE TABLE IF NOT EXISTS ml_feature_store (

    feature_row_id      TEXT         PRIMARY KEY,
    -- UUID: "feat_" + uuid.

    tenant_id           TEXT         NOT NULL,

    scope_type          TEXT         NOT NULL,
    CHECK (scope_type IN ('INTENT', 'BATCH', 'CORRIDOR', 'TENANT', 'PSP')),

    scope_ref           TEXT         NOT NULL,
    -- The entity ID (intent ID, batch ID, corridor ID, etc.).

    feature_family      TEXT         NOT NULL,
    -- Which ML model family uses these features?
    CHECK (feature_family IN (
        'LEAKAGE',   -- leakage anomaly / forecasting
        'AMBIGUITY', -- ambiguity propensity prediction
        'RCA',       -- root cause classification
        'PATTERN',   -- batch quality / duplicate risk
        'SLA'        -- SLA breach prediction
    )),

    window_start        TIMESTAMPTZ  NOT NULL,
    window_end          TIMESTAMPTZ  NOT NULL,

    features_json       JSONB        NOT NULL,
    -- The feature vector. See migrate_phase1.sql for example shapes.

    label_json          JSONB,
    -- Ground truth outcome. NULL until observed. Used for supervised training.

    model_version       TEXT,
    -- NULL for deterministic features. 'feat_v1.0' for ML-computed.

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feat_scope
    ON ml_feature_store (tenant_id, scope_type, scope_ref, feature_family, window_end DESC);

CREATE INDEX IF NOT EXISTS idx_feat_unlabeled
    ON ml_feature_store (tenant_id, feature_family, created_at DESC)
    WHERE label_json IS NULL;


-- TABLE 9: intelligence_explanations

-- Natural-language or structured explanations generated per snapshot.
-- LLM output is stored here, separate from deterministic truth.
-- Every explanation is traceable: which snapshot, which model, which inputs.

CREATE TABLE IF NOT EXISTS intelligence_explanations (

    explanation_id      TEXT         PRIMARY KEY,
    -- UUID: "expl_" + uuid.

    tenant_id           TEXT         NOT NULL,

    snapshot_id         TEXT         NOT NULL
                                     REFERENCES intelligence_snapshots(snapshot_id)
                                     ON DELETE CASCADE,
    -- Links to the intelligence snapshot this explains.

    explanation_type    TEXT         NOT NULL,
    CHECK (explanation_type IN (
        'RCA_SUMMARY',
        'LEAKAGE_NARRATIVE',
        'AMBIGUITY_SUMMARY',
        'ACTION_JUSTIFICATION',
        'DEFENSIBILITY_REPORT',
        'BATCH_RISK_EXPLANATION'
    )),

    input_refs_json     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    -- IDs of snapshots, projections, or actions used as context.
    -- Audit requirement: always know what the explanation was based on.

    explanation_text    TEXT         NOT NULL,
    -- The explanation in natural language or structured markdown.

    model_version       TEXT         NOT NULL DEFAULT 'deterministic_v1',
    -- 'deterministic_v1' = rule-based template.
    -- 'claude-sonnet-4-6' = LLM-generated (Phase 7+).

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expl_snapshot
    ON intelligence_explanations (snapshot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expl_tenant_type
    ON intelligence_explanations (tenant_id, explanation_type, created_at DESC);


-- SEED: New policies for the 4 new intelligence families
-- All start DISABLED. Enable one-by-one after validating thresholds.
-- The DSL metric names (leakage.total_amount_minor etc.) will be wired
-- into policy_service.go's buildEvalContext() in Phase 5.

INSERT INTO policy_registry
    (policy_id, version, scope_type, trigger_type, trigger_value, dsl,
     policy_family, severity, requires_manual_approval, enabled)
VALUES

-- LEAKAGE policies
('P_LEAKAGE_ALERT', 1, 'tenant', 'cron', '*/15 * * * *',
'WHEN leakage.total_amount_minor > 500000 AND leakage.percentage > 0.025
THEN ACTION ESCALATE severity=HIGH',
'LEAKAGE', 'HIGH', false, false),

('P_LEAKAGE_UNMATCHED', 1, 'tenant', 'event', 'attachment.decision.created',
'WHEN leakage.unmatched_intent_count > 20
THEN ACTION NOTIFY severity=MEDIUM',
'LEAKAGE', 'MEDIUM', false, false),

('P_LEAKAGE_UNDER_SETTLEMENT', 1, 'tenant', 'cron', '*/15 * * * *',
'WHEN leakage.under_settlement_amount_minor > 50000
THEN ACTION OPEN_OPS_INCIDENT severity=MEDIUM',
'LEAKAGE', 'MEDIUM', false, false),

('P_LEAKAGE_PREPARE_AND_SIGN', 1, 'tenant', 'cron', '0 * * * *',
'WHEN leakage.percentage > 0.05
THEN ACTION PREPARE_AND_SIGN_RECOMMENDED severity=HIGH',
'LEAKAGE', 'HIGH', false, false),

-- AMBIGUITY policies
('P_AMBIGUITY_VALUE_AT_RISK', 1, 'tenant', 'cron', '*/15 * * * *',
'WHEN ambiguity.value_at_risk_minor > 1000000
THEN ACTION ESCALATE severity=HIGH',
'AMBIGUITY', 'HIGH', false, false),

('P_AMBIGUITY_RATE_HIGH', 1, 'tenant', 'event', 'attachment.decision.created',
'WHEN ambiguity.rate > 0.05
THEN ACTION REQUEST_SOURCE_PATCH severity=MEDIUM',
'AMBIGUITY', 'MEDIUM', false, false),

('P_AMBIGUITY_BATCH_REVIEW', 1, 'corridor', 'event', 'batch.summary.updated',
'WHEN batch.ambiguity_score > 0.70
THEN ACTION REVIEW_AMBIGUOUS_BATCH severity=HIGH',
'AMBIGUITY', 'HIGH', true, false),

-- DEFENSIBILITY policies
('P_DEFENSIBILITY_EVIDENCE_WEAK', 1, 'tenant', 'cron', '*/30 * * * *',
'WHEN defensibility.governance_coverage_pct < 0.70
THEN ACTION REGENERATE_EVIDENCE severity=MEDIUM',
'DEFENSIBILITY', 'MEDIUM', false, false),

('P_DEFENSIBILITY_AUDIT_RISK', 1, 'tenant', 'cron', '*/30 * * * *',
'WHEN defensibility.audit_ready_pct < 0.80
THEN ACTION ESCALATE severity=HIGH',
'DEFENSIBILITY', 'HIGH', false, false),

-- PATTERN policies
('P_PATTERN_BATCH_RISK', 1, 'corridor', 'event', 'batch.summary.updated',
'WHEN batch.risk_score > 0.65
THEN ACTION NOTIFY severity=MEDIUM',
'PATTERN', 'MEDIUM', false, false),

('P_PATTERN_DUPLICATE_RISK', 1, 'tenant', 'event', 'canonical.intent.created',
'WHEN pattern.duplicate_cluster_count > 5
THEN ACTION HOLD severity=HIGH',
'PATTERN', 'HIGH', true, false),

('P_PATTERN_CARRIER_WEAKNESS', 1, 'tenant', 'cron', '0 */6 * * *',
'WHEN pattern.proof_readiness_score < 0.75
THEN ACTION REQUEST_STRONGER_CARRIER_CONTRACT severity=MEDIUM',
'PATTERN', 'MEDIUM', false, false)

ON CONFLICT (policy_id) DO NOTHING;

-- =============================================================================
-- PHASE 5: Policy Engine + Action Contract Extensions
-- =============================================================================
--
-- These statements are migration-safe (ALTER TABLE IF EXISTS / ADD COLUMN IF NOT EXISTS)
-- and idempotent — safe to run on both fresh and existing databases.
--
-- WHAT CHANGED:
--   action_contracts — added contract_status, expires_at, policy_family, severity
--   (These columns exist in the table definition above as Phase 1 additions,
--    but Phase 5 adds the indexes, seeds, and approval-management policies
--    that make them operationally useful.)
--
-- PHASE 5 INDEXES (complement the Phase 1 partial indexes):

ALTER TABLE action_contracts
    ADD COLUMN IF NOT EXISTS policy_family TEXT;

ALTER TABLE action_contracts
    ADD COLUMN IF NOT EXISTS severity TEXT;

-- Per-batch bank reference coverage (settlement_ref_count / bank_ref_present_count).
-- Added for existing databases where batch_contracts predates these columns.
ALTER TABLE batch_contracts
    ADD COLUMN IF NOT EXISTS settlement_ref_count INT NOT NULL DEFAULT 0;

ALTER TABLE batch_contracts
    ADD COLUMN IF NOT EXISTS bank_ref_present_count INT NOT NULL DEFAULT 0;

-- Per-batch client reference coverage (decision_ref_count / client_ref_present_count).
-- Added for existing databases where batch_contracts predates these columns.
ALTER TABLE batch_contracts
    ADD COLUMN IF NOT EXISTS decision_ref_count INT NOT NULL DEFAULT 0;

ALTER TABLE batch_contracts
    ADD COLUMN IF NOT EXISTS client_ref_present_count INT NOT NULL DEFAULT 0;

-- aggregate_match_confidence from BatchSummaryUpdatedEvent (Service 5C).
-- Added for existing databases where batch_contracts predates this column.
ALTER TABLE batch_contracts
    ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(4,3);

-- "Which policies belong to the LEAKAGE family and fired today?"
CREATE INDEX IF NOT EXISTS idx_ac_family_created
    ON action_contracts (tenant_id, policy_family, created_at DESC)
    WHERE policy_family IS NOT NULL;

-- "Which HIGH-severity actions are pending approval right now?"
CREATE INDEX IF NOT EXISTS idx_ac_severity_status
    ON action_contracts (tenant_id, severity, contract_status)
    WHERE severity IS NOT NULL;

-- "Which APPROVED contracts are waiting in the outbox for delivery?"
-- The outbox_worker uses this to skip PENDING_APPROVAL entries efficiently.
CREATE INDEX IF NOT EXISTS idx_ac_status_created
    ON action_contracts (contract_status, created_at DESC);

-- PHASE 5 SEED: Approval-lifecycle management policies
-- These govern what happens to HOLD/RETRY/REVIEW decisions before they actuate.
-- All start DISABLED — enable one at a time in production after validating thresholds.

INSERT INTO policy_registry
    (policy_id, version, scope_type, trigger_type, trigger_value, dsl,
     policy_family, severity, requires_manual_approval, enabled)
VALUES

-- HOLD on duplicate cluster — requires human approval before pausing payouts
-- Duplicate-risk HOLD decisions must never auto-actuate in entry mode.
('P_DUPLICATE_CLUSTER_HOLD', 1, 'tenant', 'event', 'canonical.intent.created',
'WHEN pattern.duplicate_cluster_count > 10
THEN ACTION HOLD severity=HIGH',
'PATTERN', 'HIGH', true, false),

-- Reversal escalation with approval — large reversals need finance sign-off
-- Any single-day reversal exposure > ₹5L requires finance review before alerting.
('P_REVERSAL_FINANCE_REVIEW', 1, 'tenant', 'cron', '*/15 * * * *',
'WHEN leakage.reversal_exposure_minor > 500000
THEN ACTION ESCALATE severity=HIGH',
'LEAKAGE', 'HIGH', true, false),

-- Ambiguous batch hold — high-ambiguity batches need ops review before proceeding
-- requires_manual_approval=true means REVIEW_AMBIGUOUS_BATCH won't auto-actuate.
('P_AMBIGUITY_BATCH_HOLD', 1, 'corridor', 'event', 'batch.summary.updated',
'WHEN batch.ambiguity_score > 0.85
THEN ACTION REVIEW_AMBIGUOUS_BATCH severity=HIGH',
'AMBIGUITY', 'HIGH', true, false),

-- Governance rejected — any governance rejection triggers immediate escalation
-- OR logic: fire if governance_rejected_count > 0 OR audit_ready_pct drops critically
('P_GOVERNANCE_REJECTION', 1, 'tenant', 'event', 'governance.decision.created',
'WHEN defensibility.governance_rejected_count > 0
THEN ACTION ESCALATE severity=HIGH',
'DEFENSIBILITY', 'HIGH', false, false),

-- Combined leakage + ambiguity signal — both high simultaneously = prepare-and-sign
-- OR logic: either condition alone is enough to recommend the upgrade
('P_LEAKAGE_AND_AMBIGUITY_UPGRADE', 1, 'tenant', 'cron', '0 */6 * * *',
'WHEN leakage.percentage > 0.03 OR ambiguity.rate > 0.08
THEN ACTION PREPARE_AND_SIGN_RECOMMENDED severity=HIGH',
'RECOMMENDATION', 'HIGH', false, false),

-- Evidence weak + governance missing — combined defensibility failure
('P_DEFENSIBILITY_CRITICAL', 1, 'tenant', 'cron', '*/30 * * * *',
'WHEN defensibility.audit_ready_pct < 0.60
THEN ACTION ESCALATE severity=HIGH',
'DEFENSIBILITY', 'HIGH', false, false),

-- Carrier contract weakness — systematic missing refs across tenant
('P_CARRIER_WEAKNESS_UPGRADE', 1, 'tenant', 'cron', '0 */12 * * *',
'WHEN ambiguity.provider_ref_missing_rate > 0.15
THEN ACTION REQUEST_STRONGER_CARRIER_CONTRACT severity=MEDIUM',
'AMBIGUITY', 'MEDIUM', false, false),

-- Unresolved settlement spike — many unresolved observations = ops ticket
('P_UNRESOLVED_SPIKE', 1, 'tenant', 'event', 'attachment.decision.created',
'WHEN ambiguity.unresolved_count > 50
THEN ACTION OPEN_OPS_INCIDENT severity=HIGH',
'AMBIGUITY', 'HIGH', false, false)

ON CONFLICT (policy_id) DO NOTHING;


-- =============================================================================
-- PHASE 6: Dual-Mode Architecture (Grade A / Grade B)
-- =============================================================================
--
-- WHAT THIS ADDS:
--   1. intelligence_mode_config table — records the active mode and when it changed.
--      Provides an audit trail of mode transitions (GRADE_A → GRADE_B).
--   2. Indexes to support mode-specific query patterns on intelligence_snapshots.
--   3. Seed row for the default GRADE_A mode.
--
-- MIGRATION SAFETY:
--   All statements use CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
--   Safe to run on both fresh and existing databases.
-- =============================================================================


-- TABLE 10: intelligence_mode_config
-- Records the current and historical operating modes for this ZPI deployment.
--
-- WHY A TABLE INSTEAD OF JUST ENV VAR?
-- The env var is the source of truth for the RUNNING mode.
-- This table provides:
--   1. Audit trail — when did we switch modes and who initiated it?
--   2. Historical context — the GET /v1/intelligence/mode/status endpoint
--      can show "mode set at" without reading the env var at runtime.
--   3. Migration guard — if you accidentally set GRADE_B without routing
--      dispatch correctly, this table lets you diagnose when it happened.
--
-- There is always exactly ONE row with is_current = true.
-- When the mode changes, the old row is updated (is_current = false, ended_at = now)
-- and a new row is inserted (is_current = true).

CREATE TABLE IF NOT EXISTS intelligence_mode_config (

    id              BIGSERIAL    PRIMARY KEY,

    mode            TEXT         NOT NULL,
    CHECK (mode IN ('GRADE_A', 'GRADE_B')),
    -- The operating mode for this row.

    is_current      BOOLEAN      NOT NULL DEFAULT true,
    -- Only one row has is_current = true at any time.
    -- This is a soft constraint — enforced by the application, not a DB constraint,
    -- because a partial unique index on is_current = true would prevent inserting
    -- the new row in the same transaction as updating the old one.

    started_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- When this mode became active.

    ended_at        TIMESTAMPTZ,
    -- When this mode was superseded. NULL = still active.

    initiated_by    TEXT         NOT NULL DEFAULT 'system',
    -- Who or what triggered the mode change.
    -- 'system' = automatic (env var change on restart)
    -- 'ops'    = manual intervention

    notes           TEXT,
    -- Optional context: "Upgraded to Grade B after validating finality certs for tenant X"

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index: "what is the current mode?" — used by intelligence_mode_handler
CREATE INDEX IF NOT EXISTS idx_mode_config_current
    ON intelligence_mode_config (is_current, started_at DESC)
    WHERE is_current = true;

-- Index: "show mode transition history" — audit trail query
CREATE INDEX IF NOT EXISTS idx_mode_config_history
    ON intelligence_mode_config (started_at DESC);


-- Seed: default Grade A mode entry.
-- This runs on fresh installs so the table is never empty.
-- ON CONFLICT DO NOTHING is not available without a unique constraint here,
-- so we use a WHERE NOT EXISTS guard instead.
INSERT INTO intelligence_mode_config (mode, is_current, initiated_by, notes)
SELECT 'GRADE_A', true, 'system', 'Default mode — Attachment Intelligence Mode on initial deployment'
WHERE NOT EXISTS (SELECT 1 FROM intelligence_mode_config WHERE is_current = true);


-- PHASE 6 INDEXES on intelligence_snapshots for mode-aware queries:

-- "Give me all LEAKAGE snapshots for tenant X in the last 7 days" — dashboard trend
CREATE INDEX IF NOT EXISTS idx_snap_tenant_type_recent
    ON intelligence_snapshots (tenant_id, snapshot_type, created_at DESC)
    WHERE snapshot_type IN ('LEAKAGE', 'AMBIGUITY', 'DEFENSIBILITY', 'RCA', 'PATTERN', 'RECOMMENDATION');

-- "Give me the latest snapshot for each type for tenant X" — single-query dashboard load
-- Complements idx_snap_tenant_type_window (added in Phase 1).
-- This index specifically optimises the GetLatestByType query pattern used by Phase 6 handlers.
CREATE INDEX IF NOT EXISTS idx_snap_latest_by_type
    ON intelligence_snapshots (tenant_id, snapshot_type, scope_type, created_at DESC);


-- PHASE 6 INDEXES on projection_state for signal health checks:

-- "Has leakage.total been updated in the last 24h for tenant X?"
-- Used by buildSignalHealth in intelligence_mode_handler.go
CREATE INDEX IF NOT EXISTS idx_proj_key_computed
    ON projection_state (tenant_id, projection_key, computed_at DESC);

-- "Has any batch.health.* projection been updated in the last 24h?"
-- Used by the prefix-check signal health probe.
CREATE INDEX IF NOT EXISTS idx_proj_family_computed
    ON projection_state (tenant_id, projection_family, computed_at DESC)
    WHERE projection_family IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════
-- PHASE ML: Machine Learning Tables
-- Three tables that support the ML layer added on top of the
-- deterministic intelligence foundation.
--
-- Tables:
--   ml_labels          — ground-truth labels derived from 5C/6 truth
--   ml_model_registry  — trained model versions with weights + metrics
--   ml_predictions     — per-scope ML predictions with explanations
-- ═══════════════════════════════════════════════════════════════════

-- ── ml_labels ───────────────────────────────────────────────────────
-- Stores ground-truth labels for supervised ML training.
-- Labels are derived deterministically from Service 5C / Service 6 truth.
-- They are NEVER human-entered — only system-generated from provable state.
--
-- label_family values:
--   LEAKAGE      — label_value = realized_leakage_minor (regression)
--   AMBIGUITY    — label_value = 1 if batch became ambiguous, 0 otherwise
--   FAILURE      — label_value = 1 if intent/batch failed
--   DUPLICATE    — label_value = 1 if duplicate confirmed
--   SLA_BREACH   — label_value = 1 if SLA was breached
--   DEFENSIBILITY — label_value = defensibility_score achieved
--
-- label_source: which service / event produced this label:
--   "attachment_decision"  (Service 5C)
--   "variance_record"      (Service 5C)
--   "evidence_pack"        (Service 6)
--   "sla_timer"            (Service 7 internal)
CREATE TABLE IF NOT EXISTS ml_labels (
    label_id         TEXT        PRIMARY KEY,
    tenant_id        TEXT        NOT NULL,
    scope_type       TEXT        NOT NULL
        CHECK (scope_type IN ('INTENT','BATCH','PROVIDER','CORRIDOR','SOURCE_SYSTEM','TENANT')),
    scope_ref        TEXT        NOT NULL,
    label_family     TEXT        NOT NULL
        CHECK (label_family IN ('LEAKAGE','AMBIGUITY','FAILURE','DUPLICATE','SLA_BREACH','DEFENSIBILITY')),
    label_value      FLOAT       NOT NULL,   -- numeric: 0/1 for binary, float for regression
    label_confidence FLOAT       NOT NULL DEFAULT 1.0, -- how confident we are in this label (0–1)
    label_source     TEXT        NOT NULL,   -- e.g. "attachment_decision", "variance_record"
    source_refs_json JSONB,                  -- IDs of upstream records that produced this label
    feature_row_id   TEXT,                   -- FK to ml_feature_store (nullable — linked later)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_labels_tenant_family
    ON ml_labels (tenant_id, label_family, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_labels_scope
    ON ml_labels (tenant_id, scope_type, scope_ref, label_family);


-- ── ml_model_registry ──────────────────────────────────────────────
-- Stores every model version ever trained, with its weights and metrics.
-- No model goes live without a registry entry (audit trail requirement).
--
-- status lifecycle: CANDIDATE → SHADOW → ACTIVE → RETIRED
--   CANDIDATE: trained but not yet evaluated
--   SHADOW:    running alongside current ACTIVE model for comparison
--   ACTIVE:    the model currently used for live scoring
--   RETIRED:   replaced by a newer version
--
-- artifact_json: the serialised model state.
--   For Logistic Regression: {"weights":[...], "bias":0.0, "trained_on":N}
--   For Isolation Forest: not stored here (retrained from feature_store on demand)
--   For Z-score: stateless, no artifact needed
--
-- algorithm values must match the package name:
--   "zscore_v1", "logistic_regression_v1", "isolation_forest_v1"
CREATE TABLE IF NOT EXISTS ml_model_registry (
    model_id               TEXT        PRIMARY KEY,
    model_name             TEXT        NOT NULL,        -- human name e.g. "ambiguity_logistic_v1"
    model_family           TEXT        NOT NULL
        CHECK (model_family IN ('LEAKAGE','AMBIGUITY','DEFENSIBILITY','PATTERN','RECOMMENDATION')),
    algorithm              TEXT        NOT NULL,        -- "zscore_v1" | "logistic_regression_v1" | "isolation_forest_v1"
    target_label           TEXT        NOT NULL,        -- which label_family this model predicts
    feature_version        TEXT        NOT NULL DEFAULT 'v1',
    training_window_start  TIMESTAMPTZ,
    training_window_end    TIMESTAMPTZ,
    hyperparameters_json   JSONB,                       -- model weights / config (serialised)
    metrics_json           JSONB,                       -- precision, recall, AUC, etc.
    status                 TEXT        NOT NULL DEFAULT 'CANDIDATE'
        CHECK (status IN ('CANDIDATE','SHADOW','ACTIVE','RETIRED')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at           TIMESTAMPTZ                  -- set when status → ACTIVE
);

CREATE INDEX IF NOT EXISTS idx_ml_model_family_status
    ON ml_model_registry (model_family, status, created_at DESC);

-- Enforce only one ACTIVE model per family at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_model_one_active_per_family
    ON ml_model_registry (model_family)
    WHERE status = 'ACTIVE';


-- ── ml_predictions ─────────────────────────────────────────────────
-- Stores one row per scoring event.
-- Every time an ML model runs on a scope (tenant, batch, corridor),
-- we write here so the score is auditable and queryable via API.
--
-- prediction_family matches model_family:
--   LEAKAGE       — anomaly_score + anomaly_level from Z-score
--   AMBIGUITY     — risk_prediction_score + risk_level from Logistic Regression
--   PATTERN       — batch_anomaly_score + anomaly_type from Isolation Forest
--   RECOMMENDATION — priority_score from rule-based scoring
--
-- explanation_json stores the top features / reasons for this prediction,
-- so ops teams can understand WHY the model scored as it did.
-- Example:
--   {"top_features": ["ambiguity_rate=0.12","missing_ref_rate=0.34"],
--    "z_score": 2.8, "mean": 0.021, "stddev": 0.008}
CREATE TABLE IF NOT EXISTS ml_predictions (
    prediction_id      TEXT        PRIMARY KEY,
    tenant_id          TEXT        NOT NULL,
    model_id           TEXT        NOT NULL,            -- FK to ml_model_registry
    scope_type         TEXT        NOT NULL
        CHECK (scope_type IN ('INTENT','BATCH','PROVIDER','CORRIDOR','SOURCE_SYSTEM','TENANT')),
    scope_ref          TEXT        NOT NULL,
    prediction_family  TEXT        NOT NULL
        CHECK (prediction_family IN ('LEAKAGE','AMBIGUITY','DEFENSIBILITY','PATTERN','RECOMMENDATION')),
    prediction_value   TEXT        NOT NULL,            -- e.g. "HIGH", "CRITICAL", "0.87"
    prediction_score   FLOAT       NOT NULL,            -- 0.0–1.0 normalised
    confidence         FLOAT       NOT NULL DEFAULT 1.0,
    feature_row_id     TEXT,                            -- FK to ml_feature_store (nullable)
    explanation_json   JSONB,                           -- top features + reason codes
    snapshot_id        TEXT,                            -- FK to intelligence_snapshots (nullable)
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_tenant_family
    ON ml_predictions (tenant_id, prediction_family, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_scope
    ON ml_predictions (tenant_id, scope_type, scope_ref, prediction_family, created_at DESC);

-- ── RCA Cluster indexes (added for HDBSCAN clustering feature) ─────────────
--
-- 1. Fast lookup of RCA_CLUSTER snapshots by tenant + scope (BATCH or TENANT).
--    Enables GET /rca/clusters?tenant_id=X&batch_id=Y to resolve in a single index scan.
CREATE INDEX IF NOT EXISTS idx_intelligence_snapshots_rca_cluster
    ON intelligence_snapshots (tenant_id, snapshot_type, scope_type, scope_ref, created_at DESC)
    WHERE snapshot_type = 'RCA_CLUSTER';

-- 2. Fast prefix scan for RCA fragment accumulation.
--    Enables GetAllByProjectionKeyPrefix with pattern "rca.frag.{batch_id}.%".
--    text_pattern_ops is required for LIKE prefix queries on non-C-locale databases.
CREATE INDEX IF NOT EXISTS idx_projection_state_rca_frag
    ON projection_state (tenant_id, projection_key text_pattern_ops)
    WHERE projection_key LIKE 'rca.frag.%';
