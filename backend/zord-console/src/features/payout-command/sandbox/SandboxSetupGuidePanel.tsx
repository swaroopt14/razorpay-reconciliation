'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import { isDemoQuery, isDemoSession } from '@/services/payout-command/demo/ycDemoConstants'
import {
  isSandboxSetupStepDone,
  readSandboxSetupProgress,
  SANDBOX_SETUP_GUIDE,
  SANDBOX_SETUP_PANEL_DISMISSED_KEY,
  SANDBOX_SETUP_PANEL_MINIMIZED_KEY,
  SANDBOX_SETUP_SECTIONS,
  type SandboxSetupGuideStep,
  type SandboxSetupProgress,
} from '@/services/payout-command/sandbox-setup-guide'

/** Matches Recommended chip / command-center green. */
const SETUP_GUIDE_GREEN = '#000000'
const SETUP_GUIDE_GREEN_RING = 'rgba(57, 224, 126, 0.28)'

type TaskStatus = 'done' | 'active' | 'locked'

function stepHref(step: SandboxSetupGuideStep, batchCenterHref: string): string | undefined {
  if (!step.href) return undefined
  if (step.id === 'create') {
    const base = batchCenterHref.split('?')[0] || batchCenterHref
    return `${base}?demo=sandbox&upload=1`
  }
  return step.href
}

/**
  * Spec Part 10: workspace is pre-populated - every step is clickable.
  * First incomplete step is highlighted as the suggested next move.
  */
function resolveTaskStatus(
  stepId: string,
  progress: SandboxSetupProgress,
  orderedIds: string[],
): TaskStatus {
  const idx = orderedIds.indexOf(stepId)
  if (idx < 0) return 'locked'
  if (isSandboxSetupStepDone(stepId, progress)) return 'done'
  const firstOpen = orderedIds.find((id) => !isSandboxSetupStepDone(id, progress))
  return firstOpen === stepId ? 'active' : 'active'
}

