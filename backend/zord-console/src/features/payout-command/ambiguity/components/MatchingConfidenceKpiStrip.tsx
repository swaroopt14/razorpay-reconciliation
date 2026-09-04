'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'
import {
  displayApiField,
  formatApiCount,
  formatKpiMoneyMinor,
  toDisplayPercent,
} from '../../shared/formatApiKpiFields'

type Props = { amb: AmbiguityKpiResolved | null; loading?: boolean; scopeHint?: string }

function statValue(value: string | number | null | undefined, loading?: boolean) {
  return displayApiField(value, loading)
}

function pctValue(value: number | null | undefined, loading?: boolean) {
  if (loading) return '…'
  const pct = toDisplayPercent(value)
  return pct == null ? '-' : String(Math.round(pct * 10) / 10)
}

export function MatchingConfidenceKpiStrip({ amb, loading, scopeHint }: Props) {
  const pathname = usePathname()
  const basePath = pathname?.startsWith('/sandbox') ? '/sandbox' : '/payout-command-view/today'

  return (
    <section
      className="grid gap-3 rounded-[24px] border border-slate-200/80 bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:p-4"
      data-testid="ambiguity-kpi-hero"
    >
      <div className="relative overflow-hidden rounded-[20px] bg-[#111827] p-5 text-white shadow-[0_12px_26px_rgba(15,23,42,0.18)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(132,204,22,0.2),transparent_62%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-white/50">Match review</p>
            <p className="mt-3 text-[3.7rem] font-semibold leading-none tabular-nums sm:text-[4.5rem]">
              {pctValue(amb?.ambiguity_rate, loading)}
              <span className="ml-1 text-[1.4rem] font-medium tracking-normal text-white/55">%</span>
            </p>
            <p className="mt-2 max-w-[28rem] text-[12px] leading-relaxed text-white/60">
              {scopeHint ?? 'Tenant-wide ambiguity snapshot from the intelligence API.'}
            </p>
          </div>
          <span className="rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1.5 text-[10px] font-bold uppercase text-lime-200">
            {statValue(amb?.risk_tier, loading)}
          </span>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2">
          <Link
            href={`${basePath}?dock=grid`}
            className="inline-flex items-center rounded-xl bg-white px-3.5 py-2 text-[12px] font-semibold text-slate-950 transition hover:bg-lime-200"
          >
            Open intent journal
          </Link>
          <Link
            href={`${basePath}?dock=leakage`}
            className="inline-flex items-center rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-white/10"
          >
            View payment gaps
          </Link>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[18px] border border-slate-200 bg-[#f8fafc] p-4">
          <p className="text-[10px] font-bold uppercase text-slate-400">Intents to review</p>
          <p className="mt-3 text-[1.8rem] font-semibold leading-none tabular-nums text-slate-950">
            {formatApiCount(amb?.ambiguous_intent_count, loading)}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Unclear attachment decisions.</p>
        </article>
        <article className="rounded-[18px] border border-slate-200 bg-[#f8fafc] p-4">
          <p className="text-[10px] font-bold uppercase text-slate-400">Value at risk</p>
          <p className="mt-3 text-[1.8rem] font-semibold leading-none tabular-nums text-slate-950">
            {loading ? '…' : formatKpiMoneyMinor(amb?.value_at_risk_minor)}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Ambiguous match exposure.</p>
        </article>
        <article className="rounded-[18px] border border-slate-200 bg-[#f8fafc] p-4">
          <p className="text-[10px] font-bold uppercase text-slate-400">Provider refs missing</p>
          <p className="mt-3 text-[1.8rem] font-semibold leading-none tabular-nums text-slate-950">
            {pctValue(amb?.provider_ref_missing_rate, loading)}
            {loading || amb?.provider_ref_missing_rate == null ? '' : '%'}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Reference coverage gap.</p>
        </article>
        <article className="rounded-[18px] border border-slate-200 bg-[#f8fafc] p-4">
          <p className="text-[10px] font-bold uppercase text-slate-400">Attachment confidence</p>
          <p className="mt-3 text-[1.8rem] font-semibold leading-none tabular-nums text-slate-950">
            {pctValue(amb?.avg_attachment_confidence, loading)}
            {loading || amb?.avg_attachment_confidence == null ? '' : '%'}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Average API confidence score.</p>
        </article>
      </div>

      <p className="px-1 text-[11px] font-medium text-slate-400">{ambiguityCopy.kpi.reviewRateHelper}</p>
    </section>
  )
}
