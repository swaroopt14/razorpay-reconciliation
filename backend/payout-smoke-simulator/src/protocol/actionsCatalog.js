/**
 * Multi-action catalog for Dispatch / Lifecycle — all 20 Batch 001 intents in INR.
 * Amounts match demoPayoutAmounts / smoke fixtures (₹55,000 total).
 */
import { sealObject, sha256Hex } from './crypto.js'
import { MEDIA_ACTION, MEDIA_EVIDENCE } from './schemas.js'
import {
  DEMO_BATCH_INR_TOTAL,
  DEMO_PAYOUT_AMOUNTS_INR,
  demoPayeeLabel,
  demoPayoutAmountMinor,
  demoPayoutRef,
} from '../demoBatchInr.js'
import {
  AGENT_ID,
  AMOUNT_MINOR,
  CURRENCY,
  GRAPH,
  PAC_ID,
  TRACE_ID,
  lifecycleNodes,
} from './store.js'

/** @typedef {{
 *   trace_id: string,
 *   pac_id: string,
 *   proposal_id: string,
 *   human_ref: string,
 *   invoice_ref: string,
 *   po_ref: string,
 *   beneficiary: string,
 *   debtor: string,
 *   amount_minor: number,
 *   currency: string,
 *   current_state: string,
 *   rail: string,
 *   connector_name: string,
 *   connector_id: string,
 *   provider_reference: string,
 *   cost: string,
 *   cutoff: string,
 *   initially_dispatched: boolean,
 *   evidence_completeness: number,
 *   match_label: string,
 *   contract_ref: string,
 *   cost_center: string,
 *   t0: string,
 *   primary?: boolean,
 *   index: number,
 * }} ActionDemo */

const DEBTOR = 'Zordnet Operations'
const CONNECTORS = [
  { name: 'Razorpay Sandbox', id: 'conn_razorpay_sandbox', cost: 'INR 2.00', cutoff: '18:00 IST' },
  { name: 'Cashfree Sandbox', id: 'conn_cashfree_sandbox', cost: 'INR 1.50', cutoff: 'instant' },
]

/** Lifecycle variety across the 20-intent batch (story-aligned). */
function stateForIndex(i) {
  if (i === 0) return { state: 'SETTLED_CONFIRMED', dispatched: false, evidence: 1, match: 'Exact match' } // primary: user must dispatch
  if (i === 18) return { state: 'SETTLED_PROVISIONAL', dispatched: true, evidence: 0.78, match: 'Provisional — short settlement observed' }
  if (i === 19) return { state: 'DISPATCH_READY', dispatched: false, evidence: 0.45, match: 'Blocked — beneficiary change under review' }
  if (i === 7 || i === 14) return { state: 'IN_PROCESS', dispatched: true, evidence: 0.42, match: 'In process — settlement not observed' }
  if (i === 3 || i === 11) return { state: 'SETTLED_PROVISIONAL', dispatched: true, evidence: 0.82, match: 'Provisional — UTR pending finality' }
  if (i % 5 === 4) return { state: 'DISPATCH_READY', dispatched: false, evidence: 0.55, match: 'Awaiting user dispatch' }
  return { state: 'SETTLED_CONFIRMED', dispatched: true, evidence: 1, match: 'Exact match' }
}

/** Operational demo rail for INR Batch 001 — agent allow-list still comes from Policy Studio. */
function railForIndex(i) {
  if (i % 4 === 0) return 'UPI'
  if (i % 3 === 0) return 'IMPS'
  return 'NEFT'
}

