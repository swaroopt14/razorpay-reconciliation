'use client'
import { useRouter } from 'next/navigation'
import {
  buildAskZordWorkspaceHref,
  storeAskZordSelectedContext,
  type AskZordSelectedContext,
} from '../workspace/askZordSelectedContext'
export const INTELLIGENCE_BLUE_GRADIENT =
  'linear-gradient(145deg, #1a3a7a 0%, #24499e 48%, #2d5cb8 100%)'

export type ZordInsightItem = {
  title: string
  detail: string
  severity?: 'high' | 'medium' | 'low'
  caseCount?: number
}

type ZordInsightsPanelProps = {
  title?: string
  insights: ZordInsightItem[]
  className?: string
  sourcePage?: string
  sectionTitle?: string
  batchId?: string
}

export function ZordInsightsPanel({
  title = 'Zord insights',
  insights,
  className = '',
  sourcePage = 'payout-command-view',
  sectionTitle = title,
  batchId,
}: ZordInsightsPanelProps) {
  const router = useRouter()

  const handleInsightAsk = (insight: ZordInsightItem) => {
    const context: AskZordSelectedContext = {
      scope: 'zord_insight',
      scopeLevel: batchId ? 'batch' : 'tenant',
      sourcePage,
      sectionTitle,
      selectedTitle: insight.title,
      selectedDescription: insight.detail,
      selectedMetrics: [
        ...(typeof insight.caseCount === 'number'
          ? [{ label: 'Linked cases', value: String(insight.caseCount) }]
          : []),
        ...(insight.severity ? [{ label: 'Severity', value: insight.severity }] : []),
      ],
      batchId,
    }

    storeAskZordSelectedContext(context)
    router.push(buildAskZordWorkspaceHref(context))
  }
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-[#24499e] p-5 text-white shadow-[0_14px_34px_rgba(0,35,156,0.32)] ${className}`}
      style={{ background: INTELLIGENCE_BLUE_GRADIENT }}
      data-testid="zord-insights-panel"
    >
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/75">{title}</p>
      </div>
      {insights.length === 0 ? (
        <p className="mt-4 text-[13px] text-white/75">No insights from API yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {insights.map((insight) => {
            const isHigh = insight.severity === 'high'
            const isMedium = insight.severity === 'medium'
            const borderColor = isHigh ? '#f87171' : isMedium ? '#fbbf24' : 'rgba(255,255,255,0.2)'
            const rowBg = isHigh ? 'rgba(248,113,113,0.08)' : isMedium ? 'rgba(251,191,36,0.07)' : undefined
            const dotColor = isHigh ? '#f87171' : isMedium ? '#fbbf24' : '#cbd5e1'
            const dotShadow = isHigh
              ? '0 0 6px rgba(248,113,113,0.7)'
              : isMedium
                ? '0 0 6px rgba(251,191,36,0.7)'
                : undefined
            return (
              <li
                key={insight.title}
                style={{ borderLeft: `3px solid ${borderColor}`, borderRadius: '10px', background: rowBg }}
              >
                <button
                  type="button"
                  onClick={() => handleInsightAsk(insight)}
                  className="flex w-full items-start gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
                  aria-label={`Ask Zord about ${insight.title}`}
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: dotColor, boxShadow: dotShadow }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white">
                      {insight.title}
                      {insight.caseCount ? (
                        <span className="ml-2 inline-flex rounded-full bg-white/90 px-1.5 text-[11px] font-semibold text-[#00239C]">
                          {insight.caseCount}
                        </span>
                      ) : null}
                      {insight.severity === 'high' ? (
                        <span className="ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(248,113,113,0.22)', color: '#fca5a5' }}>High</span>
                      ) : insight.severity === 'medium' ? (
                        <span className="ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(251,191,36,0.22)', color: '#fde68a' }}>Medium</span>
                      ) : null}
                    </span>
                    <span className="block text-[12.5px] leading-snug text-white/75">{insight.detail}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
