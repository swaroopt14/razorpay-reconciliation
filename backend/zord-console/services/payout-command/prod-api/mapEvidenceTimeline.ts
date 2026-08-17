import { apiTrimmedString } from './coerceApiField'

export type TimelineProvenance = 'AUTHORITATIVE' | 'DERIVED'

export type OperationalTimelineRow = {
  timestamp: string
  event: string
  provenance: TimelineProvenance
  source_field?: string
}

const FABRICATED_EVENT_MARKERS = ['ERP', 'SFTP', 'UTR'] as const

export function containsFabricatedEvidenceEvent(text: string): boolean {
  const upper = text.toUpperCase()
  return FABRICATED_EVENT_MARKERS.some((marker) => upper.includes(marker))
}

function mapAuthoritativeEvent(raw: { timestamp?: string; event?: string; node_id?: string }): OperationalTimelineRow | null {
  const timestamp = apiTrimmedString(raw.timestamp)
  const event = apiTrimmedString(raw.event) || apiTrimmedString(raw.node_id)
  if (!timestamp || !event) return null
  return {
    timestamp,
    event,
    provenance: 'AUTHORITATIVE',
  }
}

const DERIVED_STAGE_FIELDS: Array<{ field: string; event: string }> = [
  { field: 'payment_instruction_received', event: 'Payment instruction recorded' },
  { field: 'canonical_intent_created', event: 'Canonical intent created' },
  { field: 'settlement_record_received', event: 'Settlement record recorded' },
  { field: 'canonical_settlement_created', event: 'Canonical settlement created' },
  { field: 'created_at', event: 'Evidence pack created' },
]

export function deriveTimelineFromPackFields(pack: Record<string, unknown> | null | undefined): OperationalTimelineRow[] {
  if (!pack) return []
  const rows: OperationalTimelineRow[] = []
  for (const stage of DERIVED_STAGE_FIELDS) {
    const timestamp = apiTrimmedString(pack[stage.field])
    if (!timestamp) continue
    rows.push({
      timestamp,
      event: stage.event,
      provenance: 'DERIVED',
      source_field: stage.field,
    })
  }
  return rows
}

export function mapAuthoritativeTimelineRows(
  timeline: Array<{ timestamp?: string; event?: string; node_id?: string }>,
): OperationalTimelineRow[] {
  return timeline
    .map(mapAuthoritativeEvent)
    .filter((row): row is OperationalTimelineRow => Boolean(row))
    .sort((a, b) => {
      const ta = Date.parse(a.timestamp)
      const tb = Date.parse(b.timestamp)
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb
      return a.timestamp.localeCompare(b.timestamp)
    })
}

export function buildEvidenceTimelineResponse(input: {
  evidencePackId: string
  intentId?: string
  upstreamTimeline: Array<{ timestamp?: string; event?: string; node_id?: string }> | null
  pack?: Record<string, unknown> | null
}): {
  data_available: boolean
  evidence_pack_id: string
  intent_id: string
  timeline: OperationalTimelineRow[]
} {
  const authoritative = input.upstreamTimeline ? mapAuthoritativeTimelineRows(input.upstreamTimeline) : []
  const derived = authoritative.length === 0 ? deriveTimelineFromPackFields(input.pack) : []
  const timeline = authoritative.length > 0 ? authoritative : derived
  return {
    data_available: authoritative.length > 0,
    evidence_pack_id: input.evidencePackId,
    intent_id: input.intentId ?? '',
    timeline,
  }
}
