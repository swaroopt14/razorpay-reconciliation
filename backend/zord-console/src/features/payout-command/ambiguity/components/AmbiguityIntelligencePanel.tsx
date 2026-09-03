'use client'

import Link from 'next/link'
import { ArrowUpRight, Bot, ShieldAlert } from 'lucide-react'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { displayApiField, formatApiCount, formatKpiMoneyMinor } from '../../shared/formatApiKpiFields'

type Props = {
  amb: AmbiguityKpiResolved | null
  batchId?: string
}

export function AmbiguityIntelligencePanel({ amb, batchId }: Props) {
  const hasInsight = Boolean(amb?.intelligence_headline?.trim() || amb?.intelligence_body?.trim())
  const journalHref = batchId
    ? `/payout-command-view/today?dock=grid&batch_id=${encodeURIComponent(batchId)}`
    : '/payout-command-view/today?dock=grid'

  return (
    <aside
      className="relative flex min-h-full flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-[#eef8f5] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:p-6"
      data-testid="ambiguity-intelligence-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d9f99d] text-slate-950">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-500">Zord intelligence</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">Live signal interpretation</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300/80 bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-[#0B1324]" />
          {displayApiField(amb?.risk_tier)}
        </span>
      </div>

      <div className="mt-6 flex-1">
        {hasInsight ? (
          <>
            <h2 className="max-w-[32rem] text-[1.55rem] font-semibold leading-tight text-slate-950">
              {amb?.intelligence_headline}
            </h2>
            {amb?.intelligence_body ? (
              <p className="mt-3 max-w-[34rem] text-[13px] leading-relaxed text-slate-600">{amb.intelligence_body}</p>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/55 p-4">
            <p className="text-[13px] font-semibold text-slate-700">No intelligence narrative returned.</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">The panel will populate when the API sends an insight headline or body.</p>
          </div>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/80 bg-white/70 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Review cases</p>
            <p className="mt-2 text-[1.35rem] font-semibold tabular-nums text-slate-950">
              {formatApiCount(amb?.ambiguous_intent_count)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/70 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">At risk</p>
            <p className="mt-2 text-[1.35rem] font-semibold tabular-nums text-slate-950">
              {formatKpiMoneyMinor(amb?.value_at_risk_minor)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/70 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Critical alerts</p>
            <p className="mt-2 text-[1.35rem] font-semibold tabular-nums text-slate-950">
              {formatApiCount(amb?.critical_alert_count)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300/60 pt-4">
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
          <ShieldAlert className="h-4 w-4 text-slate-700" aria-hidden="true" />
          Scope follows the selected batch.
        </div>
        <Link
          href={journalHref}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-slate-800"
        >
          Open review queue
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  )
}
