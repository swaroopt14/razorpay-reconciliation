import { apiTrimmedString } from './coerceApiField'
import { fetchProdJsonGetWithMeta } from './fetchProdJsonGet'
import type { EvidencePackTimelineResponse } from './evidenceTypes'

const EVIDENCE_BASE = '/api/v1/evidence'

type TimelineV1Row = {
  timestamp: string
  event: string
}

export async function getEvidencePackTimeline(
  packId: string,
): Promise<{ data: EvidencePackTimelineResponse | null; error?: string }> {
  const pid = apiTrimmedString(packId)
  if (!pid) return { data: null, error: 'Missing pack id' }

  const path = `${EVIDENCE_BASE}/${encodeURIComponent(pid)}/timeline`
  const res = await fetchProdJsonGetWithMeta<EvidencePackTimelineResponse | TimelineV1Row[]>(path)
  if (!res.ok) {
    return {
      data: null,
      error: res.errorText?.trim().slice(0, 280) || `Timeline failed (${res.status || 'network'})`,
    }
  }

  const raw = res.data
  if (Array.isArray(raw)) {
    return {
      data: {
        evidence_pack_id: pid,
        intent_id: '',
        timeline: raw.map((row) => ({
          timestamp: row.timestamp,
          event: row.event,
          node_id: row.event,
        })),
      },
    }
  }
  return { data: raw }
}