/** @type {ActionDemo[]} */
export const ACTION_DEMOS = DEMO_PAYOUT_AMOUNTS_INR.map((rupees, i) => {
  const ref = demoPayoutRef(i)
  const slug = ref.toLowerCase().replace(/[^a-z0-9]/g, '')
  const story = stateForIndex(i)
  const rail = railForIndex(i)
  const conn = CONNECTORS[i % CONNECTORS.length]
  return {
    primary: i === 0,
    index: i,
    trace_id: i === 0 ? TRACE_ID : `trc_batch001_${slug}`,
    pac_id: i === 0 ? PAC_ID : `pac_batch001_${slug}`,
    proposal_id: i === 0 ? 'ap_novacell_inv10482' : `ap_batch001_${slug}`,
    human_ref: ref,
    invoice_ref: ref,
    po_ref: 'BATCH-001',
    beneficiary: demoPayeeLabel(i),
    debtor: DEBTOR,
    amount_minor: demoPayoutAmountMinor(i),
    currency: CURRENCY,
    current_state: story.state,
    rail,
    connector_name: conn.name,
    connector_id: conn.id,
    provider_reference: story.dispatched
      ? `${conn.id === 'conn_razorpay_sandbox' ? 'RZP' : 'CF'}-${rail}-${10000 + i}`
      : '',
    cost: conn.cost,
    cutoff: rail === 'IMPS' || rail === 'UPI' ? 'instant' : conn.cutoff,
    initially_dispatched: story.dispatched,
    evidence_completeness: story.evidence,
    match_label: story.match,
    contract_ref: `MSA-${slug.toUpperCase()}-2025`,
    cost_center: 'CC-IN-TREASURY',
    t0: `2026-08-${String(10 + (i % 4)).padStart(2, '0')}T${String(8 + (i % 8)).padStart(2, '0')}:04:00.000Z`,
  }
})

// Sanity: primary amount must match sealed GRAPH
if (ACTION_DEMOS[0].amount_minor !== AMOUNT_MINOR) {
  console.warn('[actionsCatalog] primary amount_minor drift vs GRAPH', ACTION_DEMOS[0].amount_minor, AMOUNT_MINOR)
}

function hashPayload(label) {
  return `sha256:${sha256Hex(String(label))}`
}

function formatMajor(amountMinor, currency) {
  return (amountMinor / 100).toLocaleString(currency === 'INR' ? 'en-IN' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  })
}

function majorPlain(amountMinor) {
  return (amountMinor / 100).toFixed(2)
}

function slug(demo) {
  return demo.trace_id.replace(/^trc_/, '')
}

const STATE_ORDER = [
  'DRAFT',
  'PROPOSED',
  'AWAITING_AUTHORITY',
  'AUTHORIZED',
  'DISPATCH_READY',
  'DISPATCHED',
  'ACKNOWLEDGED',
  'IN_PROCESS',
  'SETTLED_PROVISIONAL',
  'SETTLED_CONFIRMED',
]

function stateRank(state) {
  const i = STATE_ORDER.indexOf(state)
  return i < 0 ? STATE_ORDER.length : i
}

function hasReached(demo, state) {
  return stateRank(demo.current_state) >= stateRank(state)
}

export function findActionDemo(id) {
  const key = String(id || '').trim()
  if (!key) return ACTION_DEMOS[0]
  return (
    ACTION_DEMOS.find(
      (d) => d.trace_id === key || d.pac_id === key || d.proposal_id === key || d.human_ref === key,
    ) ?? null
  )
}

export function isKnownActionId(id) {
  return Boolean(findActionDemo(id))
}

export function listActionSummaries() {
  return ACTION_DEMOS.map((d) => ({
    trace_id: d.trace_id,
    pac_id: d.pac_id,
    proposal_id: d.proposal_id,
    agent_id: AGENT_ID,
    human_ref: d.human_ref,
    beneficiary: d.beneficiary,
    debtor: d.debtor,
    amount_minor: d.amount_minor,
    currency: d.currency,
    amount_display: formatMajor(d.amount_minor, d.currency),
    current_state: d.current_state,
    rail: d.rail,
    connector_name: d.connector_name,
    primary: Boolean(d.primary),
    href_dispatch: `/actions/${d.trace_id}/dispatch`,
    href_lifecycle: `/actions/${d.trace_id}/lifecycle`,
  }))
}

