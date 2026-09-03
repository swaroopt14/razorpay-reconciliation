/**
 * Mutable demo state: Policy Studio notes → AgentBoundStructure → user dispatch gate.
 * Process memory only (smoke sandbox).
 */

import { AGENT_ID, GRAPH, PAC_ID, TRACE_ID } from './store.js'
import { MEDIA_ACTION } from './schemas.js'
import { sha256Hex } from './crypto.js'
import { ACTION_DEMOS, findActionDemo, seedDispatchReceiptForDemo, batchPortfolioTotals } from './actionsCatalog.js'
import { DEMO_BATCH_INR_TOTAL, demoPayoutRef } from '../demoBatchInr.js'

function hashPayload(label) {
  return `sha256:${sha256Hex(String(label))}`
}

/** @type {Map<string, object[]>} */
const structuresByAgent = new Map()

/** Display labels for rail ids used in Policy Studio drafts. */
export function normalizeRailLabel(raw) {
  const id = String(raw || '').trim()
  if (!id) return ''
  if (id === 'UPI_XB' || id === 'UPI_CROSS_BORDER') return 'UPI (Cross-Border)'
  if (id === 'approved_rails') return ''
  return id
}

/**
 * Prefer explicit approved_rails from Policy Studio; else parse route rules
 * (`rail is not in NEFT,RTGS,IMPS` / `SWIFT,UPI_XB`).
 */
export function extractApprovedRailsFromPolicy(body = {}) {
  const direct = body.approved_rails ?? body.approvedRails
  if (Array.isArray(direct) && direct.length) {
    return [...new Set(direct.map(normalizeRailLabel).filter(Boolean))]
  }
  const rules = body.policy_rules ?? body.policyRules ?? body.rules ?? []
  if (!Array.isArray(rules)) return []
  for (const rule of rules) {
    const field = String(rule?.whenField ?? rule?.when_field ?? '')
    const op = String(rule?.operator ?? '').toLowerCase()
    if (field !== 'rail') continue
    if (!op.includes('not in') && op !== 'notin') continue
    const value = String(rule?.value ?? '')
    if (!value || value === 'approved_rails') continue
    return [
      ...new Set(
        value
          .split(/[,|]/)
          .map((part) => normalizeRailLabel(part))
          .filter(Boolean),
      ),
    ]
  }
  return []
}

export function railsFromStructure(structure) {
  if (!structure) return []
  const fromDraft = structure.policy_draft?.approved_rails
  if (Array.isArray(fromDraft) && fromDraft.length) {
    return fromDraft.map(normalizeRailLabel).filter(Boolean)
  }
  if (Array.isArray(structure.approved_rails) && structure.approved_rails.length) {
    return structure.approved_rails.map(normalizeRailLabel).filter(Boolean)
  }
  return []
}

/** Agent capability rails = latest attached Policy Studio draft (not hardcoded). */
export function resolveAgentAllowedRails(agentId = AGENT_ID) {
  return railsFromStructure(getLatestAttachedStructure(agentId))
}

/**
 * Per-trace dispatch gate. Primary starts undispatched (user must click).
 * Portfolio twins that are already past dispatch seed as dispatched.
 * @type {Map<string, { dispatched: boolean, receipt: object | null, structure_id: string | null }>}
 */
const dispatchByTrace = new Map(
  ACTION_DEMOS.map((d) => [
    d.trace_id,
    {
      dispatched: Boolean(d.initially_dispatched),
      receipt: seedDispatchReceiptForDemo(d),
      structure_id: null,
    },
  ]),
)

function nowIso() {
  return new Date().toISOString()
}

