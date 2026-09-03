/**
 * SANDBOX DEMO — Batch 001 primary payout in INR.
 * Zordnet Operations pays ₹5,500.00 to Apex Components Pvt Ltd against PAY-0001.
 */
import { jwks, merkleRootFromDigests, sealObject, sha256Hex, verifySealedObject } from './crypto.js'
import { COMPATIBILITY, MEDIA_ACTION, MEDIA_EVIDENCE, PROTOCOL_SCHEMAS } from './schemas.js'

export const CROSS_BORDER_TENANT = 'tenant_novacell_eu'
export const TRACE_ID = 'trc_novacell_inv10482'
export const PAC_ID = 'pac_novacell_eu_10482'
export const PROPOSAL_ID = 'ap_novacell_inv10482'
export const AGENT_ID = 'agt_treasury_eu_04'
export const EXCEPTION_ID = 'exc_novacell_late_ack'
export const AMOUNT_MINOR = 550_000 // ₹5,500.00 (paise)
export const CURRENCY = 'INR'

const T0 = '2026-08-13T12:04:00.000Z'
const T_EXECUTE_BY = '2026-08-13T15:00:00.000Z'

function hashPayload(label) {
  return `sha256:${sha256Hex(label)}`
}

function buildUnsignedGraph() {
  const rawEnvelope = {
    spec_version: 'zord.evidence.v1',
    media_type: MEDIA_EVIDENCE,
    envelope_id: 'env_erp_inv10482',
    trace_id: TRACE_ID,
    tenant_id: CROSS_BORDER_TENANT,
    source: { system: 'Zordnet ERP', channel: 'api', mapping_version: 'erp-inr-v3' },
    received_at: T0,
    payload_hash: hashPayload('PAY-0001|BATCH-001|INR5500.00|Apex Components Pvt Ltd'),
    instruction:
      'Pay INR 5,500.00 to Apex Components Pvt Ltd against PAY-0001 in Batch 001.',
    invoice_refs: ['PAY-0001'],
    po_refs: ['BATCH-001'],
    environment: 'SANDBOX',
  }

  const agentProfile = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    agent_id: AGENT_ID,
    tenant_id: CROSS_BORDER_TENANT,
    owner_principal: 'role_treasury_controller_eu',
    model_provider: 'sandbox-demo',
    model_version: 'treasury-action-agent-2026.08',
    purpose: 'Treasury Action Agent — supplier payout proposals only.',
    permitted_action_types: ['SUPPLIER_PAYOUT'],
    permitted_tools: ['retrieve_invoice', 'retrieve_po', 'retrieve_vendor', 'propose_action'],
    permitted_sources: ['erp', 'invoice', 'purchase_order', 'vendor_master'],
    /** Rails are not hardcoded — resolved from attached Policy Studio structure at read time. */
    allowed_rails: [],
    max_amount_per_action: { amount_minor: 500_000_00, currency: CURRENCY },
    daily_budget: { amount_minor: 2_000_000_00, currency: CURRENCY },
    beneficiary_constraints: { approved_vendors_only: true, no_bank_detail_change_days: 30 },
    jurisdictions: ['IN', 'SG', 'AE', 'EU'],
    approval_profile: 'dual_above_inr_50000',
    policy_namespace: 'zordnet.treasury.v14',
    environment: 'SANDBOX',
    key_thumbprint: 'sha256:agt04-thumbprint-novacell',
    issued_at: '2026-07-01T00:00:00.000Z',
    expires_at: '2026-12-31T23:59:59.000Z',
    revocation_status: 'active',
    profile_version: '4',
  }

  const actionProposal = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    proposal_id: PROPOSAL_ID,
    trace_id: TRACE_ID,
    tenant_id: CROSS_BORDER_TENANT,
    status: 'NOT_AUTHORIZED',
    agent_id: AGENT_ID,
    capability_profile_id: AGENT_ID,
    confidence: {
      overall: 0.91,
      amount: 0.99,
      beneficiary: 0.94,
      invoice: 0.97,
      execute_by: 0.88,
    },
    missing_fields: [],
    ambiguities: [
      {
        field: 'rail',
        question: 'Approved rail will be taken from the attached Policy Studio draft.',
      },
    ],
    rationale_summary:
      'PAY-0001 matches Batch 001 and approved vendor Apex Components Pvt Ltd. Amount is source-grounded.',
    retrieved_evidence_ids: ['env_erp_inv10482', 'doc_pay0001', 'doc_batch001', 'vend_apex'],
    source_hashes: [rawEnvelope.payload_hash],
    mapping_version: 'erp-iso20022-v3',
    action: {
      type: 'SUPPLIER_PAYOUT',
      debtor_ref: 'Zordnet Operations',
      beneficiary_ref: 'Apex Components Pvt Ltd',
      amount_minor: AMOUNT_MINOR,
      currency: CURRENCY,
      execute_by: T_EXECUTE_BY,
    },
    business_context: {
      purpose_code: 'SUPP',
      invoice_refs: ['PAY-0001'],
      po_refs: ['BATCH-001'],
      cost_center: 'CC-IN-TREASURY',
      contract_ref: 'MSA-APEX-2025',
    },
    created_at: '2026-08-13T12:04:11.000Z',
    environment: 'SANDBOX',
  }

  const authorityCredentials = [
    {
      spec_version: 'zord.action.v1',
      credential_id: 'cred_org_novacell',
      kind: 'enterprise_root',
      principal: { org_id: 'org_novacell_eu', legal_entity_ref: 'Zordnet Operations', trust_domain: 'zordnet.com' },
      subject: { type: 'organization', id: 'org_novacell_eu' },
      key_thumbprint: 'sha256:org-novacell-root',
      scope: 'treasury.payout.execute',
      issued_at: '2026-01-15T00:00:00.000Z',
      expires_at: '2027-01-15T00:00:00.000Z',
      revocation_status: 'active',
    },
    {
      spec_version: 'zord.action.v1',
      credential_id: 'cred_role_controller',
      kind: 'delegating_principal',
      principal: { org_id: 'org_novacell_eu', role: 'Treasury Controller' },
      subject: { type: 'human', id: 'usr_controller_eu', name: 'A. Keller' },
      key_thumbprint: 'sha256:controller-passkey',
      scope: 'approve.payout.sepa',
      issued_at: '2026-08-13T12:06:00.000Z',
      expires_at: '2026-08-13T18:00:00.000Z',
      revocation_status: 'active',
    },
    {
      spec_version: 'zord.action.v1',
      credential_id: 'cred_role_cfo',
      kind: 'delegating_principal',
      principal: { org_id: 'org_novacell_eu', role: 'CFO' },
      subject: { type: 'human', id: 'usr_cfo_eu', name: 'M. Duarte' },
      key_thumbprint: 'sha256:cfo-passkey',
      scope: 'approve.payout.sepa.step_up',
      issued_at: '2026-08-13T12:07:20.000Z',
      expires_at: '2026-08-13T18:00:00.000Z',
      revocation_status: 'active',
    },
    {
      spec_version: 'zord.action.v1',
      credential_id: 'cred_agent_treasury',
      kind: 'agent_workload',
      principal: { org_id: 'org_novacell_eu', agent_id: AGENT_ID },
      subject: { type: 'agent', id: AGENT_ID },
      key_thumbprint: 'sha256:agt04-thumbprint-novacell',
      scope: 'propose.supplier_payout',
      issued_at: '2026-07-01T00:00:00.000Z',
      expires_at: '2026-12-31T23:59:59.000Z',
      revocation_status: 'active',
    },
  ]

  const policyDecision = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    receipt_id: 'pdr_novacell_v14_10482',
    trace_id: TRACE_ID,
    decision: 'ALLOW',
    obligations: ['DUAL_APPROVAL', 'NO_FX', 'APPROVED_VENDOR_ONLY', 'INR_RAILS_ONLY'],
    policy_id: 'pol_zordnet_treasury',
    policy_version: 'v14',
    policy_hash: hashPayload('pol_novacell_treasury.v14.compiled'),
    rule_ids: ['R-VENDOR-APPROVED', 'R-AMOUNT-DUAL-50K', 'R-NO-FX', 'R-INR-RAILS', 'R-NO-BENEFICIARY-CHANGE-30D'],
    input_hash: hashPayload(`${PROPOSAL_ID}|${AMOUNT_MINOR}`),
    compiled_artifact: 'policy.zordnet.treasury.v14.json',
    ai_role: 'drafted',
    environment: 'SANDBOX',
    decided_at: '2026-08-13T12:05:40.000Z',
  }

  const pacUnsigned = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    pac_id: PAC_ID,
    tenant_id: CROSS_BORDER_TENANT,
    trace_id: TRACE_ID,
    environment: 'SANDBOX',
    principal: {
      org_id: 'org_novacell_eu',
      legal_entity_ref: 'Zordnet Operations',
      trust_domain: 'zordnet.com',
    },
    actor: {
      type: 'agent',
      actor_id: AGENT_ID,
      agent_id: AGENT_ID,
      capability_profile_hash: hashPayload(AGENT_ID),
      key_thumbprint: 'sha256:agt04-thumbprint-novacell',
    },
    source: {
      raw_envelope_ids: ['env_erp_inv10482'],
      source_hashes: [rawEnvelope.payload_hash],
      canonical_intent_id: 'int_novacell_inv10482',
      mapping_version: 'erp-iso20022-v3',
    },
    business_context: actionProposal.business_context,
    action: actionProposal.action,
    authority: {
      credential_refs: authorityCredentials.map((c) => c.credential_id),
      policy_id: policyDecision.policy_id,
      policy_version: policyDecision.policy_version,
      policy_hash: policyDecision.policy_hash,
      decision_receipt_hash: hashPayload(policyDecision.receipt_id),
      approval_refs: ['appr_controller_10482', 'appr_cfo_10482'],
      separation_of_duties: true,
    },
    execution_constraints: {
      allowed_rails: [],
      allowed_connectors: ['conn_razorpay_sandbox'],
      max_fee_minor: 250,
      idempotency_key: 'idem_pac_novacell_eu_10482',
      retry_policy: 'safe-idempotent',
      max_attempts: 2,
      expiry: T_EXECUTE_BY,
    },
    evidence_policy: {
      required_sources: ['provider_acknowledgement', 'bank_status_or_statement_debit'],
      finality_profile: 'POLICY_RAIL_V1',
      disclosure_profile: 'operator_full',
    },
    created_at: '2026-08-13T12:08:02.000Z',
    expires_at: T_EXECUTE_BY,
  }

  const dispatchReceipt = {
    spec_version: 'zord.action.v1',
    media_type: MEDIA_ACTION,
    receipt_id: 'dpr_atlas_10482_1',
    pac_id: PAC_ID,
    trace_id: TRACE_ID,
    connector_id: 'conn_razorpay_sandbox',
    connector_version: 'razorpay-sandbox-1.4',
    recommended_by_agent: true,
    gateway_executed: true,
    idempotency_key: pacUnsigned.execution_constraints.idempotency_key,
    attempt: 1,
    request_digest: hashPayload('dispatch-request-pac_novacell_eu_10482'),
    response_digest: hashPayload('dispatch-ack-RZP-99211'),
    provider_reference: 'RZP-99211',
    provider_acknowledgement: 'ACCEPTED',
    http_signature: { present: true, verified: true, profile: 'RFC9421', result: 'SANDBOX_DEMO' },
    outcome: 'ACKNOWLEDGED',
    dispatched_at: '2026-08-13T12:08:18.000Z',
    pac_revalidation: 'PASS',
    environment: 'SANDBOX',
  }

  const signals = [
    {
      envelope_id: 'sig_wh_processing',
      channel: 'webhook',
      raw_event_type: 'PROCESSING',
      occurred_at: '2026-08-13T12:08:40.000Z',
      emitted_at: '2026-08-13T12:08:41.000Z',
      received_at: '2026-08-13T12:08:42.000Z',
      duplicate: false,
      accepted: true,
      mapping_candidate: 'IN_PROCESS',
      correlation_confidence: 0.99,
      source_signature: { present: true, verified: true, key_id: 'rzp-wh-sandbox' },
    },
    {
      envelope_id: 'sig_wh_accepted_1',
      channel: 'webhook',
      raw_event_type: 'ACCEPTED',
      occurred_at: '2026-08-13T12:08:20.000Z',
      emitted_at: '2026-08-13T12:08:21.000Z',
      received_at: '2026-08-13T12:08:50.000Z',
      duplicate: false,
      accepted: true,
      mapping_candidate: 'ACKNOWLEDGED',
      correlation_confidence: 0.99,
      source_signature: { present: true, verified: true, key_id: 'atlas-wh-sandbox' },
    },
    {
      envelope_id: 'sig_wh_accepted_dup',
      channel: 'webhook',
      raw_event_type: 'ACCEPTED',
      occurred_at: '2026-08-13T12:08:20.000Z',
      emitted_at: '2026-08-13T12:08:21.000Z',
      received_at: '2026-08-13T12:09:05.000Z',
      duplicate: true,
      accepted: false,
      mapping_candidate: 'ACKNOWLEDGED',
      correlation_confidence: 0.99,
      dedupe_fingerprint: 'rzp|ACCEPTED|RZP-99211',
      source_signature: { present: true, verified: true, key_id: 'atlas-wh-sandbox' },
    },
    {
      envelope_id: 'sig_stmt_debit',
      channel: 'statement',
      raw_event_type: 'STATEMENT_DEBIT',
      occurred_at: '2026-08-13T12:11:00.000Z',
      emitted_at: '2026-08-13T12:16:00.000Z',
      received_at: '2026-08-13T12:16:08.000Z',
      duplicate: false,
      accepted: true,
      mapping_candidate: 'SETTLED_CONFIRMED',
      correlation_confidence: 0.97,
      source_signature: { present: true, verified: true, key_id: 'rzp-stmt-sandbox' },
    },
    {
      envelope_id: 'sig_wh_ack_late',
      channel: 'webhook',
      raw_event_type: 'ACKNOWLEDGED',
      occurred_at: '2026-08-13T12:08:22.000Z',
      emitted_at: '2026-08-13T12:08:23.000Z',
      received_at: '2026-08-13T12:18:40.000Z',
      duplicate: false,
      accepted: true,
      mapping_candidate: 'ACKNOWLEDGED',
      correlation_confidence: 0.96,
      late: true,
      does_not_regress: true,
      source_signature: { present: true, verified: true, key_id: 'atlas-wh-sandbox' },
    },
    {
      envelope_id: 'sig_bank_final',
      channel: 'poll',
      raw_event_type: 'BANK_STATUS_ACSC',
      occurred_at: '2026-08-13T12:20:00.000Z',
      emitted_at: '2026-08-13T12:20:02.000Z',
      received_at: '2026-08-13T12:20:03.000Z',
      duplicate: false,
      accepted: true,
      mapping_candidate: 'SETTLED_CONFIRMED',
      correlation_confidence: 0.99,
      source_signature: { present: true, verified: true, key_id: 'rzp-status-sandbox' },
    },
  ].map((row) => ({
    spec_version: 'zord.evidence.v1',
    media_type: MEDIA_EVIDENCE,
    trace_id: TRACE_ID,
    provider: 'Razorpay Sandbox',
    connector_id: 'conn_razorpay_sandbox',
    provider_reference: 'RZP-99211',
    raw_payload_hash: hashPayload(`${row.envelope_id}|${row.raw_event_type}`),
    raw_storage_ref: `sandbox://signals/${row.envelope_id}`,
    mapping_version: 'razorpay-sandbox-v1',
    observed_at: row.received_at,
    source_reliability_class: row.channel === 'statement' ? 'bank_statement' : 'provider_webhook',
    ...row,
    dedupe_fingerprint: row.dedupe_fingerprint || `rzp|${row.raw_event_type}|RZP-99211`,
  }))

  const transitions = [
    { receipt_id: 'ltr_1', previous_state: 'DRAFT', next_state: 'PROPOSED', at: '2026-08-13T12:04:11.000Z', evidence_ids: ['env_erp_inv10482'] },
    { receipt_id: 'ltr_2', previous_state: 'PROPOSED', next_state: 'AWAITING_AUTHORITY', at: '2026-08-13T12:05:00.000Z', evidence_ids: [PROPOSAL_ID] },
    { receipt_id: 'ltr_3', previous_state: 'AWAITING_AUTHORITY', next_state: 'AUTHORIZED', at: '2026-08-13T12:07:40.000Z', evidence_ids: ['cred_role_controller', 'cred_role_cfo'] },
    { receipt_id: 'ltr_4', previous_state: 'AUTHORIZED', next_state: 'DISPATCH_READY', at: '2026-08-13T12:08:02.000Z', evidence_ids: [PAC_ID] },
    { receipt_id: 'ltr_5', previous_state: 'DISPATCH_READY', next_state: 'DISPATCHED', at: '2026-08-13T12:08:18.000Z', evidence_ids: ['dpr_atlas_10482_1'] },
    { receipt_id: 'ltr_6', previous_state: 'DISPATCHED', next_state: 'ACKNOWLEDGED', at: '2026-08-13T12:08:50.000Z', evidence_ids: ['sig_wh_accepted_1'] },
    { receipt_id: 'ltr_7', previous_state: 'ACKNOWLEDGED', next_state: 'IN_PROCESS', at: '2026-08-13T12:08:42.000Z', evidence_ids: ['sig_wh_processing'] },
    { receipt_id: 'ltr_8', previous_state: 'IN_PROCESS', next_state: 'SETTLED_PROVISIONAL', at: '2026-08-13T12:16:08.000Z', evidence_ids: ['sig_stmt_debit'] },
    { receipt_id: 'ltr_9', previous_state: 'SETTLED_PROVISIONAL', next_state: 'SETTLED_CONFIRMED', at: '2026-08-13T12:20:03.000Z', evidence_ids: ['sig_bank_final'] },
  ].map((row) => ({
    spec_version: 'zord.evidence.v1',
    media_type: MEDIA_EVIDENCE,
    trace_id: TRACE_ID,
    state_machine_version: 'payout-lifecycle-v1',
    mapping_version: 'razorpay-neft-v1',
    contradictions: [],
    ...row,
    accepted_evidence_ids: row.evidence_ids,
  }))

  const finality = {
    spec_version: 'zord.evidence.v1',
    media_type: MEDIA_EVIDENCE,
    certificate_id: 'fin_sepa_credit_v1_10482',
    trace_id: TRACE_ID,
    finality_profile: 'POLICY_RAIL_V1',
    profile_version: '1',
    conclusion: 'SETTLED_CONFIRMED',
    terminal_label: 'Final under configured evidence profile',
    supporting_evidence: ['sig_wh_accepted_1', 'sig_stmt_debit', 'sig_bank_final'],
    supporting_evidence_ids: ['sig_wh_accepted_1', 'sig_stmt_debit', 'sig_bank_final'],
    exclusions: ['sig_wh_accepted_dup'],
    unresolved_caveats: [],
    issued_at: '2026-08-13T12:20:10.000Z',
  }

  const exception = {
    exception_id: EXCEPTION_ID,
    trace_id: TRACE_ID,
    pac_id: PAC_ID,
    type: 'LATE_SIGNAL',
    severity: 'info',
    title: 'Late ACKNOWLEDGED webhook arrived after settlement confirmation',
    root_cause:
      'Provider delivered ACKNOWLEDGED after statement debit and bank ACSC. Arrival order is preserved; derived state does not regress.',
    proposed_actions: ['Retain as evidence', 'No new PAC required'],
    authority_impact: 'None — original PAC remains immutable.',
    owner: 'Treasury operations',
    sla: 'Informational',
  }

  return {
    rawEnvelope,
    agentProfile,
    actionProposal,
    authorityCredentials,
    policyDecision,
    pacUnsigned,
    dispatchReceipt,
    signals,
    transitions,
    finality,
    exception,
  }
}

