'use client'

import { useEffect, useState } from 'react'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { mapAuthoritativeTimelineEvents, mapProofTimeline } from '../../evidence/mappers/mapProofTimeline'
import { getEvidencePackTimeline } from '@/services/payout-command/prod-api/getEvidencePackTimeline'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import type { TimelineEventVm } from '../../evidence/types/evidenceViewModels'

type EvidencePackTimelineTabProps = {
  pack: EvidencePackFull | null
  packId: string
  loading: boolean
}

export function EvidencePackTimelineTab({ pack, packId, loading }: EvidencePackTimelineTabProps) {
  const [apiEvents, setApiEvents] = useState<TimelineEventVm[] | null>(null)
  const [dataAvailable, setDataAvailable] = useState<boolean | null>(null)
  const [apiLoading, setApiLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setApiLoading(true)
    void getEvidencePackTimeline(packId).then(({ data, error }) => {
      if (cancelled) return
      if (data?.timeline?.length) {
        setApiEvents(mapAuthoritativeTimelineEvents(data.timeline))
        setDataAvailable(data.data_available !== false || data.timeline.some((row) => row.provenance === 'AUTHORITATIVE'))
      } else {
        setApiEvents([])
        setDataAvailable(false)
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

  const events = apiEvents && apiEvents.length > 0 ? apiEvents : mapProofTimeline(pack)
  if (events.length === 0) {
    return (
      <p className="text-[15px] text-[#6f716d]">
        {evidenceCopy.graph.timelineEmpty} No factual timeline events are available for this pack.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {dataAvailable === false ? (
        <p className="text-[13px] text-[#64748b]">
          Authoritative timeline is unavailable. Rows labelled DERIVED use a stored pack timestamp only.
        </p>
      ) : null}
      <ol className="relative space-y-0 border-l border-[#E5E5E5] pl-6">
        {events.map((ev, i) => (
          <li key={`${ev.time}-${i}`} className="relative pb-6 last:pb-0">
            <span className="absolute -left-[25px] top-1 flex h-3 w-3 rounded-full border-2 border-white bg-[#000000] ring-1 ring-[#000000]/30" />
            <p className="text-[13px] font-semibold tabular-nums text-[#94a3b8]">{ev.time}</p>
            <p className="mt-0.5 text-[16px] font-semibold text-[#111111]">{ev.label}</p>
            {ev.provenance === 'DERIVED' ? (
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                DERIVED{ev.sourceField ? ` · ${ev.sourceField}` : ''}
              </p>
            ) : null}
            {ev.detail ? <p className="mt-0.5 font-mono text-[12px] text-[#6f716d]">{ev.detail}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
