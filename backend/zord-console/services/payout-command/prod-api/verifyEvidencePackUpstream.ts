import { BACKEND_SERVICES } from '@/config/api.endpoints'
import type { EvidencePackVerifyResponse } from './evidenceTypes'

export type UpstreamResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; detail: string }

export async function postEvidencePackVerifyUpstream(
  tenantId: string,
  accessToken: string,
  packId: string,
): Promise<UpstreamResult<EvidencePackVerifyResponse>> {
  const url = `${BACKEND_SERVICES.EVIDENCE.BASE_URL}${BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACK_VERIFY(packId)}?tenant_id=${encodeURIComponent(tenantId)}`
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
        Authorization: `Bearer ${accessToken}`,
      },
      body: '{}',
      cache: 'no-store',
    })
    const text = await upstream.text()
    try {
      const data = JSON.parse(text) as EvidencePackVerifyResponse
      if (!data?.status && !upstream.ok) {
        return { ok: false, status: upstream.status, detail: text?.slice(0, 400) || `${upstream.status}` }
      }
      return { ok: true, data }
    } catch {
      return { ok: false, status: upstream.status || 502, detail: 'Invalid JSON from evidence verify' }
    }
  } catch {
    return { ok: false, status: 502, detail: 'Evidence verification is temporarily unavailable.' }
  }
}

export async function postService6DisputeExport(input: {
  tenantId: string
  accessToken: string
  paymentReference: string
  disputeReason: string
  exportType: string
  evidencePackId: string
  requestedBy?: string
}): Promise<{ ok: true; status: number; body: ArrayBuffer; contentType: string; filename: string } | { ok: false; status: number; detail: string }> {
  const url = `${BACKEND_SERVICES.EVIDENCE.BASE_URL}${BACKEND_SERVICES.EVIDENCE.ENDPOINTS.DISPUTE_EXPORT}`
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': input.tenantId,
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({
        payment_reference: input.paymentReference,
        tenant_id: input.tenantId,
        dispute_reason: input.disputeReason,
        export_type: input.exportType,
        requested_by: input.requestedBy || 'zord-console',
        evidence_pack_id: input.evidencePackId,
      }),
      cache: 'no-store',
    })
    const buf = await upstream.arrayBuffer()
    if (!upstream.ok) {
      const detail = new TextDecoder().decode(buf).slice(0, 600)
      return { ok: false, status: upstream.status, detail }
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const disposition = upstream.headers.get('content-disposition') || ''
    const match = disposition.match(/filename="?([^";]+)"?/i)
    return {
      ok: true,
      status: upstream.status,
      body: buf,
      contentType,
      filename: match?.[1] || `service6-export-${input.evidencePackId}`,
    }
  } catch {
    return { ok: false, status: 502, detail: 'Service 6 dispute export is temporarily unavailable.' }
  }
}
