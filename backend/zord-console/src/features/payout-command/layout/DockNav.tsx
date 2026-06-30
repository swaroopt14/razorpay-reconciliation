'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ZordLogo } from '@/components/ZordLogo'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import {
  dockItems,
  SANDBOX_DOCK_DISPLAY_LABELS,
  CONNECTORS_DOCK_TEMPORARILY_HIDDEN,
  SANDBOX_DOCK_IDS,
  type DockId,
} from '@/services/payout-command/model'
import { AlertsDropdownPanel } from '../command-center/AlertsDropdownPanel'
import { InsightAlertListRow } from '../command-center/InsightAlertListRow'
import type { OpsInsightAlert } from '../command-center/types'
import { ModeTogglePill } from '../sandbox/ModeTogglePill'
import { AccountMenuButton } from './AccountMenuButton'
import { Glyph } from '../shared'

const DESK_ROLES = ['Ops supervisor', 'Payout desk'] as const

type DockNavProps = {
  activeDock: DockId
  onDockChange: (id: DockId) => void
  alerts?: readonly OpsInsightAlert[]
  onActivateClick: () => void
}

export function DockNav({ activeDock, onDockChange, alerts, onActivateClick }: DockNavProps) {
  const { mode } = useEnvironment()
  const searchRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const visibleDockItems = useMemo(() => {
    if (mode === 'sandbox') {
      return SANDBOX_DOCK_IDS.map((id) => dockItems.find((d) => d.id === id)).filter(
        (d): d is (typeof dockItems)[number] => Boolean(d),
      )
    }
    // Live: full rail minus sandbox-only + billing (plan page); connectors temporarily hidden.
    return dockItems.filter(
      (d) =>
        d.id !== 'sandbox' &&
        d.id !== 'billing' &&
        !(CONNECTORS_DOCK_TEMPORARILY_HIDDEN && d.id === 'connectors'),
    )
  }, [mode])

  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [desk, setDesk] = useState<(typeof DESK_ROLES)[number]>(DESK_ROLES[0])
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

  const visibleAlerts = useMemo(
    () => (alerts ?? []).filter((a) => !dismissed.has(a.id)),
    [alerts, dismissed],
  )
  const alertCount = visibleAlerts.length

  const openSearch = useCallback(() => {
    setSearchOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    searchRef.current?.blur()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openSearch()
      }
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault()
        closeSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSearch, openSearch, searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const timer = window.setTimeout(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [searchOpen])

  return (
    <header className="payout-command-nav relative z-40 !bg-white">
      <div className="mx-auto grid w-full max-w-[1920px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-3 sm:px-5 sm:py-3 lg:gap-x-4 lg:px-8">
        {/* Column 1 — brand + mode (never shrinks) */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5">
          <Link
            href="/"
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg pr-0.5 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:h-11 sm:gap-2.5"
            aria-label="Arealis Zord home"
          >
            <ZordLogo size="sm" variant="light" fitToHeight className="!w-auto max-w-[12rem] sm:max-w-[13rem]" />
          </Link>
          <ModeTogglePill onActivateClick={onActivateClick} compact />
        </div>

        {/* Column 2 — dock scrolls horizontally; never overlaps column 3 */}
        <div className="relative min-w-0 overflow-x-auto overflow-y-visible [-webkit-overflow-scrolling:touch] py-0.5 [scrollbar-width:thin]">
          <nav
            className="pc-nav-scroll mx-auto flex w-max max-w-none flex-nowrap items-center gap-1 rounded-2xl bg-gradient-to-b from-neutral-100 to-neutral-50/95 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ring-1 ring-neutral-200/80 sm:gap-1.5 sm:p-2"
            aria-label="Primary navigation"
          >
            {visibleDockItems.map((item) => {
              const active = activeDock === item.id
              const displayLabel =
                mode === 'sandbox'
                  ? (SANDBOX_DOCK_DISPLAY_LABELS[item.id] ?? item.label)
                  : item.label
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onDockChange(item.id)}
                  title={`${item.navLabel} — ${item.title}`}
                  aria-label={`${item.navLabel}. ${item.title}`}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex h-9 shrink-0 items-center overflow-hidden rounded-xl border text-left outline-none transition-[max-width] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-neutral-900/20 focus-visible:ring-offset-1 sm:h-10 ${
                    active
                      ? 'max-w-[9rem] border-neutral-900 bg-neutral-900 text-white shadow-md ring-1 ring-black/15 sm:max-w-[10rem]'
                      : 'max-w-[9rem] border-neutral-200/90 bg-white text-neutral-800 shadow-sm md:max-w-[2.5rem] md:hover:max-w-[9rem] md:focus-visible:max-w-[9rem] md:hover:border-neutral-300 md:hover:bg-neutral-50'
                  }`}
                >
                  {active ? (
                    <span
                      className="pointer-events-none absolute inset-x-1 top-0.5 h-px rounded-full bg-white/20 sm:inset-x-1.5"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={`relative z-[1] mx-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:mx-0.5 sm:h-8 sm:w-8 ${
                      active ? 'bg-white/15 text-white' : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    <Glyph name={item.icon} className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
                  </span>
                  <span
                    className={`overflow-hidden whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em] transition-[max-width,opacity,padding] duration-200 ease-out sm:text-[11px] ${
                      active
                        ? 'max-w-[7rem] pr-1.5 text-white opacity-100 sm:max-w-[7.5rem] sm:pr-2'
                        : 'max-w-[7rem] pr-1.5 text-neutral-900 opacity-100 md:max-w-0 md:pr-0 md:opacity-0 md:group-hover:max-w-[7rem] md:group-hover:pr-1.5 md:group-hover:opacity-100 md:group-focus-visible:max-w-[7rem] md:group-focus-visible:pr-1.5 md:group-focus-visible:opacity-100'
                    }`}
                  >
                    {displayLabel}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Column 3 — utilities (solid background so dock never paints under) */}
        <div className="relative z-20 flex shrink-0 items-center justify-end gap-1.5 bg-white/95 pl-1.5 backdrop-blur-sm sm:gap-2 sm:pl-2 lg:gap-2.5 lg:pl-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAlertsOpen((o) => !o)}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-700 shadow-sm ring-1 ring-neutral-200/80 transition hover:bg-neutral-50 hover:ring-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:h-11 sm:w-11 ${
                alertsOpen ? 'bg-neutral-100 ring-neutral-300' : 'bg-white'
              }`}
              aria-label={`Notifications and alerts, ${alertCount} in inbox`}
              aria-expanded={alertsOpen}
            >
              <Glyph name="bell" className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
              {alertCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white shadow-sm ring-2 ring-white">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              ) : null}
            </button>

            {alertsOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-[55] cursor-default bg-black/[0.12] backdrop-blur-[2px] transition-opacity"
                  aria-label="Close alerts"
                  onClick={() => setAlertsOpen(false)}
                />
                <div className="absolute right-0 top-full z-[60] mt-2 w-[min(calc(100vw-1.5rem),24rem)] origin-top-right animate-[alerts-pop_0.18s_ease-out]">
                  <AlertsDropdownPanel
                    title="Alerts"
                    subtitle="Highest priority first — dismiss when triaged."
                    activeCount={alertCount}
                  >
                    {visibleAlerts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/12 bg-white/90 py-12 px-5 text-center">
                        <p className="text-[15px] font-medium text-[#475569]">You&apos;re caught up</p>
                        <p className="max-w-[16rem] text-[13px] leading-relaxed text-[#94a3b8]">
                          New payout and ambiguity signals will show up here.
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-2.5">
                        {visibleAlerts.map((a) => (
                          <InsightAlertListRow
                            key={a.id}
                            alert={a}
                            onDismiss={() => setDismissed((s) => new Set(s).add(a.id))}
                          />
                        ))}
                      </ul>
                    )}
                  </AlertsDropdownPanel>
                </div>
              </>
            ) : null}
          </div>

          {searchOpen ? (
            <div
              ref={searchContainerRef}
              className="hidden h-10 w-[11rem] shrink-0 items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-3 shadow-md transition sm:flex sm:h-11 sm:w-[13rem] lg:w-[16rem] xl:w-[18rem]"
            >
              <Glyph name="search" className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <label htmlFor="dock-nav-search" className="sr-only">
                Search client or payout ID
              </label>
              <input
                ref={searchRef}
                id="dock-nav-search"
                type="search"
                name="dock-nav-search"
                autoComplete="off"
                placeholder="Search…"
                value={search}
                onBlur={(e) => {
                  const nextFocus = e.relatedTarget instanceof Node ? e.relatedTarget : null
                  if (!searchContainerRef.current?.contains(nextFocus)) {
                    closeSearch()
                  }
                }}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-medium leading-normal text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400 sm:text-[15px]"
              />
              <kbd
                className="hidden shrink-0 rounded-md border border-neutral-200/90 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-400 shadow-sm xl:inline-block"
                title="Focus search"
              >
                ⌘K
              </kbd>
            </div>
          ) : (
            <button
              type="button"
              onClick={openSearch}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:ring-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:flex sm:h-11 sm:w-11"
              aria-label="Open search"
              title="Search"
            >
              <Glyph name="search" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </button>
          )}

          <label htmlFor="dock-nav-desk" className="sr-only">
            Desk role
          </label>
          <select
            id="dock-nav-desk"
            value={desk}
            onChange={(e) => setDesk(e.target.value as (typeof DESK_ROLES)[number])}
            className="hidden h-10 max-w-[9.5rem] shrink-0 cursor-pointer truncate rounded-xl border border-neutral-200/90 bg-white px-2 text-[13px] font-semibold text-neutral-900 shadow-sm outline-none transition hover:bg-neutral-50 hover:shadow focus-visible:ring-2 focus-visible:ring-neutral-300 sm:inline-block sm:h-11 sm:max-w-[11rem] sm:px-2.5 sm:text-[14px]"
          >
            {DESK_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <div className="hidden shrink-0 flex-col items-end justify-center leading-tight lg:flex">
            <span className="text-[12px] font-semibold text-neutral-900">Workspace</span>
            <span className="mt-0.5 max-w-[7rem] truncate text-[11px] font-medium text-neutral-500">{desk}</span>
          </div>
          <AccountMenuButton deskRole={desk} />
        </div>
      </div>
    </header>
  )
}
