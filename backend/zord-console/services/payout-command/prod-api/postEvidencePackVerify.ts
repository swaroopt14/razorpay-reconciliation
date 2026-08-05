import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackVerifyResponse } from './evidenceTypes'

const EVIDENCE_BASE = '/api/prod/evidence'

export type EvidencePackVerifyResult = {
  data: EvidencePackVerifyResponse | null
  ok: boolean
  status: number
  error?: string
}

/** Cryptographic Merkle verify — BFF injects session tenant. */
export async function postEvidencePackVerify(packId: string): Promise<EvidencePackVerifyResult> {
  const pid = apiTrimmedString(packId)
  if (!pid) {
    return { data: null, ok: false, status: 0, error: 'Missing pack id' }
  }

  const path = `${EVIDENCE_BASE}/packs/${encodeURIComponent(pid)}/verify`
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    })
    const text = await response.text()
    let data: EvidencePackVerifyResponse | null = null
    try {
      data = JSON.parse(text) as EvidencePackVerifyResponse
    } catch {
      return {
        data: null,
        ok: false,
        status: response.status,
        error: text.slice(0, 280) || 'Invalid verify response',
      }
    }
    return {
      data,
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : data?.explanation || text.slice(0, 280),
    }
  } catch (e) {
    return {
      data: null,
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : 'Verify request failed',
    }
  }
}
