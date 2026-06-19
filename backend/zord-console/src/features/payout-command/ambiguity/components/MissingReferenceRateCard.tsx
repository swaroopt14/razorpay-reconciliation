'use client'

import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'

export function MissingReferenceRateCard({ amb }: { amb: AmbiguityKpiResolved | null }) {
  const rate = amb ? (amb.provider_ref_missing_rate * 100).toFixed(2) : '—'

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Missing Reference Rate</h2>
        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Data Quality</span>
      </div>
      <div className="mt-6">
        <p className="text-[2rem] font-bold tabular-nums text-slate-900">{rate === '—' ? '—' : `${rate}%`}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{ambiguityCopy.kpi.missingRefRateHelper}</p>
      </div>
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-black" />
          <p className="text-[12px] font-semibold text-slate-900">{ambiguityCopy.missingRef.benchmarkTitle}</p>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{ambiguityCopy.missingRef.benchmarkBody}</p>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-slate-500">{ambiguityCopy.missingRef.opsNote}</p>
    </article>
  )
}