export function batchPortfolioTotals() {
  const intendedMinor = ACTION_DEMOS.reduce((s, d) => s + d.amount_minor, 0)
  return {
    intent_count: ACTION_DEMOS.length,
    intended_minor: intendedMinor,
    intended_display: formatMajor(intendedMinor, CURRENCY),
    intended_rupees: DEMO_BATCH_INR_TOTAL,
    currency: CURRENCY,
  }
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

function buildSignals(demo) {
  if (!hasReached(demo, 'DISPATCHED')) return []
  const key = slug(demo)
  const rows = []
  if (hasReached(demo, 'ACKNOWLEDGED')) {
    rows.push({
      envelope_id: `sig_${key}_accepted`,
      channel: 'webhook',
      raw_event_type: 'ACCEPTED',
      occurred_at: addMinutes(demo.t0, 6),
      emitted_at: addMinutes(demo.t0, 6),
      received_at: addMinutes(demo.t0, 7),
      duplicate: false,
      accepted: true,
      mapping_candidate: 'ACKNOWLEDGED',
      correlation_confidence: 0.99,
    })
  }
  if (hasReached(demo, 'IN_PROCESS')) {
    rows.push({
      envelope_id: `sig_${key}_processing`,
      channel: 'webhook',
      raw_event_type: 'PROCESSING',
      occurred_at: addMinutes(demo.t0, 8),
      emitted_at: addMinutes(demo.t0, 8),
      received_at: addMinutes(demo.t0, 9),
      duplicate: false,
      accepted: true,
      mapping_candidate: 'IN_PROCESS',
      correlation_confidence: 0.98,
    })
  }
  if (hasReached(demo, 'SETTLED_PROVISIONAL')) {
    rows.push({
      envelope_id: `sig_${key}_stmt`,
      channel: 'statement',
      raw_event_type: 'STATEMENT_DEBIT',
      occurred_at: addMinutes(demo.t0, 22),
      emitted_at: addMinutes(demo.t0, 28),
      received_at: addMinutes(demo.t0, 29),
      duplicate: false,
      accepted: true,
      mapping_candidate: 'SETTLED_PROVISIONAL',
      correlation_confidence: 0.96,
    })
  }
  if (hasReached(demo, 'SETTLED_CONFIRMED')) {
    rows.push({
      envelope_id: `sig_${key}_final`,
      channel: 'poll',
      raw_event_type: 'BANK_STATUS_ACSC',
      occurred_at: addMinutes(demo.t0, 40),
      emitted_at: addMinutes(demo.t0, 40),
      received_at: addMinutes(demo.t0, 41),
      duplicate: false,
      accepted: true,
      mapping_candidate: 'SETTLED_CONFIRMED',
      correlation_confidence: 0.99,
    })
  }
  return rows.map((row) => ({
    spec_version: 'zord.evidence.v1',
    media_type: MEDIA_EVIDENCE,
    trace_id: demo.trace_id,
    provider: demo.connector_name,
    connector_id: demo.connector_id,
    provider_reference: demo.provider_reference,
    raw_payload_hash: hashPayload(`${row.envelope_id}|${row.raw_event_type}|${demo.amount_minor}`),
    raw_storage_ref: `sandbox://signals/${row.envelope_id}`,
    mapping_version: `${demo.connector_id}-v1`,
    observed_at: row.received_at,
    source_reliability_class: row.channel === 'statement' ? 'bank_statement' : 'provider_webhook',
    source_signature: { present: true, verified: true, key_id: `${demo.connector_id}-key` },
    ...row,
    dedupe_fingerprint: `${demo.connector_id}|${row.raw_event_type}|${demo.provider_reference || demo.pac_id}`,
  }))
}

function buildTransitions(demo) {
  const key = slug(demo)
  return [
    { receipt_id: `ltr_${key}_1`, previous_state: 'DRAFT', next_state: 'PROPOSED', at: addMinutes(demo.t0, 1), evidence_ids: [`env_erp_${key}`] },
    { receipt_id: `ltr_${key}_2`, previous_state: 'PROPOSED', next_state: 'AWAITING_AUTHORITY', at: addMinutes(demo.t0, 2), evidence_ids: [demo.proposal_id] },
    { receipt_id: `ltr_${key}_3`, previous_state: 'AWAITING_AUTHORITY', next_state: 'AUTHORIZED', at: addMinutes(demo.t0, 3), evidence_ids: [`cred_ctrl_${key}`, `cred_cfo_${key}`] },
    { receipt_id: `ltr_${key}_4`, previous_state: 'AUTHORIZED', next_state: 'DISPATCH_READY', at: addMinutes(demo.t0, 4), evidence_ids: [demo.pac_id] },
    { receipt_id: `ltr_${key}_5`, previous_state: 'DISPATCH_READY', next_state: 'DISPATCHED', at: addMinutes(demo.t0, 5), evidence_ids: [`dpr_${key}_1`] },
    { receipt_id: `ltr_${key}_6`, previous_state: 'DISPATCHED', next_state: 'ACKNOWLEDGED', at: addMinutes(demo.t0, 7), evidence_ids: [`sig_${key}_accepted`] },
    { receipt_id: `ltr_${key}_7`, previous_state: 'ACKNOWLEDGED', next_state: 'IN_PROCESS', at: addMinutes(demo.t0, 9), evidence_ids: [`sig_${key}_processing`] },
    { receipt_id: `ltr_${key}_8`, previous_state: 'IN_PROCESS', next_state: 'SETTLED_PROVISIONAL', at: addMinutes(demo.t0, 29), evidence_ids: [`sig_${key}_stmt`] },
    { receipt_id: `ltr_${key}_9`, previous_state: 'SETTLED_PROVISIONAL', next_state: 'SETTLED_CONFIRMED', at: addMinutes(demo.t0, 41), evidence_ids: [`sig_${key}_final`] },
  ]
    .filter((row) => stateRank(row.next_state) <= stateRank(demo.current_state))
    .map((row) => ({
      spec_version: 'zord.evidence.v1',
      media_type: MEDIA_EVIDENCE,
      trace_id: demo.trace_id,
      state_machine_version: 'payout-lifecycle-v1',
      mapping_version: `${demo.connector_id}-v1`,
      contradictions: [],
      digest: hashPayload(`${row.receipt_id}|${row.next_state}|${demo.trace_id}`),
      ...row,
      accepted_evidence_ids: row.evidence_ids,
    }))
}

function buildDispatchReceipt(demo) {
  if (!hasReached(demo, 'DISPATCHED') && !demo.initially_dispatched) {
    return {
      spec_version: 'zord.action.v1',
      media_type: MEDIA_ACTION,
      receipt_id: `dpr_${slug(demo)}_pending`,
      pac_id: demo.pac_id,
      trace_id: demo.trace_id,
      connector_id: demo.connector_id,
      connector_version: `${demo.connector_id}-1.0`,
      recommended_by_agent: true,
      gateway_executed: false,
      idempotency_key: `idem_${demo.pac_id}`,
      attempt: 0,
      request_digest: null,
      response_digest: null,
      provider_reference: null,
      provider_acknowledgement: null,
      outcome: 'AWAITING_USER_DISPATCH',
      dispatched_at: null,
      pac_revalidation: 'PENDING',
      environment: 'SANDBOX',
    }
  }
  return {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    receipt_id: `dpr_${slug(demo)}_1`,
    pac_id: demo.pac_id,
    trace_id: demo.trace_id,
    connector_id: demo.connector_id,
    connector_version: `${demo.connector_id}-1.0`,
    recommended_by_agent: true,
    gateway_executed: true,
    idempotency_key: `idem_${demo.pac_id}`,
    attempt: 1,
    request_digest: hashPayload(`dispatch-request-${demo.pac_id}`),
    response_digest: hashPayload(`dispatch-ack-${demo.provider_reference}`),
    provider_reference: demo.provider_reference,
    provider_acknowledgement: 'ACCEPTED',
    http_signature: { present: true, verified: true, profile: 'RFC9421', result: 'SANDBOX_DEMO' },
    outcome: 'ACKNOWLEDGED',
    dispatched_at: addMinutes(demo.t0, 5),
    pac_revalidation: 'PASS',
    environment: 'SANDBOX',
  }
}

function buildActivity(demo) {
  const items = [
    { id: `${demo.trace_id}-a-seal`, title: `Payment Action Contract sealed · ${demo.human_ref}`, at: addMinutes(demo.t0, 4), kind: 'verified', minState: 'DISPATCH_READY' },
    { id: `${demo.trace_id}-a-policy`, title: `Policy allow · ${demo.beneficiary}`, at: addMinutes(demo.t0, 3), kind: 'verified', minState: 'AUTHORIZED' },
    { id: `${demo.trace_id}-a-dispatch`, title: `Dispatched via ${demo.connector_name}`, at: addMinutes(demo.t0, 5), kind: 'deterministic', minState: 'DISPATCHED' },
    { id: `${demo.trace_id}-a-ack`, title: `Provider ack ${demo.provider_reference || 'pending'}`, at: addMinutes(demo.t0, 7), kind: 'deterministic', minState: 'ACKNOWLEDGED' },
    { id: `${demo.trace_id}-a-process`, title: `${demo.rail} in process · ${formatMajor(demo.amount_minor, demo.currency)}`, at: addMinutes(demo.t0, 9), kind: 'inferred', minState: 'IN_PROCESS' },
    { id: `${demo.trace_id}-a-prov`, title: `Settlement signal · ${demo.beneficiary}`, at: addMinutes(demo.t0, 29), kind: 'verified', minState: 'SETTLED_PROVISIONAL' },
    { id: `${demo.trace_id}-a-final`, title: `Settlement confirmed · ${demo.human_ref}`, at: addMinutes(demo.t0, 41), kind: 'verified', minState: 'SETTLED_CONFIRMED' },
  ]
  const reached = items.filter((row) => hasReached(demo, row.minState))
  if (!demo.initially_dispatched && demo.current_state === 'DISPATCH_READY') {
    return [
      { id: `${demo.trace_id}-await`, title: `Awaiting user dispatch · ${demo.human_ref}`, at: 'now', kind: 'inferred' },
      ...reached.map(({ minState: _m, ...rest }) => rest).reverse(),
    ]
  }
  return reached.map(({ minState: _m, ...rest }) => rest).reverse()
}

function buildLifecycleNodes(demo) {
  const deriveState = hasReached(demo, 'SETTLED_CONFIRMED')
    ? 'SETTLED_CONFIRMED'
    : hasReached(demo, 'SETTLED_PROVISIONAL')
      ? 'SETTLED_PROVISIONAL'
      : hasReached(demo, 'IN_PROCESS')
        ? 'IN_PROCESS'
        : hasReached(demo, 'DISPATCHED')
          ? 'DISPATCHED'
          : 'DISPATCH_READY'
  const proveState = hasReached(demo, 'SETTLED_CONFIRMED')
    ? 'SETTLED_CONFIRMED'
    : hasReached(demo, 'SETTLED_PROVISIONAL')
      ? 'SETTLED_PROVISIONAL'
      : 'QUEUED'

  return [
    { id: 'capture', label: 'Capture obligation', object: 'RawEnvelope', state: 'DRAFT', detail: `${demo.invoice_ref} / ${demo.po_ref}`, stage: 'Create' },
    { id: 'propose', label: 'Propose action', object: 'ActionProposal', state: 'PROPOSED', detail: `${demo.beneficiary} · ${formatMajor(demo.amount_minor, demo.currency)}`, stage: 'Create' },
    { id: 'authority', label: 'Authority check', object: 'AuthorityCredential', state: 'AWAITING_AUTHORITY', detail: 'Signer + mandate verified', stage: 'Govern' },
    { id: 'policy', label: 'Policy decision', object: 'PolicyDecisionReceipt', state: 'AUTHORIZED', detail: 'Controls allow dispatch', stage: 'Govern' },
    { id: 'pac', label: 'Seal contract', object: 'PaymentActionContract', state: 'DISPATCH_READY', detail: demo.pac_id, stage: 'Seal' },
    {
      id: 'dispatch',
      label: 'Dispatch attempt',
      object: 'DispatchReceipt',
      state: hasReached(demo, 'DISPATCHED') ? 'DISPATCHED' : 'DISPATCH_READY',
      detail: hasReached(demo, 'DISPATCHED') ? demo.connector_name : 'User must dispatch — gateway has not executed',
      stage: 'Dispatch',
    },
    {
      id: 'observe',
      label: 'Observe signals',
      object: 'SignalEnvelope',
      state: hasReached(demo, 'IN_PROCESS') ? 'IN_PROCESS' : hasReached(demo, 'ACKNOWLEDGED') ? 'ACKNOWLEDGED' : 'QUEUED',
      detail: hasReached(demo, 'ACKNOWLEDGED') ? `${demo.provider_reference || 'signals'} correlated` : 'Blocked until dispatch',
      stage: 'Observe',
    },
    { id: 'derive', label: 'Match outcome', object: 'LifecycleTransitionReceipt', state: deriveState, detail: demo.match_label, stage: 'Resolve' },
    {
      id: 'prove',
      label: 'Evidence pack',
      object: 'ProofPackManifest',
      state: proveState,
      detail: hasReached(demo, 'SETTLED_CONFIRMED')
        ? 'Portable proof ready'
        : hasReached(demo, 'SETTLED_PROVISIONAL')
          ? 'Partial evidence'
          : 'Not proof-ready yet',
      stage: 'Prove',
    },
  ]
}

export function projectGraphForDemo(demo) {
  if (!demo || demo.primary) return GRAPH

  const key = slug(demo)
  const amountMajor = majorPlain(demo.amount_minor)
  const executeBy = addMinutes(demo.t0, 180)
  const signals = buildSignals(demo)
  const transitions = buildTransitions(demo)
  const dispatchReceipt = buildDispatchReceipt(demo)

  const rawEnvelope = {
    spec_version: 'zord.evidence.v1',
    media_type: MEDIA_EVIDENCE,
    envelope_id: `env_erp_${key}`,
    trace_id: demo.trace_id,
    tenant_id: 'tenant_novacell_eu',
    source: { system: 'Zordnet ERP', channel: 'api', mapping_version: 'erp-inr-v3' },
    received_at: demo.t0,
    payload_hash: hashPayload(`${demo.invoice_ref}|${demo.po_ref}|${demo.currency}${amountMajor}|${demo.beneficiary}`),
    instruction: `Pay ${formatMajor(demo.amount_minor, demo.currency)} to ${demo.beneficiary} against ${demo.invoice_ref} in ${demo.po_ref}.`,
    invoice_refs: [demo.invoice_ref],
    po_refs: [demo.po_ref],
    environment: 'SANDBOX',
  }

  const actionProposal = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    proposal_id: demo.proposal_id,
    trace_id: demo.trace_id,
    tenant_id: 'tenant_novacell_eu',
    status: 'AUTHORIZED',
    agent_id: AGENT_ID,
    capability_profile_id: AGENT_ID,
    confidence: { overall: 0.9, amount: 0.98, beneficiary: 0.93, invoice: 0.95, execute_by: 0.87 },
    missing_fields: [],
    ambiguities: [],
    rationale_summary: `${demo.invoice_ref} matches ${demo.po_ref} and approved vendor ${demo.beneficiary}.`,
    retrieved_evidence_ids: [rawEnvelope.envelope_id, `doc_${key}`, `vend_${key}`],
    source_hashes: [rawEnvelope.payload_hash],
    mapping_version: 'erp-inr-v3',
    action: {
      type: 'SUPPLIER_PAYOUT',
      debtor_ref: demo.debtor,
      beneficiary_ref: demo.beneficiary,
      amount_minor: demo.amount_minor,
      currency: demo.currency,
      execute_by: executeBy,
    },
    business_context: {
      purpose_code: 'SUPP',
      invoice_refs: [demo.invoice_ref],
      po_refs: [demo.po_ref],
      cost_center: demo.cost_center,
      contract_ref: demo.contract_ref,
    },
    created_at: addMinutes(demo.t0, 1),
    environment: 'SANDBOX',
  }

  const policyDecision = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    receipt_id: `pdr_${key}`,
    trace_id: demo.trace_id,
    decision: demo.index === 19 ? 'BLOCK' : 'ALLOW',
    obligations: ['APPROVED_VENDOR_ONLY', 'INR_RAILS_ONLY'],
    policy_id: 'pol_zordnet_treasury',
    policy_version: 'v14',
    policy_hash: hashPayload('pol_zordnet_treasury.v14.compiled'),
    rule_ids: demo.index === 19 ? ['R-NO-BENEFICIARY-CHANGE-30D'] : ['R-VENDOR-APPROVED', 'R-INR-RAILS'],
    input_hash: hashPayload(`${demo.proposal_id}|${demo.amount_minor}`),
    compiled_artifact: 'policy.zordnet.treasury.v14.json',
    ai_role: 'drafted',
    environment: 'SANDBOX',
    decided_at: addMinutes(demo.t0, 3),
  }

  const pacUnsigned = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    pac_id: demo.pac_id,
    tenant_id: 'tenant_novacell_eu',
    trace_id: demo.trace_id,
    environment: 'SANDBOX',
    principal: { org_id: 'org_zordnet', legal_entity_ref: demo.debtor, trust_domain: 'zordnet.com' },
    actor: {
      type: 'agent',
      actor_id: AGENT_ID,
      agent_id: AGENT_ID,
      capability_profile_hash: hashPayload(AGENT_ID),
      key_thumbprint: 'sha256:agt04-thumbprint-novacell',
    },
    source: {
      raw_envelope_ids: [rawEnvelope.envelope_id],
      source_hashes: [rawEnvelope.payload_hash],
      canonical_intent_id: `int_${key}`,
      mapping_version: 'erp-inr-v3',
    },
    business_context: actionProposal.business_context,
    action: actionProposal.action,
    authority: {
      credential_refs: [`cred_org_${key}`, `cred_ctrl_${key}`, `cred_cfo_${key}`, `cred_agent_${key}`],
      policy_id: policyDecision.policy_id,
      policy_version: policyDecision.policy_version,
      policy_hash: policyDecision.policy_hash,
      decision_receipt_hash: hashPayload(policyDecision.receipt_id),
      approval_refs: [`appr_ctrl_${key}`, `appr_cfo_${key}`],
      separation_of_duties: true,
    },
    execution_constraints: {
      allowed_rails: [],
      allowed_connectors: [demo.connector_id],
      max_fee_minor: 500,
      idempotency_key: `idem_${demo.pac_id}`,
      retry_policy: 'safe-idempotent',
      max_attempts: 2,
      expiry: executeBy,
    },
    evidence_policy: {
      required_sources: ['provider_acknowledgement', 'bank_status_or_statement_debit'],
      finality_profile: demo.rail,
      disclosure_profile: 'operator_full',
    },
    created_at: addMinutes(demo.t0, 4),
    expires_at: executeBy,
  }
  const pac = sealObject(pacUnsigned).object

  const authorityCredentials = [
    { credential_id: `cred_org_${key}`, kind: 'enterprise_root', principal: { org_id: 'org_zordnet', legal_entity_ref: demo.debtor }, subject: { type: 'organization', id: 'org_zordnet' } },
    { credential_id: `cred_ctrl_${key}`, kind: 'delegating_principal', principal: { org_id: 'org_zordnet', role: 'Treasury Controller' }, subject: { type: 'human', id: 'usr_controller_in', name: 'A. Keller' } },
    { credential_id: `cred_cfo_${key}`, kind: 'delegating_principal', principal: { org_id: 'org_zordnet', role: 'CFO' }, subject: { type: 'human', id: 'usr_cfo_in', name: 'M. Duarte' } },
    { credential_id: `cred_agent_${key}`, kind: 'agent_workload', principal: { org_id: 'org_zordnet', agent_id: AGENT_ID }, subject: { type: 'agent', id: AGENT_ID } },
  ]

  const finality = hasReached(demo, 'SETTLED_PROVISIONAL')
    ? {
        spec_version: 'zord.evidence.v1',
        media_type: MEDIA_EVIDENCE,
        certificate_id: `fin_${key}`,
        trace_id: demo.trace_id,
        finality_profile: demo.rail,
        profile_version: '1',
        conclusion: demo.current_state,
        terminal_label: demo.match_label,
        supporting_evidence: signals.filter((s) => s.accepted).map((s) => s.envelope_id),
        supporting_evidence_ids: signals.filter((s) => s.accepted).map((s) => s.envelope_id),
        exclusions: [],
        unresolved_caveats: hasReached(demo, 'SETTLED_CONFIRMED') ? [] : ['Awaiting bank final confirmation'],
        issued_at: addMinutes(demo.t0, hasReached(demo, 'SETTLED_CONFIRMED') ? 42 : 30),
      }
    : null

  return {
    scenario: 'cross-border',
    label: `${demo.human_ref} · ${demo.beneficiary}`,
    tenant: GRAPH.tenant,
    ids: {
      trace_id: demo.trace_id,
      pac_id: demo.pac_id,
      proposal_id: demo.proposal_id,
      agent_id: AGENT_ID,
      provider_reference: demo.provider_reference || null,
      pac_digest: pac.digest,
    },
    agentProfile: GRAPH.agentProfile,
    rawEnvelope,
    actionProposal,
    authorityCredentials,
    policyDecision,
    pac,
    dispatchReceipt,
    signals,
    transitions,
    finality,
    proofPack: {
      pack_id: `pp_${key}`,
      trace_id: demo.trace_id,
      pac_id: demo.pac_id,
      merkle_root: hashPayload(`merkle|${demo.trace_id}|${demo.amount_minor}`),
      evidence_object_count: 4 + signals.length + transitions.length,
      environment: 'SANDBOX',
    },
    current_state: demo.current_state,
    finality_label: demo.match_label,
    jwks: GRAPH.jwks,
  }
}

