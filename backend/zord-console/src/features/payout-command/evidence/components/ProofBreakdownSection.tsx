'use client'

import { evidenceCopy } from '../copy/evidenceCopy'
import type { ProofBreakdownRow } from '../types/evidenceViewModels'
import { EVIDENCE_CARD, EVIDENCE_NEON } from '../evidencePageTokens'
import { EvidenceSectionHeader } from './EvidenceSectionHeader'

type ProofBreakdownSectionProps = {
  rows: ProofBreakdownRow[]
}

export function ProofBreakdownSection({ rows }: ProofBreakdownSectionProps) {
  const maxTotal = Math.max(...rows.map((r) => r.total), 1)

  return (
    <section className={EVIDENCE_CARD}>
      <EvidenceSectionHeader
        title={evidenceCopy.breakdown.title}
        subtitle={evidenceCopy.breakdown.subtitle}
        live
      />
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {rows.map((row, i) => {
          const pct = row.total > 0 ? (row.completed / row.total) * 100 : 0
          const barPct = row.total > 0 ? (row.completed / maxTotal) * 100 : 0
          const isReplayDisabled =
            row.id === 'replay' && row.note === evidenceCopy.breakdown.replayNotEnabled

          return (
            <div
              key={row.id}
              className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 transition hover:border-slate-200 hover:bg-white hover:shadow-sm"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white font-mono text-[11px] font-bold text-[#103a9e] shadow-sm ring-1 ring-slate-200/80">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-slate-900">{row.label}</p>
                  {isReplayDisabled ? (
                    <p className="mt-1.5 text-[12px] font-medium text-amber-800">{row.note}</p>
                  ) : (
                    <p className="mt-1.5 text-[12px] tabular-nums text-slate-600">
                      <span className="font-semibold text-slate-900">
                        {row.completed.toLocaleString('en-IN')}
                      </span>
                      <span className="text-slate-400"> / </span>
                      <span className="font-semibold text-slate-900">
                        {row.total.toLocaleString('en-IN')}
                      </span>
                      {row.note ? <span className="text-slate-400"> · {row.note}</span> : null}
                    </p>
                  )}
                </div>
              </div>
              {!isReplayDisabled ? (
                <div className="mt-3">
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.min(100, barPct)}%`,
                        background: EVIDENCE_NEON,
                        boxShadow: '0 0 12px rgba(0,0,0,0.45)',
                      }}
                    />
                  </div>
                  <p className="mt-1 text-right text-[10px] font-semibold tabular-nums text-[#00239C]">
                    {pct.toFixed(0)}%
                  </p>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
