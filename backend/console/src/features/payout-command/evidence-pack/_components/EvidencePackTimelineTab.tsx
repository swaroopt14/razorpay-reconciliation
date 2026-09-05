'use client'

import { useEffect, useState } from 'react'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { mapProofTimeline } from '../../evidence/mappers/mapProofTimeline'
import { getEvidencePackTimeline } from '@/services/payout-command/prod-api/getEvidencePackTimeline'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import type { TimelineEventVm } from '../../evidence/types/evidenceViewModels'

type EvidencePackTimelineTabProps = {
  pack: EvidencePackFull | null
  packId: string
  loading: boolean
}

function simplifyTimelineEventLabel(event: string): string {
  const text = event.trim().toLowerCase()
  if (!text) return 'Evidence step recorded'
  if (text.includes('bank settlement file')) return 'Bank settlement file received'
  if (text.includes('payment instruction')) return 'Payment instruction received'
  if (text.includes('payload envelope') || text.includes('securely hashed')) return 'Payload hash recorded'
  if (text.includes('structured settlement')) return 'Settlement record structured'
  if (text.includes('payment intent hash') || text.includes('canonical payment intent')) return 'Payment intent hash anchored'
  if (text.includes('governance') || text.includes('compliance')) return 'Compliance check completed'
  if (text.includes('utr') || text.includes('reconciliation') || text.includes('auto-matched')) return 'Bank reference matched'
  if (text.includes('variance')) return 'Variance analysis completed'
  if (text.includes('compiled and sealed') || text.includes('evidence pack')) return 'Evidence pack generated'
  if (text.includes('proof root') || text.includes('merkle')) return 'Proof root committed'
  return event
}

function mapApiTimeline(
  entries: { timestamp: string; event: string; node_id: string }[],
): TimelineEventVm[] {
  return entries.map((e) => ({
    time: new Date(e.timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    label: simplifyTimelineEventLabel(e.event),
    detail: e.node_id.length > 20 ? `${e.node_id.slice(0, 12)}…${e.node_id.slice(-8)}` : e.node_id,
  }))
}

export function EvidencePackTimelineTab({ pack, packId, loading }: EvidencePackTimelineTabProps) {
  const [apiEvents, setApiEvents] = useState<TimelineEventVm[] | null>(null)
  const [apiLoading, setApiLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setApiLoading(true)
    void getEvidencePackTimeline(packId).then(({ data, error }) => {
      if (cancelled) return
      if (data?.timeline?.length) {
        setApiEvents(mapApiTimeline(data.timeline))
      } else {
        setApiEvents(null)
      }
      setApiLoading(false)
      if (error) console.warn('[evidence] timeline', error)
    })
    return () => {
      cancelled = true
    }
  }, [packId])

  if (loading || apiLoading) return <p className="text-[15px] text-[#6f716d]">Loading timeline…</p>
  if (!pack) return <p className="text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPack}</p>

  const events = apiEvents ?? mapProofTimeline(pack)
  if (events.length < 2) {
    return (
      <p className="text-[15px] text-[#6f716d]">
        Timeline will populate when payment instruction, settlement, and match events are linked on this pack.
      </p>
    )
  }

  return (
    <ol className="relative space-y-0 border-l border-[#E5E5E5] pl-6">
      {events.map((ev, i) => (
        <li key={`${ev.time}-${i}`} className="relative pb-6 last:pb-0">
          <span className="absolute -left-[25px] top-1 flex h-3 w-3 rounded-full border-2 border-white bg-[#000000] ring-1 ring-[#000000]/30" />
          <p className="text-[13px] font-semibold tabular-nums text-[#94a3b8]">{ev.time}</p>
          <p className="mt-0.5 text-[16px] font-semibold text-[#111111]">{ev.label}</p>
          {ev.detail ? <p className="mt-0.5 font-mono text-[12px] text-[#6f716d]">{ev.detail}</p> : null}
        </li>
      ))}
    </ol>
  )
}
