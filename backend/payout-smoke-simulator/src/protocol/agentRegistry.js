/**
 * Agent Registry — in-memory store for agent capability profiles.
 *
 * The primary Treasury agent lives in store.js (GRAPH.agentProfile) and is
 * keyed by AGENT_ID. The three supplementary demo agents (dispatch coordinator,
 * lifecycle observer, resolution) are pre-registered here so routes.js can
 * pull them from a single list instead of hardcoding inline objects.
 *
 * POST /v1/agents/:id  (upsert) is not wired yet — the registry is read-only
 * for the sandbox demo. Swap the Map for a durable store when you need CRUD.
 */

import { AGENT_ID, CROSS_BORDER_TENANT, CURRENCY, GRAPH } from './store.js'
import { listActionSummaries } from './actionsCatalog.js'
import { listAgentStructures, getLatestAttachedStructure, resolveAgentAllowedRails } from './structures.js'

/** @type {Map<string, object>} */
const registry = new Map()

function register(agent) {
  registry.set(agent.agent_id, agent)
}

function nowHistoricalCount() {
  return listActionSummaries().length
}

// ── Seed supplementary agents ──────────────────────────────────────────────

register({
  agent_id: 'agt_dispatch_coord_01',
  tenant_id: CROSS_BORDER_TENANT,
  purpose: 'Dispatch Coordination Agent — recommends route, checks connector health and cutoffs.',
  owner_principal: 'role_treasury_controller_eu',
  model_provider: 'sandbox-demo',
  model_version: 'dispatch-coordination-2026.08',
  permitted_action_types: ['DISPATCH_COORDINATION'],
  permitted_tools: ['recommend_route', 'check_connector_health', 'estimate_cost'],
  permitted_sources: ['connector_health', 'cutoff_schedule', 'fx_rate'],
  allowed_rails: ['SEPA_CREDIT', 'SEPA_INSTANT'],
  max_amount_per_action: { amount_minor: 500_000_00, currency: CURRENCY },
  daily_budget: { amount_minor: 5_000_000_00, currency: CURRENCY },
  beneficiary_constraints: {},
  jurisdictions: ['EU'],
  approval_profile: 'single_above_eur_10000',
  policy_namespace: 'zordnet.dispatch.v1',
  environment: 'SANDBOX',
  key_thumbprint: 'sha256:agt01-thumbprint-dispatch',
  issued_at: '2026-07-01T00:00:00.000Z',
  expires_at: '2026-12-31T23:59:59.000Z',
  revocation_status: 'active',
  profile_version: '2',
})

register({
  agent_id: 'agt_lifecycle_obs_01',
  tenant_id: CROSS_BORDER_TENANT,
  purpose: 'Lifecycle Observer Agent — monitors signals, polls providers, surfaces contradictions.',
  owner_principal: 'role_treasury_controller_eu',
  model_provider: 'sandbox-demo',
  model_version: 'lifecycle-observer-2026.08',
  permitted_action_types: ['SIGNAL_OBSERVATION'],
  permitted_tools: ['poll_provider', 'parse_webhook', 'correlate_signal', 'detect_contradiction'],
  permitted_sources: ['bank_statement', 'psp_webhook', 'provider_poll', 'file_import'],
  allowed_rails: [],
  max_amount_per_action: { amount_minor: 0, currency: CURRENCY },
  daily_budget: { amount_minor: 0, currency: CURRENCY },
  beneficiary_constraints: {},
  jurisdictions: ['IN', 'SG', 'AE', 'EU'],
  approval_profile: 'none_readonly',
  policy_namespace: 'zordnet.observer.v1',
  environment: 'SANDBOX',
  key_thumbprint: 'sha256:agt02-thumbprint-observer',
  issued_at: '2026-07-01T00:00:00.000Z',
  expires_at: '2026-12-31T23:59:59.000Z',
  revocation_status: 'active',
  profile_version: '2',
})

register({
  agent_id: 'agt_resolution_01',
  tenant_id: CROSS_BORDER_TENANT,
  purpose: 'Resolution Agent — explains root cause, assembles evidence, proposes retry/recall/refund.',
  owner_principal: 'role_treasury_controller_eu',
  model_provider: 'sandbox-demo',
  model_version: 'resolution-agent-2026.08',
  permitted_action_types: ['EXCEPTION_RESOLUTION'],
  permitted_tools: ['explain_root_cause', 'assemble_evidence', 'propose_resolution', 'create_new_proposal'],
  permitted_sources: ['exception_log', 'signal_history', 'lifecycle_state'],
  allowed_rails: [],
  max_amount_per_action: { amount_minor: 0, currency: CURRENCY },
  daily_budget: { amount_minor: 0, currency: CURRENCY },
  beneficiary_constraints: {},
  jurisdictions: ['IN', 'SG', 'AE', 'EU'],
  approval_profile: 'dual_above_inr_50000',
  policy_namespace: 'zordnet.resolution.v1',
  environment: 'SANDBOX',
  key_thumbprint: 'sha256:agt03-thumbprint-resolution',
  issued_at: '2026-07-01T00:00:00.000Z',
  expires_at: '2026-12-31T23:59:59.000Z',
  revocation_status: 'active',
  profile_version: '1',
})

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Enrich the primary Treasury agent with live policy / structure data
 * the same way routes.js used to do inline.
 */
function enrichPrimaryAgent() {
  const policyRails = resolveAgentAllowedRails(AGENT_ID)
  const latest = getLatestAttachedStructure(AGENT_ID)
  const structures = listAgentStructures(AGENT_ID)
  return {
    ...GRAPH.agentProfile,
    allowed_rails: policyRails,
    allowed_rails_source: policyRails.length ? 'policy_structure' : 'unbound',
    latest_structure_id: latest?.structure_id ?? null,
    settlement_currency: latest?.settlement_currency ?? null,
    last_attestation: GRAPH.agentProfile.issued_at,
    historical_actions: nowHistoricalCount(),
    attached_structures_count: structures.length,
  }
}

/**
 * Enrich a supplementary agent with live fields (historical_actions etc.)
 * that depend on the current in-memory state.
 */
function enrichSupplementary(agent) {
  return {
    ...agent,
    last_attestation: agent.issued_at,
    historical_actions: nowHistoricalCount(),
    attached_structures_count: 0,
  }
}

/** Return all registered agents (primary + supplementary) as the /v1/agents list. */
export function listAgents() {
  const primary = enrichPrimaryAgent()
  const supplementary = [...registry.values()].map(enrichSupplementary)
  return [primary, ...supplementary]
}

/** Look up a single agent by id (checks primary first, then registry). */
export function getAgent(agentId) {
  if (agentId === AGENT_ID) return enrichPrimaryAgent()
  const agent = registry.get(agentId)
  return agent ? enrichSupplementary(agent) : null
}

/** Register or update an agent at runtime. */
export function upsertAgent(agent) {
  if (!agent?.agent_id) {
    const err = new Error('agent_id_required')
    err.status = 400
    throw err
  }
  const existing = registry.get(agent.agent_id)
  registry.set(agent.agent_id, { ...existing, ...agent })
  return registry.get(agent.agent_id)
}
