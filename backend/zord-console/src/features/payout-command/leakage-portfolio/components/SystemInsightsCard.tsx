'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { deriveWhatZordFound } from '../../leakage/selectors/deriveWhatZordFound'
import { leakageCopy } from '../../leakage/copy/leakageCopy'

type SystemInsightsCardProps = {
  data: PortfolioLeakageViewModel
}

export function SystemInsightsCard({ data }: SystemInsightsCardProps) {
  const pathname = usePathname()
  const insight = deriveWhatZordFound(data)

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-[14px] font-semibold text-slate-700">Industry Insights</h2>

      <p className="mt-6 flex-1 text-[13px] leading-relaxed text-slate-600">{insight.paragraph}</p>

      {insight.criticalNote ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700">
          {insight.criticalNote}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 font-bold text-xs shadow-sm">B</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 font-bold text-xs shadow-sm">MW</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 font-bold text-xs shadow-sm">FT</div>
        </div>
        <Link
          href={`${pathname}?dock=grid`}
          className="inline-flex rounded-full bg-slate-900 px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-slate-800"
        >
          Open Review Items
        </Link>
      </div>
    </article>
  )
}