function sealGraph() {
  const g = buildUnsignedGraph()
  const rawEnvelope = sealObject(g.rawEnvelope).object
  const agentProfile = sealObject(g.agentProfile).object
  const actionProposal = sealObject(g.actionProposal).object
  const authorityCredentials = g.authorityCredentials.map((c) => sealObject(c).object)
  const policyDecision = sealObject(g.policyDecision).object
  const pac = sealObject(g.pacUnsigned).object
  const dispatchReceipt = sealObject({
    ...g.dispatchReceipt,
    pac_digest: pac.digest,
  }).object
  const signals = g.signals.map((s) => sealObject(s).object)
  const transitions = g.transitions.map((t) => sealObject(t).object)
  const finality = sealObject(g.finality).object
  const exception = g.exception

  const evidenceObjects = [
    rawEnvelope,
    actionProposal,
    policyDecision,
    pac,
    dispatchReceipt,
    ...signals,
    ...transitions,
    finality,
  ]
  const digests = evidenceObjects.map((o) => o.digest)
  const merkle = merkleRootFromDigests(digests)
  const chain = []
  let prev = 'sha256:' + '0'.repeat(64)
  for (const digest of digests) {
    const link = `sha256:${sha256Hex(prev + digest)}`
    chain.push({ previous: prev, object_digest: digest, link })
    prev = link
  }

  const manifestUnsigned = {
    spec_version: 'zord.evidence.v1',
    media_type: MEDIA_EVIDENCE,
    pack_id: 'pp_novacell_inv10482',
    trace_id: TRACE_ID,
    tenant_id: CROSS_BORDER_TENANT,
    pac_id: PAC_ID,
    disclosure_profile: 'operator_full',
    schemas: Object.keys(PROTOCOL_SCHEMAS),
    object_digests: digests,
    algorithms: { canonicalization: 'RFC8785', digest: 'sha-256', signature: 'JWS-ES256' },
    keys: [{ kid: pac.signature.kid, alg: pac.signature.alg }],
    merkle_root: merkle.merkle_root,
    evidence_service_signature: { kid: pac.signature.kid, alg: pac.signature.alg, detached: true },
    hash_chain_tip: prev,
    hash_chain: chain,
    created_at: '2026-08-13T12:20:12.000Z',
    environment: 'SANDBOX',
    evidence_object_count: evidenceObjects.length,
  }
  const proofPack = sealObject(manifestUnsigned).object

  return {
    scenario: 'cross-border',
    label: 'SANDBOX DEMO',
    tenant: {
      tenant_id: CROSS_BORDER_TENANT,
      name: 'Zordnet Operations',
      workspace: 'Zordnet Operations',
    },
    ids: {
      trace_id: TRACE_ID,
      pac_id: PAC_ID,
      proposal_id: PROPOSAL_ID,
      agent_id: AGENT_ID,
      exception_id: EXCEPTION_ID,
      provider_reference: dispatchReceipt.provider_reference,
      pac_digest: pac.digest,
    },
    rawEnvelope,
    agentProfile,
    actionProposal,
    authorityCredentials,
    policyDecision,
    pac,
    dispatchReceipt,
    signals,
    transitions,
    finality,
    exception,
    proofPack,
    merkle,
    current_state: 'SETTLED_CONFIRMED',
    finality_label: 'Final under configured evidence profile from attached policy rails',
    jwks: jwks(),
  }
}

