'use client'

import { useEffect, useState } from 'react'
import {
  ecosystemLogoFallbackSrc,
  ecosystemLogoSrc,
  type EcosystemDowntimeDetail,
  type EcosystemInstrument,
} from '@/services/payout-command/demo/paymentEcosystemData'

type EcosystemDowntimeModalProps = {
  item: EcosystemInstrument
  detail: EcosystemDowntimeDetail
  onClose: () => void
}

function ModalLogo({ item }: { item: EcosystemInstrument }) {
  const candidates = [
    ecosystemLogoSrc(item.logo),
    ecosystemLogoFallbackSrc(item.logo),
  ].filter(Boolean) as string[]
  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(candidates.length === 0)
  const src = candidates[idx]

  if (failed || !src) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0B1324] text-[13px] font-bold text-white">
        {item.mark}
      </span>
    )
  }

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#E5E7EB] bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-8 w-8 object-contain"
        onError={() => {
          if (idx + 1 < candidates.length) setIdx((i) => i + 1)
          else setFailed(true)
        }}
      />
    </span>
  )
}

/**
  * Drill-down when a red / down instrument is clicked - matches reference downtime modal.
  */
export function EcosystemDowntimeModal({ item, detail, onClose }: EcosystemDowntimeModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0B1324]/45 p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close detail" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="downtime-modal-title"
        className="relative z-[1] w-full max-w-[440px] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            <ModalLogo item={item} />
            <div className="min-w-0">
              <h2 id="downtime-modal-title" className="text-[20px] font-semibold tracking-tight text-[#111827]">
                {item.name}
              </h2>
              <p className="mt-0.5 text-[13px] text-[#6B7280]">
                {detail.category} | {detail.role}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center text-[20px] text-[#9CA3AF] hover:text-[#111827]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 px-5">
          <div className="rounded-lg bg-[#F3F4F6] px-3.5 py-3">
            <p className="text-[11px] leading-snug text-[#6B7280]">
              Downtimes Today (from {detail.metricsFrom})
            </p>
            <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-[#111827]">
              {detail.downtimesToday}
            </p>
          </div>
          <div className="rounded-lg bg-[#F3F4F6] px-3.5 py-3">
            <p className="text-[11px] leading-snug text-[#6B7280]">
              Downtime Duration (from {detail.metricsFrom})
            </p>
            <p className="mt-2 text-[22px] font-semibold leading-none tracking-tight text-[#111827]">
              {detail.downtimeDuration}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5 px-5">
          <div className="flex items-start gap-2.5 rounded-md bg-[#E6F4FF] px-3 py-2.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1677FF] text-[10px] font-bold text-white">
              i
            </span>
            <p className="text-[12px] leading-relaxed text-[#1F2937]">{detail.infoBanner}</p>
          </div>

          {detail.ongoing ? (
            <div className="flex items-start gap-2.5 rounded-md border-l-[3px] border-[#EF4444] bg-[#FFF1F0] px-3 py-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EF4444] text-[11px] font-bold text-white">
                !
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[#111827]">{detail.ongoing.title}</p>
                <p className="mt-0.5 text-[12px] text-[#4B5563]">Started at: {detail.ongoing.startedAt}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 px-5 pb-5">
          <div className="mb-3 flex items-start gap-2">
            <span className="mt-1 h-4 w-1 shrink-0 rounded-sm bg-[#2563EB]" aria-hidden />
            <div>
              <p className="text-[14px] font-semibold text-[#111827]">Past Downtimes</p>
              <p className="text-[12px] text-[#9CA3AF]">Past 30 Days Incidents</p>
            </div>
          </div>

          {detail.pastIncidents.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#E5E7EB] px-3 py-4 text-center text-[12px] text-[#9CA3AF]">
              No prior incidents in the last 30 days.
            </p>
          ) : (
            <ul className="space-y-2">
              {detail.pastIncidents.map((inc) => (
                <li
                  key={inc.id}
                  className="flex items-center gap-2.5 rounded-md border border-[#F3F4F6] bg-[#FAFAFA] px-3 py-2.5"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EF4444] text-[10px] font-bold text-white">
                    !
                  </span>
                  <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#111827]">{inc.rangeLabel}</p>
                  <span className="shrink-0 rounded-full bg-[#0B1324] px-2.5 py-1 text-[11px] font-semibold text-white">
                    {inc.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
