'use client'

import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy, confidenceZoneLabel } from '../copy/ambiguityCopy'

export function AverageMatchConfidenceCard({ amb }: { amb: AmbiguityKpiResolved | null }) {
  const conf = amb?.avg_attachment_confidence ?? 0
  const pct = Math.max(0, Math.min(100, conf * 100))
  
  const strokeDasharray = 283 // 2 * pi * 45
  const strokeDashoffset = strokeDasharray - (strokeDasharray * pct) / 100

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Match Confidence</h2>
        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Strategic</span>
      </div>
      
      <div className="relative mx-auto mt-8 flex h-48 w-48 items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="10"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#10b981"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="text-center">
          <p className="text-[2rem] font-bold tabular-nums text-slate-900">{amb ? `${pct.toFixed(1)}%` : '—'}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Confidence</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-black" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">High Confidence</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-slate-200" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Needs Review</span>
        </div>
      </div>
    </article>
  )
}
