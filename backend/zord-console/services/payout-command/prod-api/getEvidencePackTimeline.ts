import { apiTrimmedString } from './coerceApiField'
import { fetchProdJsonGetWithMeta } from './fetchProdJsonGet'
import type { EvidencePackTimelineResponse, EvidenceTimelineEntry } from './evidenceTypes'

const EVIDENCE_BASE = '/api/v1/evidence'

type TimelineV1Row = {
  timestamp: string
  event: string
  provenance?: 'AUTHORITATIVE' | 'DERIVED'
  source_field?: string
}

type TimelineEnvelope = EvidencePackTimelineResponse & {
  data_available?: boolean
}

export async function getEvidencePackTimeline(
  packId: string,
): Promise<{ data: EvidencePackTimelineResponse | null; error?: string }> {
  const pid = apiTrimmedString(packId)
  if (!pid) return { data: null, error: 'Missing pack id' }

  const path = `${EVIDENCE_BASE}/${encodeURIComponent(pid)}/timeline`
  const res = await fetchProdJsonGetWithMeta<TimelineEnvelope | TimelineV1Row[]>(path)
  if (!res.ok) {
    return {
      data: null,
      error: res.errorText?.trim().slice(0, 280) || `Timeline failed (${res.status || 'network'})`,
    }
  }

  const raw = res.data
  if (Array.isArray(raw)) {
    const timeline: EvidenceTimelineEntry[] = raw.map((row) => ({
      timestamp: row.timestamp,
      event: row.event,
      node_id: row.event,
      provenance: row.provenance,
      source_field: row.source_field,
    }))
    return {
      data: {
        evidence_pack_id: pid,
        intent_id: '',
        data_available: timeline.length > 0 && timeline.every((row) => row.provenance !== 'DERIVED'),
        timeline,
      },
    }
  }
  return { data: raw }
}
