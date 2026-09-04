import type { ProtocolObject, ProtocolVerifyResult } from '@/types/protocol'

const PREFIX = '/api/v1/control-plane'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PREFIX}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { error: 'invalid_json', raw: text }
  }
  if (!res.ok) {
    const err = body as { error?: string; message?: string }
    const code = err.error || `control_plane_${res.status}`
    throw new Error(err.message ? `${code}: ${err.message}` : code)
  }
  return body as T
}

export type StructurePaymentInstruction = {
  index?: number
  human_ref: string
  intent_id?: string
  client_payout_ref?: string
  trace_id?: string
  pac_id?: string
  beneficiary: string
  debtor?: string
  amount_minor?: number
  amount_rupees?: number
  currency?: string
  rail?: string
  current_state?: string
  connector_name?: string
}

export type AgentBoundStructure = {
  structure_id: string
  agent_id: string
  business_note: string
  control_labels: string[]
  approved_rails?: string[]
  settlement_currency?: string | null
  policy_pack_id?: string
  policy_label?: string
  status: string
  source: string
  compiled_at?: string
  digest?: string
  policy_draft?: {
    status?: string
    label?: string
    pack_id?: string | null
    note?: string
    control_labels?: string[]
    approved_rails?: string[]
    settlement_currency?: string | null
    ai_role?: string
    authority?: string
  }
  batch?: {
    batch_id?: string
    label?: string
    intent_count?: number
    intended_rupees?: number
    intended_display?: string
    currency?: string
    payment_instructions?: StructurePaymentInstruction[]
  }
  payment_instructions?: StructurePaymentInstruction[]
}

export function fetchActionDesk() {
  return request<{
    agent: ProtocolObject
    source: ProtocolObject
    proposal: ProtocolObject
    attached_structure?: AgentBoundStructure | null
    batch?: {
      batch_id: string
      label: string
      intent_count: number
      intended_rupees: number
      intended_display: string
      currency: string
    }
    payment_instructions?: StructurePaymentInstruction[]
    invoices: {
      id: string
      amount_minor: number
      currency: string
      vendor: string
      trace_id?: string
      intent_id?: string
      rail?: string
      current_state?: string
    }[]
    purchase_orders: { id: string; vendor: string }[]
  }>('/actions/new')
}