export const GRAPH = sealGraph()

export function getTraceBundle() {
  return GRAPH
}

export function verifyPac(pacOverride) {
  const object = pacOverride || GRAPH.pac
  return verifySealedObject(object)
}

export function tamperPacAmount(amountMinor) {
  const tampered = {
    ...GRAPH.pac,
    action: { ...GRAPH.pac.action, amount_minor: amountMinor },
  }
  return verifySealedObject(tampered)
}

export function verifyProofPack({ mutateDigest } = {}) {
  const pack = GRAPH.proofPack
  const integrity = verifySealedObject(pack)
  const recomputed = merkleRootFromDigests(
    mutateDigest ? pack.object_digests.map((d, i) => (i === 0 ? `sha256:${sha256Hex('tampered')}` : d)) : pack.object_digests,
  )
  const merkleOk = recomputed.merkle_root === pack.merkle_root && !mutateDigest
  if (integrity.result !== 'VALID') {
    return { result: 'INVALID', integrity, merkle_ok: merkleOk, merkle_root: pack.merkle_root }
  }
  if (!merkleOk) {
    return {
      result: 'INVALID',
      integrity,
      merkle_ok: false,
      stored_root: pack.merkle_root,
      computed_root: recomputed.merkle_root,
    }
  }
  return {
    result: GRAPH.finality.unresolved_caveats?.length ? 'VALID WITH CAVEATS' : 'VALID',
    integrity,
    merkle_ok: true,
    merkle_root: pack.merkle_root,
    pac_digest: GRAPH.pac.digest,
    evidence_object_count: pack.evidence_object_count,
  }
}

