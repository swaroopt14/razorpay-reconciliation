'use client'

import { useEffect, useState } from 'react'
import {
  ECOSYSTEM_BANNER,
  ECOSYSTEM_COLUMNS,
  ecosystemLogoFallbackSrc,
  ecosystemLogoSrc,
  getEcosystemDowntimeDetail,
  type EcosystemColumn,
  type EcosystemDowntimeDetail,
  type EcosystemInstrument,
} from '@/services/payout-command/demo/paymentEcosystemData'
import { EcosystemDowntimeModal } from './EcosystemDowntimeModal'

type DowntimeSelection = {
  item: EcosystemInstrument
  detail: EcosystemDowntimeDetail
}

type PaymentEcosystemPanelProps = {
  open: boolean
  onClose: () => void
}

function StatusDot({ up }: { up: boolean }) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-sm ${
        up ? 'bg-[#0B1324] shadow-[0_0_0_3px_rgba(16,185,129,0.18)]' : 'bg-[#0B1324] shadow-[0_0_0_3px_rgba(244,63,94,0.18)]'
      }`}
      aria-label={up ? 'Functional' : 'Downtime'}
    />
  )
}

function BrandLogo({ item }: { item: EcosystemInstrument }) {
  const candidates = [
    ecosystemLogoSrc(item.logo),
    ecosystemLogoFallbackSrc(item.logo),
  ].filter(Boolean) as string[]
  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(!item.logo || candidates.length === 0)

  useEffect(() => {
    setIdx(0)
    setFailed(!item.logo)
  }, [item.logo])

  const src = candidates[idx]

  if (failed || !src) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-teal-200/80 bg-gradient-to-br from-teal-50 to-sky-50 text-[11px] font-bold text-teal-800">
        {item.mark}
      </span>
    )
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-white/80 bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 object-contain"
        onError={() => {
          if (idx + 1 < candidates.length) setIdx((i) => i + 1)
          else setFailed(true)
        }}
      />
    </span>
  )
}

function InstrumentRow({
  item,
  accent,
  columnTitle,
  groupTitle,
  onOpenDowntime,
}: {
  item: EcosystemInstrument
  accent: string
  columnTitle: string
  groupTitle: string
  onOpenDowntime: (sel: DowntimeSelection) => void
}) {
  const down = item.status === 'down'
  return (
    <li>
      <button
        type="button"
        disabled={!down}
        onClick={() => {
          if (!down) return
          onOpenDowntime({
            item,
            detail: getEcosystemDowntimeDetail(item, columnTitle, groupTitle),
          })
        }}
        className={`flex w-full items-center gap-2.5 border px-2.5 py-2 text-left transition ${
          down
            ? 'cursor-pointer border-[#0B1324]/20 bg-gradient-to-r from-[#F1F5F9] to-[#F8FAFC] hover:border-[#0B1324]/25 hover:from-[#E2E8F0]'
            : 'cursor-default border-teal-100/80 bg-white/90'
        }`}
        style={down ? undefined : { boxShadow: `inset 3px 0 0 ${accent}33` }}
        aria-label={down ? `View downtime for ${item.name}` : item.name}
      >
        <BrandLogo item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-800">{item.name}</p>
          {item.note ? <p className="truncate text-[11px] text-slate-500">{item.note}</p> : null}
        </div>
        <StatusDot up={!down} />
      </button>
    </li>
  )
}

function ColumnCard({
  column,
  onOpenDowntime,
}: {
  column: EcosystemColumn
  onOpenDowntime: (sel: DowntimeSelection) => void
}) {
  const ok = column.summary.severity === 'ok'
  return (
    <section className="flex min-w-[240px] flex-1 flex-col overflow-hidden border border-teal-100/90 bg-white/85 shadow-[0_8px_28px_rgba(15,118,110,0.06)] backdrop-blur-sm">
      <header
        className="flex items-center gap-2 px-3 py-2.5 text-white"
        style={{
          background: `linear-gradient(120deg, ${column.accent} 0%, ${column.accent}cc 55%, #0f766e 100%)`,
        }}
      >
        <span className="h-4 w-1 bg-white/80" aria-hidden />
        <h3 className="text-[15px] font-semibold tracking-tight">{column.title}</h3>
      </header>

      <div
        className={`mx-3 mt-3 border px-3 py-3 ${
          ok
            ? 'border-[#0B1324]/20 bg-gradient-to-br from-[#F1F5F9] to-[#F8FAFC]'
            : 'border-[#0B1324]/20 bg-gradient-to-br from-[#F1F5F9] to-[#F8FAFC]'
        }`}
      >
        <div className="flex items-start gap-2">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[12px] font-bold text-white ${
              ok ? 'bg-[#0B1324]' : 'bg-[#0B1324]'
            }`}
          >
            {ok ? '✓' : '!'}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-800">{column.summary.title}</p>
            <p className="mt-0.5 text-[12px] text-slate-600">{column.summary.detail}</p>
            {column.summary.extras ? (
              <p className="mt-1 text-[12px] font-medium" style={{ color: column.accent }}>
                {column.summary.extras}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-3 py-3">
        {column.groups.map((group) => (
          <div key={group.id}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-teal-800/70">
              {group.title}
            </p>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <InstrumentRow
                  key={item.id}
                  item={item}
                  accent={column.accent}
                  columnTitle={column.title}
                  groupTitle={group.title}
                  onOpenDowntime={onOpenDowntime}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
  * Payment ecosystem health - opens from top-bar pulse control.
  * Logos for UPI / banks / Razorpay / SAP / international rails.
  */
export function PaymentEcosystemPanel({ open, onClose }: PaymentEcosystemPanelProps) {
  const [downtime, setDowntime] = useState<DowntimeSelection | null>(null)

  useEffect(() => {
    if (!open) {
      setDowntime(null)
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      style={{
        background:
          'radial-gradient(1200px 600px at 10% -10%, rgba(45,212,191,0.22), transparent 55%), radial-gradient(900px 500px at 90% 0%, rgba(56,189,248,0.18), transparent 50%), linear-gradient(180deg, #ecfeff 0%, #f0f9ff 42%, #f8fafc 100%)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ecosystem-panel-title"
    >
      <div className="border-b border-[#0B1324]/20/80 bg-gradient-to-r from-sky-100 via-teal-50 to-cyan-100 px-4 py-2.5 text-center text-[12px] font-medium text-[#0B1324]">
        {ECOSYSTEM_BANNER}
      </div>

      <div className="flex items-center justify-between border-b border-teal-100/80 bg-white/70 px-4 py-3 backdrop-blur-md sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-teal-700/80">
            Live rail health
          </p>
          <h2 id="ecosystem-panel-title" className="text-[18px] font-semibold text-slate-900">
            Ecosystem
          </h2>
          <p className="text-[12px] text-slate-600">
            UPI · Cards · Banks · SAP · Razorpay &amp; PSPs · International
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center border border-teal-200 bg-white text-[18px] text-slate-700 transition hover:bg-teal-50"
          aria-label="Close ecosystem"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-5">
        <div className="flex min-w-max gap-3 pb-4 xl:min-w-0">
          {ECOSYSTEM_COLUMNS.map((column: EcosystemColumn) => (
            <ColumnCard key={column.id} column={column} onOpenDowntime={setDowntime} />
          ))}
        </div>
      </div>

      <button
        type="button"
        className="fixed bottom-5 right-5 z-[81] inline-flex h-11 items-center gap-2 border border-teal-700/20 bg-gradient-to-r from-teal-700 to-sky-700 px-4 text-[13px] font-semibold text-white shadow-lg shadow-teal-900/20 transition hover:from-teal-600 hover:to-sky-600"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M4 14.5v-1.2a4.5 4.5 0 0 1 4.5-4.5h.8A2.7 2.7 0 1 1 12 6.2a2.7 2.7 0 0 1-2.7 2.6h-.8A2.8 2.8 0 0 0 5.7 11.6v2.9H4Zm12 0v-1.1a3.3 3.3 0 0 0-2.4-3.2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Help &amp; Support
      </button>

      {downtime ? (
        <EcosystemDowntimeModal
          item={downtime.item}
          detail={downtime.detail}
          onClose={() => setDowntime(null)}
        />
      ) : null}
    </div>
  )
}
