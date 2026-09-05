'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { OVERVIEW_PATH_GUIDE_STEPS } from '@/services/payout-command/demo/ycDemoConstants'

const PATH_PROGRESS_KEY = 'zord:overview-path-progress'

type PathProgress = Partial<Record<(typeof OVERVIEW_PATH_GUIDE_STEPS)[number]['id'], boolean>>

function readPathProgress(): PathProgress {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PATH_PROGRESS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PathProgress
  } catch {
    return {}
  }
}

function markPathStep(id: string) {
  if (typeof window === 'undefined') return
  try {
    const prev = readPathProgress()
    const next = { ...prev, [id]: true }
    window.localStorage.setItem(PATH_PROGRESS_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('zord:overview-path-progress'))
  } catch {
    /* ignore */
  }
}

type TaskStatus = 'done' | 'active' | 'upcoming'

function resolveStatus(stepId: string, progress: PathProgress, orderedIds: string[]): TaskStatus {
  if (progress[stepId as keyof PathProgress]) return 'done'
  const firstOpen = orderedIds.find((id) => !progress[id as keyof PathProgress])
  return firstOpen === stepId ? 'active' : 'upcoming'
}

/**
  * Compact lifecycle path on Overview - stages only, no essay copy.
  */
export function LifecycleGuideWidget() {
  const orderedIds = OVERVIEW_PATH_GUIDE_STEPS.map((s) => s.id)
  const [progress, setProgress] = useState<PathProgress>({})
  const [dismissed, setDismissed] = useState(true)

  const refresh = useCallback(() => {
    setProgress(readPathProgress())
  }, [])

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem('zord:overview-path-dismissed') === '1')
    } catch {
      setDismissed(false)
    }
    refresh()
    const onProg = () => refresh()
    window.addEventListener('zord:overview-path-progress', onProg)
    return () => window.removeEventListener('zord:overview-path-progress', onProg)
  }, [refresh])

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.removeItem('zord:overview-path-dismissed')
          } catch {
            /* ignore */
          }
          setDismissed(false)
        }}
        className="text-[12px] font-semibold text-[#2563EB] hover:underline"
      >
        Show payout path
      </button>
    )
  }

  return (
    <section aria-label="Payout path" className="relative border border-[#E2E8F0] bg-white" id="path-guide">
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem('zord:overview-path-dismissed', '1')
          } catch {
            /* ignore */
          }
          setDismissed(true)
        }}
        className="absolute right-2 top-2 z-[1] flex h-8 w-8 items-center justify-center text-[18px] text-[#94A3B8] hover:text-[#0B1324]"
        aria-label="Dismiss payout path"
      >
        ×
      </button>

      <div className="border-b border-[#E2E8F0] px-4 py-3 pr-10">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#0B1324]">Payout path</p>
        <span className="mt-1 block h-0.5 w-8 bg-[#2563EB]" aria-hidden />
      </div>

      <div className="flex gap-0 overflow-x-auto">
        {OVERVIEW_PATH_GUIDE_STEPS.map((step, i) => {
          const status = resolveStatus(step.id, progress, orderedIds)
          return (
            <div key={step.id} className="flex min-w-0 flex-1 items-stretch">
              <Link
                href={step.href}
                onClick={() => markPathStep(step.id)}
                className={`flex min-w-[72px] flex-1 flex-col items-center justify-center gap-1.5 px-2 py-4 text-center transition hover:bg-[#F8FAFC] ${
                  status === 'active' ? 'bg-[#F1F5F9]' : 'bg-white'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center text-[11px] font-bold ${
                    status === 'done'
                      ? 'bg-[#0B1324] text-white'
                      : status === 'active'
                        ? 'bg-[#2563EB] text-white'
                        : 'border border-[#CBD5E1] text-[#94A3B8]'
                  }`}
                >
                  {status === 'done' ? '✓' : i + 1}
                </span>
                <span
                  className={`text-[12px] font-semibold ${
                    status === 'upcoming' ? 'text-[#94A3B8]' : 'text-[#0B1324]'
                  }`}
                >
                  {step.label}
                </span>
              </Link>
              {i < OVERVIEW_PATH_GUIDE_STEPS.length - 1 ? (
                <span className="hidden w-px shrink-0 bg-[#E2E8F0] sm:block" aria-hidden />
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