function TaskIcon({ status }: { status: TaskStatus }) {
  if (status === 'done') {
    return (
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: SETUP_GUIDE_GREEN }}
      >
        <svg className="h-2.5 w-2.5 text-[#0A0A0A]" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 6.2 5 8.7 9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[5px]"
        style={{
          borderColor: SETUP_GUIDE_GREEN_RING,
          backgroundColor: SETUP_GUIDE_GREEN,
        }}
      />
    )
  }
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[#cbd5e1]" aria-hidden>
      <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.5 6.5 13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-[#64748b] transition ${up ? '' : 'rotate-180'}`}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
  * Stripe-style floating setup guide - bottom-right on sandbox routes.
  * When GuidedDemoBanner is visible, the dismissed FAB is hidden (same CTA lives in the banner).
  */
function SandboxSetupGuidePanelInner() {
  const pathname = usePathname()
  const params = useSearchParams()
  const demoChrome = isDemoQuery(params.get('demo')) || isDemoSession()
  const batchCenterHref = payoutBatchCommandCenterHref(true)
  const [dismissed, setDismissed] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [progress, setProgress] = useState<SandboxSetupProgress>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SANDBOX_SETUP_SECTIONS.map((s) => [s.id, s.defaultExpanded])),
  )

  const orderedStepIds = useMemo(
    () => SANDBOX_SETUP_SECTIONS.flatMap((s) => s.stepIds),
    [],
  )

  const refreshProgress = useCallback(() => {
    setProgress(readSandboxSetupProgress())
  }, [])

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(SANDBOX_SETUP_PANEL_DISMISSED_KEY) === '1')
      setMinimized(sessionStorage.getItem(SANDBOX_SETUP_PANEL_MINIMIZED_KEY) === '1')
    } catch {
      setDismissed(false)
    }
    refreshProgress()
  }, [refreshProgress])

  useEffect(() => {
    const onProgress = () => refreshProgress()
    const onOpen = () => {
      try {
        sessionStorage.removeItem(SANDBOX_SETUP_PANEL_DISMISSED_KEY)
      } catch {
        /* ignore */
      }
      setDismissed(false)
      setMinimized(false)
    }
    window.addEventListener('zord:sandbox-setup-progress', onProgress)
    window.addEventListener('zord:sandbox-setup-open', onOpen)
    window.addEventListener('storage', onProgress)
    return () => {
      window.removeEventListener('zord:sandbox-setup-progress', onProgress)
      window.removeEventListener('zord:sandbox-setup-open', onOpen)
      window.removeEventListener('storage', onProgress)
    }
  }, [refreshProgress])

  const completedCount = orderedStepIds.filter((id) => isSandboxSetupStepDone(id, progress)).length
  const progressPct = Math.round((completedCount / orderedStepIds.length) * 100)

  const dismiss = () => {
    try {
      sessionStorage.setItem(SANDBOX_SETUP_PANEL_DISMISSED_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  const toggleMinimize = () => {
    const next = !minimized
    setMinimized(next)
    try {
      if (next) sessionStorage.setItem(SANDBOX_SETUP_PANEL_MINIMIZED_KEY, '1')
      else sessionStorage.removeItem(SANDBOX_SETUP_PANEL_MINIMIZED_KEY)
    } catch {
      /* ignore */
    }
  }

  // Policy Studio / Ask Zord use the right edge - keep this chip off those pages.
  const hideForRoute =
    (pathname ?? '').startsWith('/controls') ||
    (pathname ?? '').startsWith('/ask') ||
    (pathname ?? '').includes('batch-command-center')

  if (hideForRoute) return null

  if (dismissed) {
    // Demo pages already expose “Guided demo path” in the top sandbox banner.
    if (demoChrome) return null
    return (
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.removeItem(SANDBOX_SETUP_PANEL_DISMISSED_KEY)
          } catch {
            /* ignore */
          }
          setDismissed(false)
        }}
        className="fixed bottom-5 right-5 z-[60] rounded-full border border-slate-200/90 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0f172a] shadow-[0_8px_30px_rgba(15,23,42,0.12)] transition hover:bg-slate-50"
      >
        {SANDBOX_SETUP_GUIDE.panelTitle}
      </button>
    )
  }

  const stepsById = Object.fromEntries(SANDBOX_SETUP_GUIDE.steps.map((s) => [s.id, s])) as Record<
    string,
    SandboxSetupGuideStep
  >

  return (
    <aside
      className={`fixed bottom-5 right-5 z-[60] flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.04)] transition-all ${
        minimized ? 'max-h-[3.25rem]' : expanded ? 'max-h-[min(70vh,32rem)]' : 'max-h-[14rem]'
      }`}
      aria-label={SANDBOX_SETUP_GUIDE.panelTitle}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#0f172a]">
          {SANDBOX_SETUP_GUIDE.panelTitle}
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="rounded-md p-1.5 text-[#94a3b8] transition hover:bg-slate-100 hover:text-[#475569]"
            aria-label="Edit setup guide"
            title="Edit (coming soon)"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M12.2 3.8 16.2 7.8 7.4 16.6 3.4 16.6 3.4 12.6 12.2 3.8Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md p-1.5 text-[#94a3b8] transition hover:bg-slate-100 hover:text-[#475569]"
            aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M6 14 14 6M8 6h6v6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleMinimize}
            className="rounded-md p-1.5 text-[#94a3b8] transition hover:bg-slate-100 hover:text-[#475569]"
            aria-label={minimized ? 'Restore panel' : 'Minimize panel'}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md p-1.5 text-[#94a3b8] transition hover:bg-slate-100 hover:text-[#475569]"
            aria-label="Close setup guide"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {!minimized ? (
        <>
          <div className="shrink-0 px-4 pt-2">
            <p className="mb-2 text-[11px] leading-snug text-[#64748b]">{SANDBOX_SETUP_GUIDE.subtitle}</p>
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-[#e8ecf4]"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(progressPct, 4)}%`, backgroundColor: SETUP_GUIDE_GREEN }}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
            {SANDBOX_SETUP_SECTIONS.map((section) => {
              const isOpen = expandedSections[section.id] ?? section.defaultExpanded
              return (
                <div key={section.id} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-2 py-3 text-left"
                    onClick={() =>
                      setExpandedSections((prev) => ({ ...prev, [section.id]: !isOpen }))
                    }
                  >
                    <span className="text-[14px] font-semibold text-[#0f172a]">{section.title}</span>
                    <Chevron up={isOpen} />
                  </button>
                  {isOpen ? (
                    <ul className="space-y-0.5 px-2 pb-3">
                      {section.stepIds.map((stepId) => {
                        const step = stepsById[stepId]
                        if (!step) return null
                        const status = resolveTaskStatus(stepId, progress, orderedStepIds)
                        const href = stepHref(step, batchCenterHref)
                        const pathOnly = href?.split('?')[0] ?? ''
                        const isCurrentPath =
                          href != null &&
                          (pathname === pathOnly ||
                            (pathname?.startsWith(pathOnly) && pathOnly.length > 1) ||
                            (href.includes('batch-command-center') &&
                              pathname?.includes('batch-command-center')) ||
                            (href.includes('/ask') && pathname?.startsWith('/ask')))

                        const row = (
                          <span
                            className={`flex flex-1 items-start gap-2.5 py-2 text-[13px] leading-snug ${
                              status === 'locked'
                                ? 'text-[#cbd5e1]'
                                : status === 'active'
                                  ? 'font-medium text-[#0f172a]'
                                  : 'text-[#475569]'
                            }`}
                          >
                            <TaskIcon status={status} />
                            <span className="min-w-0 flex-1">
                              {step.n != null ? (
                                <span className="mr-1 text-[11px] font-semibold text-[#94a3b8]">
                                  {step.n}.
                                </span>
                              ) : null}
                              {step.title}
                              <span className="mt-0.5 block text-[11px] font-normal text-[#94a3b8]">
                                {step.summary}
                              </span>
                            </span>
                          </span>
                        )

                        return (
                          <li key={stepId}>
                            {href && status !== 'locked' ? (
                              <Link
                                href={href}
                                className={`block rounded-lg px-1 transition hover:bg-slate-50 ${
                                  isCurrentPath ? 'bg-[#000000]/10' : ''
                                }`}
                              >
                                {row}
                              </Link>
                            ) : (
                              <div className="rounded-lg px-1">{row}</div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </div>
              )
            })}
            <div className="mt-2 space-y-1 border-t border-slate-100 px-2 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">
                Reviewer readiness
              </p>
              {SANDBOX_SETUP_GUIDE.notes.map((note) => (
                <p key={note} className="text-[10px] leading-snug text-[#94a3b8]">
                  {note}
                </p>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </aside>
  )
}

export function SandboxSetupGuidePanel() {
  return (
    <Suspense fallback={null}>
      <SandboxSetupGuidePanelInner />
    </Suspense>
  )
}