function structureId() {
  return `struct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** All 20 Batch 001 payment instructions bound into AgentBoundStructure. */
export function batchPaymentInstructions() {
  return ACTION_DEMOS.map((d, i) => ({
    index: i + 1,
    human_ref: d.human_ref,
    intent_id: `batch-001-pi-${String(i + 1).padStart(3, '0')}`,
    client_payout_ref: demoPayoutRef(i),
    trace_id: d.trace_id,
    pac_id: d.pac_id,
    beneficiary: d.beneficiary,
    debtor: d.debtor,
    amount_minor: d.amount_minor,
    amount_rupees: d.amount_minor / 100,
    currency: d.currency,
    rail: d.rail,
    current_state: d.current_state,
    connector_name: d.connector_name,
  }))
}

function buildPolicyDraft(note, controlLabels, policyLabel, policyPackId, extras = {}) {
  const approvedRails = Array.isArray(extras.approved_rails)
    ? extras.approved_rails.map(normalizeRailLabel).filter(Boolean)
    : []
  return {
    status: 'DRAFT_ATTACHED',
    label: policyLabel || 'Policy draft',
    pack_id: policyPackId || null,
    note,
    control_labels: controlLabels,
    settlement_currency: extras.settlement_currency || null,
    approved_rails: approvedRails,
    ai_role: 'drafted',
    authority: 'not_final — human activation required',
  }
}

function buildBatchBinding() {
  const totals = batchPortfolioTotals()
  return {
    batch_id: 'batch-001',
    label: 'Batch 001',
    intent_count: totals.intent_count,
    intended_rupees: DEMO_BATCH_INR_TOTAL,
    intended_display: totals.intended_display,
    currency: 'INR',
    payment_instructions: batchPaymentInstructions(),
  }
}

/** Ensure older in-memory structures also carry the 20-intent batch binding. */
function hydrateStructure(structure) {
  if (!structure) return structure
  const batch = structure.batch?.payment_instructions?.length
    ? structure.batch
    : { ...(structure.batch ?? {}), ...buildBatchBinding() }
  const payment_instructions =
    structure.payment_instructions?.length > 0
      ? structure.payment_instructions
      : batch.payment_instructions
  const policy_draft =
    structure.policy_draft ??
    buildPolicyDraft(
      structure.business_note,
      structure.control_labels ?? [],
      structure.policy_label,
      structure.policy_pack_id,
      {
        approved_rails: structure.approved_rails,
        settlement_currency: structure.settlement_currency,
      },
    )
  return {
    ...structure,
    approved_rails: railsFromStructure({ ...structure, policy_draft }),
    settlement_currency:
      structure.settlement_currency ?? policy_draft.settlement_currency ?? null,
    batch: { ...batch, payment_instructions },
    payment_instructions,
    policy_draft: {
      ...policy_draft,
      approved_rails: railsFromStructure({ ...structure, policy_draft }),
    },
  }
}

function gateForTrace(traceId = TRACE_ID) {
  const id = String(traceId || TRACE_ID).trim() || TRACE_ID
  if (!dispatchByTrace.has(id)) {
    dispatchByTrace.set(id, { dispatched: false, receipt: null, structure_id: null })
  }
  return dispatchByTrace.get(id)
}

function setGateForTrace(traceId, next) {
  const id = String(traceId || TRACE_ID).trim() || TRACE_ID
  dispatchByTrace.set(id, next)
}

export function listAgentStructures(agentId = AGENT_ID) {
  return (structuresByAgent.get(agentId) ?? []).map(hydrateStructure)
}

export function getLatestAttachedStructure(agentId = AGENT_ID) {
  const list = listAgentStructures(agentId)
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].status === 'ATTACHED' || list[i].status === 'CONSUMED') return list[i]
  }
  return list[list.length - 1] ?? null
}

export function getAgentStructure(agentId, structureId) {
  const list = listAgentStructures(agentId || AGENT_ID)
  return list.find((s) => s.structure_id === structureId) ?? null
}

/**
 * Edit an attached structure's note / labels (Policy Studio view → edit).
 * Re-opens ATTACHED status and resets dispatch gate so the user must dispatch again.
 */
export function updateAgentStructure(agentId, structureId, body = {}) {
  const id = agentId || AGENT_ID
  const list = listAgentStructures(id)
  const idx = list.findIndex((s) => s.structure_id === structureId)
  if (idx < 0) {
    const err = new Error('structure_not_found')
    err.status = 404
    throw err
  }

  const current = list[idx]
  const noteRaw =
    typeof body.business_note === 'string'
      ? body.business_note
      : typeof body.businessNote === 'string'
        ? body.businessNote
        : current.business_note
  const note = String(noteRaw ?? '').trim()
  if (!note) {
    const err = new Error('business_note_required')
    err.status = 400
    throw err
  }

  const controlLabels = Array.isArray(body.control_labels)
    ? body.control_labels.map(String)
    : Array.isArray(body.controlLabels)
      ? body.controlLabels.map(String)
      : current.control_labels

  const approvedRails = extractApprovedRailsFromPolicy({
    ...body,
    approved_rails: body.approved_rails ?? body.approvedRails ?? current.approved_rails,
    policy_rules: body.policy_rules ?? body.policyRules ?? body.rules,
  })
  const settlementCurrency = String(
    body.settlement_currency ?? body.settlementCurrency ?? current.settlement_currency ?? '',
  ).trim() || null

  const updated = {
    ...current,
    business_note: note,
    control_labels: controlLabels,
    approved_rails: approvedRails.length ? approvedRails : current.approved_rails ?? [],
    settlement_currency: settlementCurrency,
    policy_pack_id:
      body.policy_pack_id != null || body.policyPackId != null
        ? String(body.policy_pack_id ?? body.policyPackId)
        : current.policy_pack_id,
    policy_label:
      body.policy_label != null || body.policyLabel != null
        ? String(body.policy_label ?? body.policyLabel)
        : current.policy_label,
    status: 'ATTACHED',
    updated_at: nowIso(),
    note_hash: hashPayload(note),
    digest: hashPayload(
      `${id}|${note}|${controlLabels.join(',')}|${(approvedRails.length ? approvedRails : current.approved_rails ?? []).join(',')}`,
    ),
    policy_draft: buildPolicyDraft(
      note,
      controlLabels,
      body.policy_label ?? body.policyLabel ?? current.policy_label,
      body.policy_pack_id ?? body.policyPackId ?? current.policy_pack_id,
      {
        approved_rails: approvedRails.length ? approvedRails : current.approved_rails ?? [],
        settlement_currency: settlementCurrency,
      },
    ),
    batch: current.batch ?? buildBatchBinding(),
    payment_instructions: current.payment_instructions?.length
      ? current.payment_instructions
      : batchPaymentInstructions(),
  }

  const next = [...list]
  next[idx] = updated
  structuresByAgent.set(id, next)
  setGateForTrace(TRACE_ID, { dispatched: false, receipt: null, structure_id: updated.structure_id })
  return hydrateStructure(updated)
}

/**
 * Compile a Policy Studio note into an AgentBoundStructure and attach to the agent.
 */
export function attachAgentStructure(agentId, body = {}) {
  const id = agentId || AGENT_ID
  const note =
    typeof body.business_note === 'string'
      ? body.business_note.trim()
      : typeof body.businessNote === 'string'
        ? body.businessNote.trim()
        : ''
  if (!note) {
    const err = new Error('business_note_required')
    err.status = 400
    throw err
  }

  const controlLabels = Array.isArray(body.control_labels)
    ? body.control_labels.map(String)
    : Array.isArray(body.controlLabels)
      ? body.controlLabels.map(String)
      : []

  const approvedRails = extractApprovedRailsFromPolicy(body)
  const settlementCurrency = String(
    body.settlement_currency ?? body.settlementCurrency ?? '',
  ).trim() || null

  const batch = buildBatchBinding()
  const structure = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    object: 'AgentBoundStructure',
    structure_id: structureId(),
    source: 'policy_studio',
    business_note: note,
    control_labels: controlLabels,
    approved_rails: approvedRails,
    settlement_currency: settlementCurrency,
    policy_pack_id: String(body.policy_pack_id ?? body.policyPackId ?? ''),
    policy_label: String(body.policy_label ?? body.policyLabel ?? ''),
    agent_id: id,
    tenant_id: GRAPH.agentProfile.tenant_id,
    compiled_at: nowIso(),
    status: 'ATTACHED',
    ai_role: 'drafted',
    note_hash: hashPayload(note),
    digest: hashPayload(
      `${id}|${note}|${controlLabels.join(',')}|${approvedRails.join(',')}|${batch.intent_count}`,
    ),
    policy_draft: buildPolicyDraft(
      note,
      controlLabels,
      body.policy_label ?? body.policyLabel,
      body.policy_pack_id ?? body.policyPackId,
      {
        approved_rails: approvedRails,
        settlement_currency: settlementCurrency,
      },
    ),
    batch,
    payment_instructions: batch.payment_instructions,
  }

  const prev = structuresByAgent.get(id) ?? []
  structuresByAgent.set(id, [...prev, structure])
  // New attach resets user-dispatch gate for the primary demo trace.
  setGateForTrace(TRACE_ID, { dispatched: false, receipt: null, structure_id: structure.structure_id })
  return hydrateStructure(structure)
}

/** Enrich proposal / PAC views with the latest attached structure. */
export function withStructureOverlay(baseObject, kind = 'proposal') {
  const structure = getLatestAttachedStructure(AGENT_ID)
  if (!structure) return baseObject

  const noteExcerpt =
    structure.business_note.length > 280
      ? `${structure.business_note.slice(0, 277)}…`
      : structure.business_note

  if (kind === 'proposal') {
    return {
      ...baseObject,
      business_context: {
        ...(baseObject.business_context ?? {}),
        policy_studio_note: noteExcerpt,
        policy_draft_ref: structure.structure_id,
        control_labels: structure.control_labels,
      },
      attached_structure_id: structure.structure_id,
      rationale_summary: `${baseObject.rationale_summary ?? ''} Policy Studio note bound: ${noteExcerpt}`,
    }
  }

  if (kind === 'pac') {
    const policyRails = railsFromStructure(structure)
    return {
      ...baseObject,
      business_context: {
        ...(baseObject.business_context ?? {}),
        policy_studio_note: noteExcerpt,
        policy_draft_ref: structure.structure_id,
        control_labels: structure.control_labels,
        settlement_currency: structure.settlement_currency ?? null,
      },
      execution_constraints: {
        ...(baseObject.execution_constraints ?? {}),
        ...(policyRails.length ? { allowed_rails: policyRails } : {}),
        notes: noteExcerpt,
        policy_draft_ref: structure.structure_id,
      },
      authority: {
        ...(baseObject.authority ?? {}),
        policy_draft_ref: structure.structure_id,
      },
      attached_structure_id: structure.structure_id,
    }
  }

  return baseObject
}

export function getDispatchGate(traceId = TRACE_ID) {
  const gate = gateForTrace(traceId)
  return {
    dispatched: gate.dispatched,
    structure_id: gate.structure_id ?? getLatestAttachedStructure()?.structure_id ?? null,
    has_structure: Boolean(getLatestAttachedStructure()),
    receipt: gate.receipt,
    trace_id: String(traceId || TRACE_ID),
  }
}

export function executeUserDispatch(pacOrTraceId = PAC_ID) {
  const demo = findActionDemo(pacOrTraceId) ?? findActionDemo(TRACE_ID)
  const traceId = demo?.trace_id ?? TRACE_ID
  const structure = getLatestAttachedStructure(AGENT_ID)
  const seeded = demo ? seedDispatchReceiptForDemo({ ...demo, initially_dispatched: true, current_state: 'DISPATCHED' }) : null
  const base = seeded ?? GRAPH.dispatchReceipt
  const receipt = {
    ...base,
    pac_id: demo?.pac_id ?? PAC_ID,
    trace_id: traceId,
    connector_id: demo?.connector_id ?? base.connector_id,
    provider_reference:
      demo?.provider_reference ||
      `USER-DISPATCH-${String(demo?.human_ref || 'PAC').replace(/[^A-Z0-9]/gi, '')}`,
    gateway_executed: true,
    outcome: 'ACKNOWLEDGED',
    dispatched_at: nowIso(),
    pac_revalidation: 'PASS',
    structure_id: structure?.structure_id ?? null,
    business_note_bound: Boolean(structure),
    user_initiated: true,
  }

  if (structure && demo?.primary) {
    structure.status = 'CONSUMED'
  }

  setGateForTrace(traceId, {
    dispatched: true,
    receipt,
    structure_id: structure?.structure_id ?? null,
  })
  return receipt
}

export function enrichDispatchView(baseView, traceId = TRACE_ID) {
  const gate = getDispatchGate(traceId)
  const structure = getLatestAttachedStructure(AGENT_ID)
  const policyRails = railsFromStructure(structure)
  const withPolicyRails = {
    ...baseView,
    allowed_rails: policyRails.length
      ? policyRails
      : Array.isArray(baseView.allowed_rails)
        ? baseView.allowed_rails
        : [],
    allowed_rails_source: policyRails.length ? 'policy_structure' : 'pac_default',
  }
  if (!gate.dispatched) {
    return {
      ...withPolicyRails,
      receipt: {
        ...withPolicyRails.receipt,
        gateway_executed: false,
        outcome: 'AWAITING_USER_DISPATCH',
        provider_reference: null,
        dispatched_at: null,
        user_initiated: false,
      },
      attempts: [],
      dispatch_gate: {
        dispatched: false,
        has_structure: gate.has_structure,
        structure_id: gate.structure_id,
        ready: true,
        message: gate.has_structure
          ? 'PAC ready. User must dispatch. Structure from Policy Studio is bound.'
          : 'PAC ready. User must dispatch. No Policy Studio structure attached yet (optional for demo).',
        trace_id: gate.trace_id,
      },
    }
  }
  return {
    ...withPolicyRails,
    receipt: gate.receipt ?? withPolicyRails.receipt,
    attempts: [gate.receipt ?? withPolicyRails.receipt],
    dispatch_gate: {
      dispatched: true,
      has_structure: gate.has_structure,
      structure_id: gate.structure_id,
      ready: false,
      message: 'Dispatch completed by user. Signals and lifecycle may proceed.',
      trace_id: gate.trace_id,
    },
  }
}

export function enrichLifecycleForDispatchGate(lifecycle, traceId = TRACE_ID) {
  const gate = getDispatchGate(traceId)
  if (gate.dispatched) return lifecycle

  const pendingAfter = new Set(['dispatch', 'observe', 'derive', 'prove'])
  return {
    ...lifecycle,
    current_state: 'DISPATCH_READY',
    settlement_value: undefined,
    match_label: 'Awaiting user dispatch',
    activity: [
      {
        id: 'await_dispatch',
        title: 'Awaiting user dispatch',
        at: 'now',
        kind: 'inferred',
      },
      ...(lifecycle.activity ?? []).filter((a) => !String(a.title).toLowerCase().includes('settlement')),
    ],
    nodes: (lifecycle.nodes ?? []).map((n) =>
      pendingAfter.has(n.id)
        ? {
            ...n,
            state: n.id === 'dispatch' ? 'DISPATCH_READY' : 'QUEUED',
            detail:
              n.id === 'dispatch'
                ? 'User must dispatch — gateway has not executed'
                : 'Blocked until user dispatch',
          }
        : n,
    ),
    dispatch_gate: {
      dispatched: false,
      structure_id: gate.structure_id,
      has_structure: gate.has_structure,
      trace_id: gate.trace_id,
    },
  }
}

export function enrichSignalsForDispatchGate(signalsPayload, traceId = TRACE_ID) {
  const gate = getDispatchGate(traceId)
  if (gate.dispatched) return signalsPayload
  return {
    items: [],
    dispatch_gate: {
      dispatched: false,
      message: 'No outcome signals until the user dispatches the Payment Action Contract.',
      trace_id: gate.trace_id,
    },
  }
}