export function lifecycleNodesForDemo(demo) {
  if (!demo || demo.primary) {
    const base = lifecycleNodes()
    const primary = ACTION_DEMOS[0]
    return {
      ...base,
      human_ref: primary.human_ref,
      beneficiary: primary.debtor,
      counterparty: primary.beneficiary,
      rail: primary.rail,
      intended_value: { amount: majorPlain(primary.amount_minor), currency: primary.currency },
      settlement_value: { amount: majorPlain(primary.amount_minor), currency: primary.currency },
      match_label: primary.match_label,
      evidence_completeness: primary.evidence_completeness,
      batch_totals: batchPortfolioTotals(),
    }
  }

  const graph = projectGraphForDemo(demo)
  const amount = majorPlain(demo.amount_minor)
  const showSettlement = hasReached(demo, 'SETTLED_PROVISIONAL')

  return {
    current_state: demo.current_state,
    state_machine_version: 'payout-lifecycle-v1',
    evidence_completeness: demo.evidence_completeness,
    unresolved_contradictions: [],
    human_ref: demo.human_ref,
    beneficiary: demo.debtor,
    counterparty: demo.beneficiary,
    rail: demo.rail,
    intended_value: { amount, currency: demo.currency },
    settlement_value: showSettlement
      ? {
          amount: demo.index === 18 ? (demo.amount_minor * 0.97 / 100).toFixed(2) : amount,
          currency: demo.currency,
        }
      : undefined,
    match_label: demo.match_label,
    batch_totals: batchPortfolioTotals(),
    replay: {
      replay_run_id: `replay_${slug(demo)}`,
      state_machine_version: 'payout-lifecycle-v1',
      current_state: demo.current_state,
      accepted_transitions: graph.transitions.length,
      evidence_root: hashPayload(`replay|${demo.trace_id}`),
      matches_stored: true,
    },
    nodes: buildLifecycleNodes(demo),
    edges: [
      ['capture', 'propose'],
      ['propose', 'authority'],
      ['authority', 'policy'],
      ['policy', 'pac'],
      ['pac', 'dispatch'],
      ['dispatch', 'observe'],
      ['observe', 'derive'],
      ['derive', 'prove'],
    ],
    transitions: graph.transitions,
    signals: graph.signals,
    finality: graph.finality,
    activity: buildActivity(demo),
  }
}

