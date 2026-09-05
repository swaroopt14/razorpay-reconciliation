'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertsDropdownPanel } from '../command-center/AlertsDropdownPanel'
import { InsightAlertListRow } from '../command-center/InsightAlertListRow'
import type { OpsInsightAlert } from '../command-center/types'
import { PaymentEcosystemPanel } from '../ecosystem/PaymentEcosystemPanel'
import { AccountMenuButton } from './AccountMenuButton'

/** Shared chrome for dark utility controls - matches product-bar search cluster. */
const CTRL =
  'border border-[#2F2F2F] bg-[#1C1C1C] text-[#D4D4D4] transition hover:border-[#3A3A3A] hover:bg-[#242424] hover:text-white'

function PulseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12h3.2l1.6-4.2L11.2 18l2.4-6H21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 10.5v3c0 .8.7 1.5 1.5 1.5h1.2L14 19V5L7.2 9H6c-.8 0-1.5.7-1.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 9.2a3.2 3.2 0 0 1 0 5.6M18.8 7a6 6 0 0 1 0 10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

type TopbarUtilityClusterProps = {
  alerts: readonly OpsInsightAlert[]
  alertCount: number
  onDismissAlert: (id: string) => void
  deskRole: string
}

/**
  * Right-side cluster: wide dark search + activity / announcements / account.
  * Visual target: dark product bar utility strip (soft rectangles, monochrome).
  */
export function TopbarUtilityCluster({
  alerts,
  alertCount,
  onDismissAlert,
  deskRole,
}: TopbarUtilityClusterProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [ecosystemOpen, setEcosystemOpen] = useState(false)

  useEffect(() => {
    if (!ecosystemOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEcosystemOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ecosystemOpen])

  return (
    <>
    <div className="ml-auto flex min-w-0 max-w-[560px] flex-1 items-center justify-end gap-2.5">
      <div className="relative hidden min-w-0 flex-1 sm:block">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8A8A]"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <circle cx="8.5" cy="8.5" r="5.2" stroke="currentColor" strokeWidth="1.7" />
          <path d="m12.8 12.8 3.4 3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <label htmlFor="dock-nav-search" className="sr-only">
          Search
        </label>
        <input
          ref={searchRef}
          id="dock-nav-search"
          type="search"
          name="dock-nav-search"
          autoComplete="off"
          placeholder="Search payment products, settings, and more"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`h-10 w-full rounded-[10px] py-2 pl-10 pr-4 text-[13.5px] outline-none placeholder:text-[#8A8A8A] focus:border-[#4A4A4A] focus:bg-[#222] ${CTRL}`}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setAlertsOpen(false)
            setEcosystemOpen(true)
          }}
          className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${CTRL} ${
            ecosystemOpen ? 'border-[#4A4A4A] bg-[#242424] text-white' : ''
          }`}
          aria-label="Payment ecosystem health"
          title="Ecosystem"
          aria-expanded={ecosystemOpen}
        >
          <PulseIcon className="h-[18px] w-[18px]" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setAlertsOpen((o) => !o)}
            className={`relative flex h-10 w-10 items-center justify-center rounded-[10px] ${CTRL} ${
              alertsOpen ? 'border-[#4A4A4A] bg-[#242424] text-white' : ''
            }`}
            aria-label={`Announcements and alerts, ${alertCount} in inbox`}
            aria-expanded={alertsOpen}
          >
            <MegaphoneIcon className="h-[18px] w-[18px]" />
            {alertCount > 0 ? (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-sm bg-[#60A5FA]" />
            ) : null}
          </button>

          {alertsOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[55] cursor-default bg-black/20"
                aria-label="Close alerts"
                onClick={() => setAlertsOpen(false)}
              />
              <div className="absolute right-0 top-full z-[60] mt-2 w-[min(calc(100vw-1.5rem),24rem)] origin-top-right animate-[alerts-pop_0.18s_ease-out]">
                <AlertsDropdownPanel
                  title="Alerts"
                  subtitle="Highest priority first - dismiss when triaged."
                  activeCount={alertCount}
                >
                  {alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-black/12 bg-white px-5 py-12 text-center">
                      <p className="text-[15px] font-medium text-[#475569]">You&apos;re caught up</p>
                      <p className="max-w-[16rem] text-[13px] leading-relaxed text-[#94a3b8]">
                        New payout and ambiguity signals will show up here.
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-2.5">
                      {alerts.map((a) => (
                        <InsightAlertListRow
                          key={a.id}
                          alert={a}
                          onDismiss={() => onDismissAlert(a.id)}
                        />
                      ))}
                    </ul>
                  )}
                </AlertsDropdownPanel>
              </div>
            </>
          ) : null}
        </div>

        <AccountMenuButton deskRole={deskRole} tone="onDark" iconOnly />
      </div>
    </div>

    <PaymentEcosystemPanel open={ecosystemOpen} onClose={() => setEcosystemOpen(false)} />
    </>
  )
}

/** Optional slot helper for future mode control left of the cluster. */
export function TopbarModeSlot({ children }: { children: ReactNode }) {
  return <div className="hidden shrink-0 md:block">{children}</div>
}
