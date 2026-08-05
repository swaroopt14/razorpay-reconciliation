'use client'

import { useEffect, useState } from 'react'
import {
  PAGE_EXPLAINERS,
  type PageExplainerId,
} from './pageExplainerBanners'

const DISMISS_PREFIX = 'zord_page_explainer_dismissed:'

type PageExplainerBannerProps = {
  page: PageExplainerId
  /** Compact strip under sandbox chrome - default true for in-app pages. */
  compact?: boolean
  className?: string
}

/**
  * Generated visual explainer for a sidebar destination.
  * Dismissible per page; does not replace the page title - it teaches the loop.
  */
export function PageExplainerBanner({
  page,
  compact = true,
  className = '',
}: PageExplainerBannerProps) {
  const copy = PAGE_EXPLAINERS[page]
  const storageKey = `${DISMISS_PREFIX}${page}`
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(storageKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [storageKey])

  if (dismissed === null) return null

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.removeItem(storageKey)
          } catch {
            /* ignore */
          }
          setDismissed(false)
        }}
        className={`mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2563EB] hover:underline ${className}`}
      >
        Show page guide
      </button>
    )
  }

  return (
    <section
      className={`relative mb-4 overflow-hidden rounded-md border border-[#D8DEE9] bg-[#0B1324] ${className}`}
      aria-label={`${copy.eyebrow}: ${copy.title}`}
    >
      <div className={`relative w-full ${compact ? 'h-[132px] sm:h-[148px]' : 'aspect-[16/9] max-h-[220px]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={copy.imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B1324] via-[#0B1324]/75 to-[#0B1324]/25" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1324]/90 via-transparent to-transparent" />
      </div>

      <div className="absolute inset-0 flex items-end justify-between gap-3 px-4 pb-3.5 pt-8 sm:px-5">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">
            {copy.eyebrow}
          </p>
          <p className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-white sm:text-[16px]">
            {copy.title}
          </p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#94A3B8] sm:text-[13px]">
            {copy.body}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {copy.badge ? (
            <span className="rounded-sm border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-semibold text-[#BFDBFE]">
              {copy.badge}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem(storageKey, '1')
              } catch {
                /* ignore */
              }
              setDismissed(true)
            }}
            className="rounded-sm border border-white/20 bg-black/30 px-2 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm hover:bg-black/45"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  )
}
