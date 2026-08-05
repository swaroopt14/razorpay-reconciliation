'use client'

import type { ReactNode } from 'react'

type AlertsDropdownPanelProps = {
  title: string
  /** Short line under the title (e.g. “Unread items need a glance”). */
  subtitle: string
  activeCount: number
  children: ReactNode
}

/**
 * Shared shell for bell / inbox popovers: header, count, scroll region, consistent chrome.
 */
export function AlertsDropdownPanel({ title, subtitle, activeCount, children }: AlertsDropdownPanelProps) {
  return (
    <div className="pointer-events-auto overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_22px_45px_-16px_rgba(15,23,42,0.28),0_0_0_1px_rgba(15,23,42,0.04)]">
      <header className="flex items-start justify-between gap-3 border-b border-black/[0.06] bg-gradient-to-b from-[#f7f7f5] to-[#fafaf9] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.02em] text-[#111111]">{title}</h2>
            {activeCount > 0 ? (
              <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[#111111] px-2 text-[12px] font-semibold tabular-nums text-white">
                {activeCount > 99 ? '99+' : activeCount}
              </span>
            ) : (
              <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[12px] font-medium tabular-nums text-[#94a3b8]">
                0
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-[#64748b]">{subtitle}</p>
        </div>
      </header>
      <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-contain bg-[#fafaf9]/40 p-2.5 [scrollbar-gutter:stable]">{children}</div>
    </div>
  )
}
