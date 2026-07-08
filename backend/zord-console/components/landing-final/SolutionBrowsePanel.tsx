'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { SolutionGlyph } from '@/components/landing-final/SolutionGlyph'
import { getSolutionsForView, solutionEntries, solutionMenuViews, type SolutionViewId } from '@/components/landing-final/solutions-data'

function demoHref(solutionTitle: string) {
  return `mailto:Support@zordnet.com?subject=${encodeURIComponent(`Book demo — ${solutionTitle}`)}`
}

export function SolutionBrowsePanel({
  compact = false,
  theme = 'dark',
}: {
  compact?: boolean
  theme?: 'light' | 'dark'
}) {
  const [activeView, setActiveView] = useState<SolutionViewId>('use-case')
  const [hoveredSlug, setHoveredSlug] = useState<string>('open-finance')

  const visibleSolutions = useMemo(() => getSolutionsForView(activeView), [activeView])

  const isLight = theme === 'light'

  useEffect(() => {
    if (!visibleSolutions.find((entry) => entry.slug === hoveredSlug)) {
      setHoveredSlug(visibleSolutions[0]?.slug ?? solutionEntries[0].slug)
    }
  }, [hoveredSlug, visibleSolutions])

  const activeSolution =
    visibleSolutions.find((entry) => entry.slug === hoveredSlug) ??
    visibleSolutions[0] ??
    solutionEntries[0]
  const browseAllHref = '/final-landing/solutions#solutions-catalog'

  const shellClassName = compact
    ? 'p-3 backdrop-blur-[28px]'
    : isLight
    ? 'bg-white p-4 sm:p-6 shadow-[0_32px_80px_rgba(0,0,0,0.06)]'
    : 'bg-[linear-gradient(180deg,rgba(22,26,34,0.95)_0%,rgba(10,12,18,0.98)_100%)] p-4 sm:p-5'

  const shellStyle = compact
    ? {
        background: isLight
          ? 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.96) 100%)'
          : 'linear-gradient(180deg, rgba(214, 245, 220, 0.16) 0%, rgba(121, 138, 128, 0.16) 0.01%, rgba(24, 31, 34, 0.92) 18%, rgba(11, 14, 17, 0.96) 100%)',
        boxShadow: isLight
          ? '0 20px 48px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)'
          : '0 28px 80px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.05)',
      }
    : undefined

  const railClassName = compact
    ? isLight
      ? 'border-black/5 bg-black/[0.02]'
      : 'border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
    : isLight
    ? 'border-black/5 bg-black/[0.01]'
    : 'border-white/8 bg-white/[0.04]'

  const activeViewClassName = isLight
    ? 'bg-[#111111] text-white shadow-[0_12px_24px_rgba(0,0,0,0.12)]'
    : compact
    ? 'bg-[linear-gradient(180deg,rgba(214,245,220,0.92)_0%,rgba(198,239,207,0.76)_100%)] text-[#0e1b14] shadow-[0_16px_34px_rgba(198,239,207,0.22),inset_0_1px_0_rgba(255,255,255,0.65)]'
    : 'bg-[#dce8f7] text-[#0c1724] shadow-[0_12px_30px_rgba(220,232,247,0.18)]'

  const activeViewCopyClassName = isLight ? 'text-white/60' : compact ? 'text-[#40534a]' : 'text-[#425265]'

  const selectedCardClassName = compact
    ? isLight
      ? 'border-black/5 bg-black/[0.02]'
      : 'border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(214,245,220,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.02)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]'
    : isLight
    ? 'border-black/5 bg-[#FAFAFA]'
    : 'border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0.01)_100%)]'

  const listPanelClassName = compact
    ? isLight
      ? 'border-black/5 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.04)]'
      : 'border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.025)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]'
    : isLight
    ? 'border-black/5 bg-[#FAFAFA]'
    : 'border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.015)_100%)]'

  const activeSolutionCardClassName = isLight
    ? 'border-[#34D399] bg-white shadow-[0_12px_32px_rgba(52,211,153,0.08)]'
    : compact
    ? 'border-[rgba(198,239,207,0.42)] bg-[radial-gradient(circle_at_top_left,rgba(214,245,220,0.16),transparent_36%),linear-gradient(180deg,rgba(44,61,53,0.58)_0%,rgba(18,25,22,0.82)_100%)] shadow-[0_18px_40px_rgba(198,239,207,0.16),inset_0_1px_0_rgba(255,255,255,0.12)]'
    : 'border-[#7aa2ff] bg-[linear-gradient(180deg,rgba(33,56,94,0.28)_0%,rgba(17,25,41,0.45)_100%)] shadow-[0_16px_40px_rgba(12,32,68,0.24)]'

  const iconClassName = isLight
    ? 'border-black/5 bg-[#E8F8F5] text-[#224234]'
    : compact
    ? 'border-[rgba(214,245,220,0.42)] bg-[linear-gradient(180deg,rgba(228,248,233,0.96)_0%,rgba(203,233,211,0.84)_100%)] text-[#224234] shadow-[0_12px_24px_rgba(198,239,207,0.16),inset_0_1px_0_rgba(255,255,255,0.85)]'
    : 'border-[#cde7ff]/60 bg-[linear-gradient(180deg,rgba(219,242,255,0.92)_0%,rgba(232,240,255,0.78)_100%)] text-[#174a7a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]'

  const browseAllButtonClassName = isLight
    ? 'border-black/10 bg-white text-[#111111] hover:bg-black/[0.02]'
    : compact
    ? 'border-[rgba(198,239,207,0.22)] bg-[linear-gradient(180deg,rgba(214,245,220,0.14)_0%,rgba(255,255,255,0.04)_100%)] text-[#dff7e5] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] hover:bg-[linear-gradient(180deg,rgba(214,245,220,0.18)_0%,rgba(255,255,255,0.08)_100%)]'
    : 'border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'

  return (
    <div
      className={`overflow-hidden rounded-[2.5rem] border ${
        isLight ? 'border-black/5' : 'border-white/10'
      } ${shellClassName}`}
      style={shellStyle}
    >
      <div className={`grid gap-4 ${compact ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : 'lg:grid-cols-[260px_minmax(0,1fr)]'}`}>
        <div className={`rounded-[1.8rem] border p-3 ${railClassName}`}>
          <div className="space-y-2">
            {solutionMenuViews.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
                className={`w-full rounded-[1.4rem] px-4 py-4 text-left transition-all ${
                  activeView === view.id
                    ? activeViewClassName
                    : isLight
                    ? 'bg-transparent text-[#4B5563] hover:bg-black/[0.03]'
                    : 'bg-transparent text-slate-300 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[15px] font-semibold tracking-[-0.03em]">{view.label}</div>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M4 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="m10.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className={`mt-2 text-[12px] leading-5 ${activeView === view.id ? activeViewCopyClassName : isLight ? 'text-[#9CA3AF]' : 'text-slate-500'}`}>
                  {view.description}
                </p>
              </button>
            ))}
          </div>

          <div className={`mt-4 rounded-[1.5rem] border px-4 py-5 ${selectedCardClassName}`}>
            <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLight ? 'text-[#9CA3AF]' : 'text-slate-500'}`}>Selected</div>
            <div className={`mt-3 text-lg font-semibold tracking-[-0.03em] ${isLight ? 'text-[#111111]' : 'text-white'}`}>{activeSolution.title}</div>
            <p className={`mt-2 text-[13px] leading-6 ${isLight ? 'text-[#6B7280]' : 'text-slate-400'}`}>{activeSolution.shortDescription}</p>
            <a
              href={demoHref(activeSolution.title)}
              className={`mt-4 inline-flex items-center gap-2 text-[13px] font-semibold transition ${isLight ? 'text-[#059669] hover:text-[#047857]' : 'text-[#c6efcf] hover:text-[#d8f5de]'}`}
            >
              Book demo
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M6 14 14 6M8 6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-4 sm:p-6 ${listPanelClassName}`}>
          <div className={`grid gap-4 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-2'}`}>
            {visibleSolutions.map((solution) => (
              <button
                key={solution.slug}
                type="button"
                onMouseEnter={() => setHoveredSlug(solution.slug)}
                onFocus={() => setHoveredSlug(solution.slug)}
                className={`w-full rounded-[1.5rem] border px-4 py-5 text-left transition-all ${
                  solution.slug === activeSolution.slug
                    ? activeSolutionCardClassName
                    : isLight
                    ? 'border-black/5 bg-white hover:border-black/10 hover:shadow-lg'
                    : 'border-white/8 bg-white/[0.02] hover:border-white/14 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.15rem] border ${iconClassName}`}>
                    <SolutionGlyph name={solution.icon} className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[15px] font-semibold tracking-[-0.03em] ${isLight ? 'text-[#111111]' : 'text-white'}`}>{solution.title}</div>
                    <p className={`mt-2 text-[13px] leading-6 ${isLight ? 'text-[#6B7280]' : 'text-slate-400'}`}>{solution.shortDescription}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className={`mt-6 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between ${isLight ? 'border-black/5' : 'border-white/8'}`}>
            <p className={`text-[13px] leading-6 max-w-md ${isLight ? 'text-[#6B7280]' : 'text-slate-400'}`}>
              See every solution in one catalog — book a demo for rollout depth.
            </p>
            <Link
              href={browseAllHref}
              className={`inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3.5 text-[13px] font-semibold transition ${browseAllButtonClassName} shadow-sm`}
            >
              See all solutions
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="m10.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
