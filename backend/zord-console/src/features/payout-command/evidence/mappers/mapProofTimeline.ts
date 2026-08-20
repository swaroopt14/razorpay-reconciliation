import type { TimelineEventVm } from '../types/evidenceViewModels'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { deriveTimelineFromPackFields } from '@/services/payout-command/prod-api/mapEvidenceTimeline'

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

/** Only stages backed by a stored timestamp. Never invent ERP/SFTP/UTR events. */
export function mapProofTimeline(pack: EvidencePackFull | null): TimelineEventVm[] {
  if (!pack) return []
  return deriveTimelineFromPackFields(pack as unknown as Record<string, unknown>).map((row) => ({
    time: formatTime(row.timestamp),
    label: row.event,
    detail: row.source_field ? `DERIVED from ${row.source_field}` : 'DERIVED',
    provenance: row.provenance,
    sourceField: row.source_field,
  }))
}

export function mapAuthoritativeTimelineEvents(
  entries: Array<{
    timestamp: string
    event: string
    node_id?: string
    provenance?: 'AUTHORITATIVE' | 'DERIVED'
    source_field?: string
  }>,
): TimelineEventVm[] {
  return entries
    .filter((entry) => apiTrimmedString(entry.timestamp) && apiTrimmedString(entry.event))
    .map((entry) => ({
      time: formatTime(entry.timestamp),
      label: entry.event,
      detail:
        entry.provenance === 'DERIVED'
          ? `DERIVED from ${entry.source_field || 'stored timestamp'}`
          : entry.node_id,
      provenance: entry.provenance ?? 'AUTHORITATIVE',
      sourceField: entry.source_field,
    }))
}