export function replayLifecycle() {
  const accepted = GRAPH.transitions
  const root = merkleRootFromDigests(accepted.map((t) => t.digest))
  return {
    replay_run_id: 'replay_novacell_inv10482',
    state_machine_version: 'payout-lifecycle-v1',
    current_state: GRAPH.current_state,
    accepted_transitions: accepted.length,
    evidence_root: root.merkle_root,
    matches_stored: root.merkle_root === merkleRootFromDigests(accepted.map((t) => t.digest)).merkle_root,
  }
}

export function protocolCatalog() {
  return {
    spec_version: 'zord.action.v1',
    media_types: [MEDIA_ACTION, MEDIA_EVIDENCE],
    signature_profile: {
      canonicalization: 'RFC8785',
      digest: 'sha-256',
      signature: 'JWS ES256',
      kid: GRAPH.pac.signature.kid,
    },
    jwks: GRAPH.jwks,
    state_machine: {
      version: 'payout-lifecycle-v1',
      formation: ['DRAFT', 'PROPOSED', 'AWAITING_AUTHORITY', 'AUTHORIZED'],
      execution: ['DISPATCH_READY', 'DISPATCHED', 'ACKNOWLEDGED', 'IN_PROCESS'],
      outcome: ['SETTLED_PROVISIONAL', 'SETTLED_CONFIRMED', 'FINAL'],
      terminal: ['REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED'],
      post_outcome: ['RETURNED', 'REVERSED', 'RECALLED', 'REFUNDED', 'DISPUTED'],
      overlays: ['UNKNOWN', 'EVIDENCE_CONFLICT', 'MANUAL_REVIEW_REQUIRED'],
    },
    objects: PROTOCOL_SCHEMAS,
    compatibility: COMPATIBILITY,
    sample_ids: GRAPH.ids,
  }
}

