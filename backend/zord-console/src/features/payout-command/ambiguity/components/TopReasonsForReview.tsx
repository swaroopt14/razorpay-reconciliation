'use client'

import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { deriveReviewReasons } from '../selectors/deriveReviewReasons'

type TopReasonsForReviewProps = {
  amb: AmbiguityKpiResolved | null
}

export function TopReasonsForReview({ amb }: TopReasonsForReviewProps) {
  const reasons = deriveReviewReasons(amb)
  const count = amb?.ambiguous_intent_count

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="text-[12px] font-bold uppercase tracking-wider text-[#000000]">
          Zord Intelligence
        </span>
      </div>

      {/* Main quote */}
      <div className="mt-5 flex-1">
        <p className="text-[1.35rem] font-bold leading-snug text-[#000000]">
          {amb?.intelligence_headline ? (
            amb.intelligence_headline
          ) : count != null ? (
            <>
              &ldquo;Detected{' '}
              <span style={{ color: '#000000' }}>{count.toLocaleString('en-IN')}</span> intents needing
              review.&rdquo;
            </>
          ) : (
            '—'
          )}
        </p>
        {amb?.intelligence_body ? (
          <p className="mt-3 text-[13px] font-medium leading-relaxed text-[#00239C]">{amb.intelligence_body}</p>
        ) : null}
      </div>

      {/* CTA button */}
      <button
        type="button"
        className="mt-5 w-full rounded-xl bg-black py-3 text-[12px] font-bold uppercase tracking-widest text-white transition hover:opacity-90"
      >
        Execute Optimization
      </button>

      {/* Divider */}
      {reasons.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Top Reasons
          </p>
          {reasons.slice(0, 3).map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
            >
              <div
                className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${
                  r.severity === 'high'
                    ? 'bg-red-500'
                    : r.severity === 'medium'
                    ? 'bg-amber-500'
                    : 'bg-neutral-500'
                }`}
              />
              <span className="text-[12px] leading-snug text-slate-700">{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
