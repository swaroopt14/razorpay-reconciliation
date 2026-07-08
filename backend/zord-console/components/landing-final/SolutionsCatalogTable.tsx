'use client'

import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'

import { SolutionGlyph } from '@/components/landing-final/SolutionGlyph'
import {
  solutionEntries,
  solutionMenuViews,
  type SolutionViewId,
} from '@/components/landing-final/solutions-data'

type CatalogFilter = 'all' | SolutionViewId

const viewLabels: Record<SolutionViewId, string> = {
  'use-case': 'Use case',
  workflow: 'Workflow',
}

function demoHref(solutionTitle: string) {
  return `mailto:Support@zordnet.com?subject=${encodeURIComponent(`Book demo — ${solutionTitle}`)}`
}

export function SolutionsCatalogTable({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const [filter, setFilter] = useState<CatalogFilter>('all')
  const isLight = theme === 'light'

  const filteredSolutions = useMemo(() => {
    if (filter === 'all') return solutionEntries
    return solutionEntries.filter((entry) => entry.views.includes(filter))
  }, [filter])

  const shellClass = isLight
    ? 'border-black/5 bg-white shadow-[0_32px_80px_rgba(0,0,0,0.06)]'
    : 'border-white/10 bg-[linear-gradient(180deg,rgba(22,26,34,0.95)_0%,rgba(10,12,18,0.98)_100%)]'

  const headerText = isLight ? 'text-[#9CA3AF]' : 'text-slate-500'
  const rowBorder = isLight ? 'border-black/5' : 'border-white/8'
  const rowHover = isLight ? 'hover:bg-[#FAFAFA]' : 'hover:bg-white/[0.03]'
  const titleText = isLight ? 'text-[#111111]' : 'text-white'
  const bodyText = isLight ? 'text-[#6B7280]' : 'text-slate-400'
  const tagClass = isLight
    ? 'border-black/5 bg-[#E8F8F5] text-[#224234]'
    : 'border-white/10 bg-white/[0.05] text-[#c6efcf]'

  const demoButtonClass = isLight
    ? 'border-black/10 bg-[#111111] text-white hover:bg-black/90 shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
    : 'border-white/10 bg-white text-black hover:bg-zinc-200'

  return (
    <section id="solutions-catalog" className="relative scroll-mt-28">
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p
            className={`inline-flex rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
              isLight ? 'border-black/10 bg-black/[0.03] text-[#4B5563]' : 'border-white/10 bg-white/[0.05] text-slate-300'
            }`}
          >
            Solutions catalog
          </p>
          <h2 className={`mt-5 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl ${titleText}`}>
            Every use case. One page. No rabbit holes.
          </h2>
          <p className={`mt-4 text-[16px] leading-relaxed ${bodyText}`}>
            Enough context to know if ZORD fits your workflow. Rollout logic, proof paths, and integration depth come on the demo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-full px-4 py-2.5 text-[13px] font-semibold transition ${
              filter === 'all'
                ? isLight
                  ? 'bg-[#111111] text-white shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
                  : 'bg-white text-black'
                : isLight
                ? 'border border-black/10 bg-white text-[#4B5563] hover:bg-black/[0.02]'
                : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
            }`}
          >
            All ({solutionEntries.length})
          </button>
          {solutionMenuViews.map((view) => {
            const count = solutionEntries.filter((e) => e.views.includes(view.id)).length
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setFilter(view.id)}
                className={`rounded-full px-4 py-2.5 text-[13px] font-semibold transition ${
                  filter === view.id
                    ? isLight
                      ? 'bg-[#111111] text-white shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
                      : 'bg-white text-black'
                    : isLight
                    ? 'border border-black/10 bg-white text-[#4B5563] hover:bg-black/[0.02]'
                    : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                }`}
              >
                {view.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      <div className={`overflow-hidden rounded-[2rem] border ${shellClass}`}>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className={`border-b ${rowBorder}`}>
                <th className={`px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] ${headerText}`}>
                  Solution
                </th>
                <th className={`px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] ${headerText}`}>
                  Type
                </th>
                <th className={`px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.16em] ${headerText}`}>
                  Next step
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSolutions.map((solution) => (
                <tr key={solution.slug} className={`border-b last:border-0 ${rowBorder} ${rowHover} transition-colors`}>
                  <td className="px-6 py-5">
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border ${tagClass}`}
                      >
                        <SolutionGlyph name={solution.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-[15px] font-semibold tracking-[-0.03em] ${titleText}`}>
                          {solution.title}
                        </div>
                        <p className={`mt-1 max-w-lg text-[13px] leading-6 ${bodyText}`}>
                          {solution.shortDescription}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-5 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {solution.views.map((view) => (
                        <span
                          key={view}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tagClass}`}
                        >
                          {viewLabels[view]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top text-right">
                    <a
                      href={demoHref(solution.title)}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition ${demoButtonClass}`}
                    >
                      Book demo
                      <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y md:hidden">
          {filteredSolutions.map((solution) => (
            <div key={solution.slug} className={`border-b last:border-0 p-5 ${rowBorder}`}>
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border ${tagClass}`}
                >
                  <SolutionGlyph name={solution.icon} className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-[15px] font-semibold ${titleText}`}>{solution.title}</div>
                  <p className={`mt-1 text-[13px] leading-6 ${bodyText}`}>{solution.shortDescription}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {solution.views.map((view) => (
                  <span
                    key={view}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tagClass}`}
                  >
                    {viewLabels[view]}
                  </span>
                ))}
              </div>
              <a
                href={demoHref(solution.title)}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-3 text-[13px] font-semibold ${demoButtonClass}`}
              >
                Book demo
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>

        {filteredSolutions.length === 0 ? (
          <div className={`px-6 py-12 text-center text-[14px] ${bodyText}`}>No solutions match this filter.</div>
        ) : null}
      </div>

      <div
        className={`mt-8 flex flex-col gap-4 rounded-[1.5rem] border px-6 py-6 sm:flex-row sm:items-center sm:justify-between ${
          isLight ? 'border-black/5 bg-[#FAFAFA]' : 'border-white/10 bg-white/[0.03]'
        }`}
      >
        <div>
          <p className={`text-[15px] font-semibold ${titleText}`}>Need rollout logic, proof paths, or integration depth?</p>
          <p className={`mt-1 text-[13px] leading-6 ${bodyText}`}>
            That conversation happens on a demo — not buried in documentation.
          </p>
        </div>
        <a
          href="mailto:Support@zordnet.com?subject=Book%20a%20ZORD%20solutions%20demo"
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-semibold transition ${demoButtonClass}`}
        >
          Talk to sales
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      <p className={`mt-4 text-[13px] ${bodyText}`}>
        Showing {filteredSolutions.length} of {solutionEntries.length} solutions
        {filter !== 'all' ? ` · filtered by ${solutionMenuViews.find((v) => v.id === filter)?.label.toLowerCase()}` : ''}.
      </p>
    </section>
  )
}
