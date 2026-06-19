import type { TimelineEventVm } from '../types/evidenceViewModels'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { PROOF_NODE_BUSINESS_LABELS } from '../copy/evidenceCopy'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

const TIMELINE_ORDER: { types: string[]; verb: string }[] = [
  { types: ['RAW_INGRESS_ENVELOPE', 'ENVELOPE_HASH'], verb: 'Payment instruction received' },
  { types: ['RAW_INGRESS_ENVELOPE'], verb: 'File hash recorded' },
  { types: ['CANONICAL_INTENT', 'CANONICAL_INTENT_HASH'], verb: 'Payment intent created' },
  { types: ['GOVERNANCE_DECISION_AT_CANONICAL', 'GOVERNANCE_DECISION'], verb: 'Governance check completed' },
  { types: ['RAW_SETTLEMENT_ENVELOPE', 'RAW_SETTLEMENT_FILE'], verb: 'Settlement record received' },
  { types: ['CANONICAL_SETTLEMENT_OBSERVATION'], verb: 'Structured settlement record created' },
  { types: ['ATTACHMENT_DECISION'], verb: 'Bank reference matched' },
  { types: ['FINAL_CONTRACT', 'FINAL_EVIDENCE_VIEW'], verb: 'Final payment outcome recorded' },
  { types: ['FINAL_EVIDENCE_VIEW'], verb: 'Evidence pack generated' },
]

function formatTime(iso: string, offsetMin: number): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    d.setMinutes(d.getMinutes() + offsetMin)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export function mapProofTimeline(pack: EvidencePackFull | null): TimelineEventVm[] {
  if (!pack) return []

  const created = pack.created_at
  const lifecycleEvents: TimelineEventVm[] = []
  const pushLifecycle = (iso: string | undefined, label: string, detail?: string) => {
    if (!apiTrimmedString(iso)) return
    lifecycleEvents.push({
      time: formatTime(iso as string, 0),
      label,
      detail,
    })
  }

  pushLifecycle(pack.payment_instruction_received, 'Payment instruction received')
  pushLifecycle(pack.canonical_intent_created, 'Payment intent created')
  pushLifecycle(pack.settlement_record_received, 'Settlement record received')
  pushLifecycle(pack.canonical_settlement_created, 'Structured settlement record created')
  if (apiTrimmedString(pack.attachment_decision)) {
    pushLifecycle(pack.canonical_settlement_created ?? pack.created_at, 'Bank reference matched', pack.attachment_decision)
  }

  const items = pack.items ?? []
  const events: TimelineEventVm[] = []
  let offset = 0

  for (const step of TIMELINE_ORDER) {
    const match = items.find((it) => step.types.includes((it.type || '').toUpperCase()))
    if (match) {
      const business =
        PROOF_NODE_BUSINESS_LABELS[(match.type || '').toUpperCase()] ||
        (match.type || '').replace(/_/g, ' ')
      events.push({
        time: formatTime(created, offset),
        label: step.verb,
        detail: business,
      })
      offset += 1
    }
  }

  if (events.length === 0 && pack.merkle_root) {
    events.push({
      time: formatTime(created, 0),
      label: 'Evidence pack generated',
      detail: apiTrimmedString(pack.evidence_pack_id),
    })
  }

  events.push({
    time: formatTime(created, offset + 1),
    label: 'Proof root committed',
    detail: pack.merkle_root ? `${pack.merkle_root.slice(0, 20)}…` : undefined,
  })

  if (lifecycleEvents.length > 0) {
    const merged = [...lifecycleEvents, ...events]
    return merged.filter((ev, idx) => merged.findIndex((x) => x.label === ev.label && x.time === ev.time) === idx)
  }

  return events
}