export function lifecycleNodes() {
  return {
    current_state: GRAPH.current_state,
    state_machine_version: 'payout-lifecycle-v1',
    evidence_completeness: 1,
    unresolved_contradictions: [],
    human_ref: 'PAY-0001',
    beneficiary: 'Zordnet Operations',
    rail: 'NEFT',
    intended_value: { amount: '5500.00', currency: 'INR' },
    settlement_value: { amount: '5500.00', currency: 'INR' },
    replay: replayLifecycle(),
    nodes: [
      {
        id: 'capture',
        label: 'Capture obligation',
        object: 'RawEnvelope',
        state: 'DRAFT',
        detail: 'ERP / file intake accepted',
        stage: 'Create',
      },
      {
        id: 'propose',
        label: 'Propose action',
        object: 'ActionProposal',
        state: 'PROPOSED',
        detail: 'Beneficiary + terms bound',
        stage: 'Create',
      },
      {
        id: 'authority',
        label: 'Authority check',
        object: 'AuthorityCredential',
        state: 'AWAITING_AUTHORITY',
        detail: 'Signer + mandate verified',
        stage: 'Govern',
      },
      {
        id: 'policy',
        label: 'Policy decision',
        object: 'PolicyDecisionReceipt',
        state: 'AUTHORIZED',
        detail: 'Controls allow dispatch',
        stage: 'Govern',
      },
      {
        id: 'pac',
        label: 'Seal contract',
        object: 'PaymentActionContract',
        state: 'DISPATCH_READY',
        detail: 'Signed Payment Action Contract',
        stage: 'Seal',
      },
      {
        id: 'dispatch',
        label: 'Dispatch attempt',
        object: 'DispatchReceipt',
        state: 'DISPATCHED',
        detail: 'Submitted to bank / rail',
        stage: 'Dispatch',
      },
      {
        id: 'observe',
        label: 'Observe signals',
        object: 'SignalEnvelope',
        state: 'IN_PROCESS',
        detail: 'Bank / PSP callbacks correlated',
        stage: 'Observe',
      },
      {
        id: 'derive',
        label: 'Match outcome',
        object: 'LifecycleTransitionReceipt',
        state: 'SETTLED_CONFIRMED',
        detail: 'Expected vs actual settled',
        stage: 'Resolve',
      },
      {
        id: 'prove',
        label: 'Evidence pack',
        object: 'ProofPackManifest',
        state: 'SETTLED_CONFIRMED',
        detail: 'Portable proof ready',
        stage: 'Prove',
      },
    ],
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
    transitions: GRAPH.transitions,
    signals: GRAPH.signals,
    finality: GRAPH.finality,
    activity: [
      { id: 'a1', title: 'Settlement confirmed on approved rail', at: '1m ago', kind: 'verified' },
      { id: 'a2', title: 'Signal correlated to PAC digest', at: '3m ago', kind: 'deterministic' },
      { id: 'a3', title: 'Dispatch receipt accepted', at: '12m ago', kind: 'deterministic' },
      { id: 'a4', title: 'Policy decision: allow', at: '28m ago', kind: 'verified' },
      { id: 'a5', title: 'Payment Action Contract sealed', at: '31m ago', kind: 'verified' },
    ],
  }
}