export function dispatchViewForDemo(demo) {
  const graph = projectGraphForDemo(demo)
  return {
    receipt: graph.dispatchReceipt,
    allowed_rails: graph.pac?.execution_constraints?.allowed_rails ?? [],
    recommended_connector: {
      id: demo.connector_id,
      name: demo.connector_name,
      health: 'up',
      cutoff: demo.cutoff,
      cost: demo.cost,
    },
    preflight: [
      { check: 'PAC digest matches stored', result: 'PASS' },
      { check: 'Idempotency key unique', result: 'PASS' },
      { check: `${demo.human_ref} amount ${formatMajor(demo.amount_minor, demo.currency)}`, result: 'PASS' },
      { check: `Rail ${demo.rail} permitted`, result: demo.index === 19 ? 'FAIL' : 'PASS' },
      { check: `Connector ${demo.connector_name}`, result: 'PASS' },
    ],
    attempts: graph.dispatchReceipt?.gateway_executed ? [graph.dispatchReceipt] : [],
    pac: graph.pac,
    batch_totals: batchPortfolioTotals(),
    demo: {
      trace_id: demo.trace_id,
      pac_id: demo.pac_id,
      human_ref: demo.human_ref,
      beneficiary: demo.beneficiary,
      amount_display: formatMajor(demo.amount_minor, demo.currency),
      current_state: demo.current_state,
      rail: demo.rail,
      match_label: demo.match_label,
      primary: Boolean(demo.primary),
    },
  }
}

export function seedDispatchReceiptForDemo(demo) {
  if (!demo || !demo.initially_dispatched) return null
  return buildDispatchReceipt(demo)
}
