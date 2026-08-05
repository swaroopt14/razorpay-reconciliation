'use client'

import { useState } from 'react'

import type { AlertStripProps } from './types'

const BG: Record<AlertStripProps['status'], string> = {
  GREEN: '#000000',
  AMBER: '#f59e0b',
  RED: '#dc2626',
}

/** Neon rim + glow (payout view system). Exported for SandboxBanner parity. */
export const ALERT_STRIP_NEON: Record<AlertStripProps['status'], string> = {
  GREEN:
    'shadow-[0_0_32px_rgba(0,0,0,0.25),0_4px_24px_rgba(0,0,0,0.2)] ring-1 ring-black/35',
  AMBER:
    'shadow-[0_0_28px_rgba(245,158,11,0.42),0_4px_20px_rgba(217,119,6,0.25)] ring-1 ring-amber-300/40',
  RED: 'shadow-[0_0_30px_rgba(220,38,38,0.48),0_4px_22px_rgba(185,28,28,0.3)] ring-1 ring-red-400/35',
}

const NEON = ALERT_STRIP_NEON

const ARIA_LABEL: Record<AlertStripProps['status'], string> = {
  RED: 'Action required',
  AMBER: 'Attention required',
  GREEN: 'Normal',
}

/** Product labels for accessibility only — strip color carries state. */
const STATE_TAB: Record<AlertStripProps['status'], string> = {
  GREEN: 'Normal',
  AMBER: 'Attention required',
  RED: 'Action required',
}

export function AlertStrip({
  status,
  message,
  timestamp,
  actionAnchorId,
  actionAnchorLabel = 'View details',
  dismissible,
}: AlertStripProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      className={`relative z-[60] w-full border-b border-white/15 px-4 py-3 text-white sm:px-6 ${NEON[status]}`}
      style={{ backgroundColor: BG[status] }}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
          <span className="sr-only">{ARIA_LABEL[status]}: </span>
          <span
            className="shrink-0 rounded-md bg-white/20 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-white backdrop-blur-sm"
            aria-hidden
          >
            {STATE_TAB[status]}
          </span>
          <p className="min-w-0 text-[16px] font-semibold leading-snug tracking-[-0.02em]">
            <span className="font-medium">{message}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
          {actionAnchorId ? (
            <a
              href={`#${actionAnchorId}`}
              className="rounded-lg bg-white/20 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {actionAnchorLabel}
            </a>
          ) : null}
          {dismissible ? (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-lg px-2 py-1 text-[13px] font-semibold text-white/90 underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Dismiss
            </button>
          ) : null}
          {timestamp && !Number.isNaN(new Date(timestamp).getTime()) ? (
            <time
              className="text-sm font-medium tabular-nums opacity-95 sm:text-base"
              dateTime={timestamp}
              title="Last updated"
            >
              Last updated ·{' '}
              {new Date(timestamp).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
          ) : null}
        </div>
      </div>
    </div>
  )
}
