'use client'

import type { OpsInsightAlert } from './types'
import { insightAlertRowChrome } from './alertTone'

export function InsightAlertListRow({
  alert,
  onDismiss,
}: {
  alert: OpsInsightAlert
  onDismiss: () => void
}) {
  const { rail, shell } = insightAlertRowChrome(alert.tone)

  return (
    <li className="list-none">
      <div
        className={`overflow-hidden rounded-xl border ${shell} shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,transform] duration-200 hover:shadow-[0_4px_14px_-4px_rgba(15,23,42,0.12)]`}
      >
        <div className="flex min-h-0">
          <div className={`w-1 shrink-0 self-stretch rounded-l-[10px] ${rail}`} aria-hidden />
          <div className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 sm:gap-3 sm:px-3.5 sm:py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-[#0f172a]">{alert.title}</div>
              <p className="mt-1 text-[13px] leading-[1.55] text-[#475569]">{alert.body}</p>
              <time
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium tabular-nums text-[#94a3b8]"
                dateTime={alert.createdAt}
              >
                <span className="h-1 w-1 rounded-full bg-[#cbd5e1]" aria-hidden />
                {new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-transparent px-2 py-1.5 text-[12px] font-semibold text-[#64748b] transition-colors hover:border-black/[0.08] hover:bg-white/90 hover:text-[#0f172a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6366f1]"
              onClick={onDismiss}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}
