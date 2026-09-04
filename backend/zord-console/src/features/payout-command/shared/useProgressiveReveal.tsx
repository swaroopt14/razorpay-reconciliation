'use client'

import { useCallback, useEffect, useState } from 'react'

type UseProgressiveRevealOptions = {
  /** Milliseconds between each revealed item. */
  intervalMs?: number
  /** Begin revealing as soon as items are available. */
  autoStart?: boolean
  /** Change this to reset the reveal (e.g. active trace / connection). */
  resetKey?: string
}

/**
 * Reveal a list one item at a time — used for Signal Mesh provider polling
 * and Upload → Poll from ERP intake.
 */
export function useProgressiveReveal<T>(
  items: T[],
  { intervalMs = 700, autoStart = false, resetKey = '' }: UseProgressiveRevealOptions = {},
) {
  const [visibleCount, setVisibleCount] = useState(0)
  const [polling, setPolling] = useState(false)
  const total = items.length

  const stop = useCallback(() => {
    setPolling(false)
  }, [])

  const reset = useCallback(() => {
    setPolling(false)
    setVisibleCount(0)
  }, [])

  const start = useCallback(() => {
    if (total === 0) {
      setVisibleCount(0)
      setPolling(false)
      return
    }
    setPolling(true)
  }, [total])

  useEffect(() => {
    setVisibleCount(0)
    setPolling(false)
    if (autoStart && total > 0) {
      setPolling(true)
    }
  }, [resetKey, autoStart, total])

  useEffect(() => {
    if (!polling) return
    if (visibleCount >= total) {
      setPolling(false)
      return
    }
    const id = window.setTimeout(() => {
      setVisibleCount((n) => {
        const next = n + 1
        if (next >= total) setPolling(false)
        return Math.min(next, total)
      })
    }, intervalMs)
    return () => window.clearTimeout(id)
  }, [polling, visibleCount, total, intervalMs])

  const visible = items.slice(0, visibleCount)
  const complete = total > 0 && visibleCount >= total
  const idle = !polling && visibleCount === 0

  return {
    visible,
    visibleCount,
    total,
    polling,
    complete,
    idle,
    start,
    stop,
    reset,
  }
}

export function PollStatusBar({
  label,
  visibleCount,
  total,
  polling,
  complete,
  onStart,
  onStop,
  startLabel = 'Start polling',
  stopLabel = 'Stop',
  idleHint,
}: {
  label: string
  visibleCount: number
  total: number
  polling: boolean
  complete: boolean
  onStart: () => void
  onStop: () => void
  startLabel?: string
  stopLabel?: string
  idleHint?: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D8DEE9] bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">{label}</p>
        <p className="mt-0.5 text-[13px] text-[#0B1324]">
          {complete
            ? `Received ${total} of ${total}`
            : polling
              ? `Polling… ${visibleCount} of ${total}`
              : visibleCount > 0
                ? `Paused · ${visibleCount} of ${total}`
                : idleHint || 'Waiting to poll'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full border border-[#D8DEE9] bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
          Sandbox
        </span>
        {polling ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-9 items-center rounded-md border border-[#D8DEE9] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:border-[#0B1324]"
          >
            {stopLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={total === 0 || complete}
            className="inline-flex h-9 items-center rounded-md bg-[#0B1324] px-3 text-[12px] font-semibold text-white hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
          >
            {complete ? 'Complete' : visibleCount > 0 ? 'Resume polling' : startLabel}
          </button>
        )}
      </div>
    </div>
  )
}
