import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import type {
  EvidencePackFull,
  EvidencePackSummaryRow,
  EvidencePackTimelineResponse,
} from '@/services/payout-command/prod-api/evidenceTypes'
import type { BackendAuthEnvelope } from '@/services/auth/server'

export type OperationalTimelineRow = {
  timestamp: string
  event: string
}

export type EvidenceNodePayload = {
  node_id: string
  label: string
  kind: 'source' | 'transform' | 'decision' | 'outcome' | 'summary' | 'root'
  technical: {
    item_type?: string
    stable_ref?: string
    hash?: string
    leaf_hash?: string
    schema_version?: string
  }
}

export type EvidenceEdgePayload = {
  from: string
  to: string
}

export type EvidenceTenantGate =
  | {
      ok: true
      tenantId: string
      refreshedPayload?: BackendAuthEnvelope
    }
  | { ok: false; response: NextResponse }

export async function gateEvidenceTenant(request: NextRequest): Promise<EvidenceTenantGate> {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate
  return {
    ok: true,
    tenantId: gate.tenantId,
    refreshedPayload: gate.refreshedPayload,
  }
}

type UpstreamResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; detail: string }

async function evidenceGet<T>(
  tenantId: string,
  path: string,
  query?: URLSearchParams,
): Promise<UpstreamResult<T>> {
  const qs = query?.toString()
  const url = `${BACKEND_SERVICES.EVIDENCE.BASE_URL}${path}${qs ? `?${qs}` : ''}`
  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      cache: 'no-store',
    })
    const text = await upstream.text()
    if (!upstream.ok) {
      return {
        ok: false,
        status: upstream.status,
        detail: text?.slice(0, 400) || `${upstream.status}`,
      }
    }
    try {
      return { ok: true, data: JSON.parse(text) as T }
    } catch {
      return { ok: false, status: 502, detail: 'Invalid JSON from evidence service' }
    }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      detail: error instanceof Error ? error.message : 'evidence service unreachable',
    }
  }
}

export async function getEvidencePackById(
  tenantId: string,
  evidencePackId: string,
): Promise<UpstreamResult<EvidencePackFull>> {
  const query = new URLSearchParams({ tenant_id: tenantId })
  return evidenceGet<EvidencePackFull>(
    tenantId,
    BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACK_BY_ID(evidencePackId),
    query,
  )
}

export async function listEvidencePacksByQuery(
  tenantId: string,
  query: URLSearchParams,
): Promise<UpstreamResult<{ packs: EvidencePackSummaryRow[]; total?: number }>> {
  query.set('tenant_id', tenantId)
  return evidenceGet<{ packs: EvidencePackSummaryRow[]; total?: number }>(
    tenantId,
    BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACKS,
    query,
  )
}

export async function getEvidenceTimelineById(
  tenantId: string,
  evidencePackId: string,
): Promise<UpstreamResult<EvidencePackTimelineResponse>> {
  const query = new URLSearchParams({ tenant_id: tenantId })
  return evidenceGet<EvidencePackTimelineResponse>(
    tenantId,
    BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACK_TIMELINE(evidencePackId),
    query,
  )
}

export function applyEvidenceGateCookies(
  response: NextResponse,
  refreshedPayload?: BackendAuthEnvelope,
) {
  applyRefreshedSessionCookies(response, refreshedPayload)
}

function eventFromRaw(value: string): string {
  const text = value.trim().toLowerCase()
  if (!text) return 'Evidence step recorded'
  if (text.includes('payment instruction')) return 'Payment instruction received from ERP'
  if (text.includes('payload') || text.includes('envelope') || text.includes('hash')) {
    return 'File payload fingerprint securely recorded'
  }
  if (text.includes('structured') && text.includes('intent')) {
    return 'Structured payment intent schema verified'
  }
  if (text.includes('settlement') && (text.includes('sftp') || text.includes('file'))) {
    return 'Bank settlement file received via SFTP'
  }
  if (text.includes('utr') || text.includes('reconciliation') || text.includes('match')) {
    return 'UTR reference auto-matched via reconciliation engine'
  }
  if (text.includes('compiled') || text.includes('sealed') || text.includes('evidence pack')) {
    return 'Immutable evidence pack successfully compiled'
  }
  if (text.includes('proof root') || text.includes('merkle')) return 'Proof root committed to immutable log'
  return value
}

export function mapTimelineRows(
  timeline: Array<{ timestamp?: string; event?: string; node_id?: string }>,
): OperationalTimelineRow[] {
  return timeline
    .map((entry) => ({
      timestamp: entry.timestamp || '',
      event: eventFromRaw(entry.event || entry.node_id || ''),
    }))
    .filter((entry) => Boolean(entry.timestamp))
    .sort((a, b) => {
      const ta = Date.parse(a.timestamp)
      const tb = Date.parse(b.timestamp)
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb
      return a.timestamp.localeCompare(b.timestamp)
    })
}

export function mapLineageGraphFromPack(pack: EvidencePackFull): {
  evidence_pack_id: string
  nodes: EvidenceNodePayload[]
  edges: EvidenceEdgePayload[]
} {
  const byType = new Map<string, EvidencePackFull['items'][number]>()
  for (const item of pack.items ?? []) {
    const key = (item.type || '').toUpperCase()
    if (!byType.has(key)) byType.set(key, item)
  }

  const node = (
    nodeId: string,
    label: string,
    kind: EvidenceNodePayload['kind'],
    itemType?: string,
  ): EvidenceNodePayload => {
    const item = itemType ? byType.get(itemType) : undefined
    return {
      node_id: nodeId,
      label,
      kind,
      technical: {
        item_type: itemType,
        stable_ref: item?.ref,
        hash: item?.hash,
        leaf_hash: item?.leaf_hash,
        schema_version: item?.schema_version,
      },
    }
  }

  return {
    evidence_pack_id: pack.evidence_pack_id,
    nodes: [
      node('original_payment_file', 'Original Payment File', 'source', 'RAW_INGRESS_ENVELOPE'),
      node('structured_payment_intent', 'Structured Payment Intent', 'transform', 'CANONICAL_INTENT'),
      node('governance_check', 'Governance Check', 'decision', 'GOVERNANCE_DECISION_AT_CANONICAL'),
      node('original_settlement_file', 'Original Settlement File', 'source', 'RAW_SETTLEMENT_ENVELOPE'),
      node('structured_settlement_record', 'Structured Settlement Record', 'transform', 'CANONICAL_SETTLEMENT_OBSERVATION'),
      node('match_decision', 'Match Decision', 'decision', 'ATTACHMENT_DECISION'),
      node('final_payment_outcome', 'Final Payment Outcome', 'outcome', 'FINAL_CONTRACT'),
      node('evidence_summary', 'Evidence Summary', 'summary', 'FINAL_EVIDENCE_VIEW'),
      {
        node_id: 'proof_root',
        label: 'Proof Root',
        kind: 'root',
        technical: {
          stable_ref: pack.evidence_pack_id,
          hash: pack.merkle_root,
          schema_version: pack.ruleset_version,
        },
      },
    ],
    edges: [
      { from: 'original_payment_file', to: 'structured_payment_intent' },
      { from: 'structured_payment_intent', to: 'governance_check' },
      { from: 'original_settlement_file', to: 'structured_settlement_record' },
      { from: 'structured_settlement_record', to: 'match_decision' },
      { from: 'governance_check', to: 'final_payment_outcome' },
      { from: 'match_decision', to: 'final_payment_outcome' },
      { from: 'final_payment_outcome', to: 'evidence_summary' },
      { from: 'evidence_summary', to: 'proof_root' },
    ],
  }
}