export function attachAgentStructure(
  agentId: string,
  body: {
    business_note: string
    control_labels?: string[]
    policy_pack_id?: string
    policy_label?: string
    approved_rails?: string[]
    settlement_currency?: string
    policy_rules?: Array<{
      whenField?: string
      operator?: string
      value?: string
      businessLabel?: string
      pattern?: string
    }>
  },
) {
  return request<{ ok: boolean; structure: AgentBoundStructure; agent_id: string }>(
    `/agents/${encodeURIComponent(agentId)}/structures`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export function listAgentStructures(agentId: string) {
  return request<{
    agent_id: string
    items: AgentBoundStructure[]
    latest: AgentBoundStructure | null
  }>(`/agents/${encodeURIComponent(agentId)}/structures`)
}

export function fetchAgentStructure(agentId: string, structureId: string) {
  return request<{ ok: boolean; structure: AgentBoundStructure }>(
    `/agents/${encodeURIComponent(agentId)}/structures/${encodeURIComponent(structureId)}`,
  )
}

export function updateAgentStructure(
  agentId: string,
  structureId: string,
  body: {
    business_note: string
    control_labels?: string[]
    policy_pack_id?: string
    policy_label?: string
    approved_rails?: string[]
    settlement_currency?: string
    policy_rules?: Array<{
      whenField?: string
      operator?: string
      value?: string
      businessLabel?: string
      pattern?: string
    }>
  },
) {
  return request<{ ok: boolean; structure: AgentBoundStructure; agent_id: string }>(
    `/agents/${encodeURIComponent(agentId)}/structures/${encodeURIComponent(structureId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
}

export function dispatchPac(pacId: string) {
  return request<{
    ok: boolean
    receipt: ProtocolObject
    dispatch_gate: { dispatched: boolean; structure_id?: string | null; has_structure?: boolean }
  }>(`/payment-action-contracts/${encodeURIComponent(pacId)}/dispatch`, {
    method: 'POST',
    body: '{}',
  })
}

export function fetchAuthority(traceId: string) {
  return request<{
    trace_id: string
    nodes: { id: string; label: string; kind: string; credential?: ProtocolObject; object?: ProtocolObject }[]
    edges: [string, string][]
    demo?: {
      trace_id: string
      pac_id: string
      human_ref: string
      beneficiary: string
      debtor: string
      amount_minor: number
      amount_display: string
      currency: string
      rail: string
      current_state: string
      primary?: boolean
    }
    batch_totals?: {
      intent_count: number
      intended_rupees: number
      intended_display: string
      currency: string
    }
    payment_instructions?: StructurePaymentInstruction[]
    payout?: {
      human_ref: string
      beneficiary: string
      amount_minor: number
      currency: string
      rail: string
    }
  }>(`/actions/${encodeURIComponent(traceId)}/authority`)
}

export function fetchContract(traceId: string) {
  return request<
    ProtocolObject & {
      demo?: {
        trace_id: string
        pac_id: string
        human_ref: string
        beneficiary: string
        debtor: string
        amount_minor: number
        amount_display: string
        currency: string
        rail: string
      }
      batch_totals?: {
        intent_count: number
        intended_display: string
        intended_rupees?: number
      }
    }
  >(`/actions/${encodeURIComponent(traceId)}/contract`)
}

export function fetchDispatch(traceId: string) {
  return request<{
    receipt: ProtocolObject
    allowed_rails: string[]
    allowed_rails_source?: string
    recommended_connector: { id: string; name: string; health: string; cutoff: string; cost: string }
    preflight: { check: string; result: string }[]
    attempts: ProtocolObject[]
    pac?: ProtocolObject
    dispatch_gate?: {
      dispatched: boolean
      has_structure?: boolean
      structure_id?: string | null
      ready?: boolean
      message?: string
      trace_id?: string
    }
    demo?: {
      trace_id: string
      pac_id: string
      human_ref: string
      beneficiary: string
      amount_display: string
      current_state?: string
      rail?: string
      match_label?: string
      primary?: boolean
    }
  }>(`/actions/${encodeURIComponent(traceId)}/dispatch`)
}

export type ControlPlaneActionSummary = {
  trace_id: string
  pac_id: string
  proposal_id: string
  agent_id: string
  human_ref: string
  beneficiary: string
  debtor: string
  amount_minor: number
  currency: string
  amount_display: string
  current_state: string
  rail: string
  connector_name: string
  primary?: boolean
  href_dispatch: string
  href_lifecycle: string
}

export type ProtocolCompatibilityRow = {
  protocol: string
  status: string
  binding_type?: string
  transport?: string
  mapping_keys?: string[]
  exposed_tools?: string[]
  note?: string
}

export function fetchActions() {
  return request<{
    items: ControlPlaneActionSummary[]
    default_trace_id: string
    count: number
  }>('/actions')
}

export function fetchSignals(traceId: string) {
  return request<{
    items: ProtocolObject[]
    demo?: {
      trace_id: string
      human_ref: string
      beneficiary: string
      amount_display: string
      rail: string
      provider_reference?: string | null
      connector_name?: string
      current_state?: string
    }
    batch_totals?: {
      intent_count: number
      intended_display: string
    }
    dispatch_gate?: { message?: string; dispatched?: boolean }
  }>(`/actions/${encodeURIComponent(traceId)}/signals`)
}

export function fetchLifecycle(traceId: string) {
  return request<{
    current_state: string
    state_machine_version: string
    evidence_completeness: number
    unresolved_contradictions: unknown[]
    human_ref?: string
    beneficiary?: string
    counterparty?: string
    rail?: string
    match_label?: string
    intended_value?: { amount: string; currency: string }
    settlement_value?: { amount: string; currency: string }
    activity?: { id: string; title: string; at: string; kind: string }[]
    batch_totals?: {
      intent_count: number
      intended_display: string
      intended_rupees?: number
    }
    replay: Record<string, unknown>
    nodes: {
      id: string
      label: string
      object: string
      state: string
      detail?: string
      stage?: string
    }[]
    edges: [string, string][]
    transitions: ProtocolObject[]
    signals: ProtocolObject[]
    finality: ProtocolObject
  }>(`/actions/${encodeURIComponent(traceId)}/lifecycle`)
}

export function fetchProofPack(traceId: string) {
  return request<{
    pack: ProtocolObject
    pac: ProtocolObject
    authority: ProtocolObject[]
    execution: ProtocolObject
    observation: ProtocolObject[]
    lifecycle: ProtocolObject[]
    finality: ProtocolObject
    verification: { result: ProtocolVerifyResult; merkle_root?: string; pac_digest?: string }
  }>(`/actions/${encodeURIComponent(traceId)}/proof-pack`)
}

export function verifyPac(pacId: string, body?: Record<string, unknown>) {
  return request<{ result: ProtocolVerifyResult; error?: string; stored_digest?: string; computed_digest?: string }>(
    `/payment-action-contracts/${encodeURIComponent(pacId)}/verify`,
    { method: 'POST', body: JSON.stringify(body ?? {}) },
  )
}

export function verifyProofPack(body?: Record<string, unknown>) {
  return request<{ result: ProtocolVerifyResult; merkle_ok?: boolean; merkle_root?: string }>(
    '/proof-packs/verify',
    { method: 'POST', body: JSON.stringify(body ?? {}) },
  )
}

export function replayLifecycle(traceId: string) {
  return request<Record<string, unknown>>(`/actions/${encodeURIComponent(traceId)}/replay`, {
    method: 'POST',
    body: '{}',
  })
}

export function fetchAgents() {
  return request<{ items: ProtocolObject[] }>('/agents')
}

export function fetchException(exceptionId: string) {
  return request<ProtocolObject>(`/exceptions/${encodeURIComponent(exceptionId)}`)
}

export function fetchProtocolCatalog() {
  return request<{
    spec_version?: string
    media_types?: string[]
    signature_profile?: {
      canonicalization?: string
      digest?: string
      signature?: string
      kid?: string
    }
    jwks?: { keys?: Array<Record<string, string>> }
    state_machine?: {
      version?: string
      formation?: string[]
      execution?: string[]
      outcome?: string[]
      terminal?: string[]
      post_outcome?: string[]
      overlays?: string[]
    }
    objects?: Record<string, { $id?: string; type?: string; required?: string[] }>
    compatibility?: ProtocolCompatibilityRow[]
    batch_actions?: ControlPlaneActionSummary[]
    batch_totals?: {
      intent_count: number
      intended_display: string
      intended_rupees?: number
    }
    sample_ids?: Record<string, string>
    [key: string]: unknown
  }>('/protocol/schemas')
}
