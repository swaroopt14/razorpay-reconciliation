'use client'

import { useMemo } from 'react'

import { ZordLogo } from '@/components/ZordLogo'
import { landingHeroMockData as M } from '@/components/landing-final/landingHeroMockData'
import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import { PaymentTrendPanel } from '@/features/payout-command/command-center/PaymentTrendPanel'
import { PAYMENT_COMMAND_CENTER } from '@/features/payout-command/command-center/paymentCommandCopy'
import { HeroMetricWithSuperPercent } from '@/features/payout-command/homeDashboardTypography'
import {
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_CENTERED,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
  PAYOUT_CONSOLE_CARD_CLASS,
} from '@/features/payout-command/command-center/homeCommandCenterTokens'
import { Glyph } from '@/features/payout-command/shared'
import {
  CONNECTORS_DOCK_TEMPORARILY_HIDDEN,
  dockItems,
} from '@/services/payout-command/model'

const TEAM_AVATARS = [
  { initial: 'A', bg: '#d8e6ff' },
  { initial: 'F', bg: '#dbf7dd' },
  { initial: 'E', bg: '#edd8f4' },
] as const

const homeDock = dockItems.find((item) => item.id === 'home')!

const liveDockItems = dockItems.filter(
  (item) =>
    item.id !== 'sandbox' &&
    item.id !== 'billing' &&
    !(CONNECTORS_DOCK_TEMPORARILY_HIDDEN && item.id === 'connectors'),
)

function LandingHeroDockNav() {
  return (
    <header className="border-b border-black/10 bg-white">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <ZordLogo size="sm" variant="light" fitToHeight className="!w-auto max-w-[7.5rem] sm:max-w-[8.5rem]" />
          <span className="hidden rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-700 sm:inline">
            Live
          </span>
        </div>

        <div className="min-w-0 overflow-x-auto py-0.5 [scrollbar-width:thin]">
          <nav
            className="flex w-max flex-nowrap items-center gap-1 rounded-2xl bg-gradient-to-b from-neutral-100 to-neutral-50/95 p-1 ring-1 ring-neutral-200/80"
            aria-label="Primary navigation preview"
          >
            {liveDockItems.map((item) => {
              const active = item.id === M.activeDock
              return (
                <span
                  key={item.id}
                  title={`${item.navLabel} — ${item.title}`}
                  className={`flex h-8 shrink-0 items-center overflow-hidden rounded-xl border sm:h-9 ${
                    active
                      ? 'max-w-[7.5rem] border-neutral-900 bg-neutral-900 text-white shadow-md sm:max-w-[8.5rem]'
                      : 'max-w-[2.25rem] border-neutral-200/90 bg-white text-neutral-800 shadow-sm'
                  }`}
                >
                  <span
                    className={`mx-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg sm:h-7 sm:w-7 ${
                      active ? 'bg-white/15 text-white' : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    <Glyph name={item.icon} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </span>
                  {active ? (
                    <span className="overflow-hidden whitespace-nowrap pr-1.5 text-[9px] font-bold uppercase tracking-[0.12em] sm:pr-2 sm:text-[10px]">
                      {item.label}
                    </span>
                  ) : null}
                </span>
              )
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-700 shadow-sm">
            <Glyph name="bell" className="h-4 w-4" />
          </span>
          <span className="hidden h-8 w-8 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-700 shadow-sm sm:flex">
            <Glyph name="search" className="h-4 w-4" />
          </span>
        </div>
      </div>
    </header>
  )
}

function LandingHeroPageHeader() {
  return (
    <div className="border-b border-black/8 bg-white px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            {homeDock.label}
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-[-0.03em] text-neutral-950 sm:text-xl">
            {homeDock.title}
          </h3>
          <p className={`mt-1 max-w-2xl text-[12px] leading-relaxed ${HOME_BODY_IMPERIAL_SM}`}>
            {homeDock.summary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#111111]">
            <Glyph name="refresh" className="h-3.5 w-3.5" />
          </span>
          <span className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#111111] bg-[#111111] px-2.5 text-[11px] font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
            Ask about this data
          </span>
          <span className="flex h-8 items-center rounded-[8px] border border-[#111111] bg-white px-2.5 text-[11px] font-semibold text-[#111111]">
            View Batches
          </span>
          <span className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#111111] px-2.5 text-[11px] font-semibold text-white">
            <span className="flex -space-x-1">
              {TEAM_AVATARS.map(({ initial, bg }) => (
                <span
                  key={initial}
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-white/60 text-[8px] font-semibold text-[#111111]"
                  style={{ background: bg }}
                >
                  {initial}
                </span>
              ))}
            </span>
            Export / Share
          </span>
        </div>
      </div>
    </div>
  )
}

export function LandingHeroDashboardPreview() {
  const chartSeries = useMemo(() => [...M.chartSeries], [])

  return (
    <div
      className={`relative ${PAYOUT_CONSOLE_CARD_CLASS} overflow-hidden rounded-[1.15rem]`}
      role="img"
      aria-label="Product preview of Zord Payment Command Center with illustrative data"
    >
      <LandingHeroDockNav />
      <LandingHeroPageHeader />

      <div className="bg-white px-3 pt-3 text-center sm:px-4">
        <div className="mx-auto mb-2 flex w-fit rounded-full border border-slate-200 bg-slate-50 p-0.5">
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#000000] shadow-sm ring-1 ring-black/5">
            Intended
          </span>
          <span className="rounded-full px-3 py-1 text-[11px] font-medium text-slate-500">Bank-Confirmed</span>
        </div>
        <div className="text-[1.75rem] font-extrabold leading-none tabular-nums text-[#000000] sm:text-[2.1rem]">
          {M.heroMetric.value}
        </div>
        <div className="mt-1.5 text-[13px] font-bold text-[#000000]">{M.heroMetric.label}</div>
        <p className={`mt-1 text-[11px] ${HOME_BODY_IMPERIAL_CENTERED}`}>{M.heroMetric.sub}</p>
        <p className={`mt-1 hidden text-[10px] sm:block ${HOME_BODY_IMPERIAL_CENTERED}`}>
          {PAYMENT_COMMAND_CENTER.intendedHelper}
        </p>
      </div>

      <div className="flex min-h-[40px] items-stretch border-y border-[#e8e8e5] bg-white">
        <div
          className={`flex w-1/2 min-w-0 items-center border-r border-[#ecece9] px-3 py-2 text-left text-[12px] font-medium sm:px-4 ${HOME_TITLE_BLACK}`}
        >
          <span className="truncate">{M.timeframeLabel}</span>
        </div>
        <div className="flex w-1/2 min-w-0 items-center justify-end gap-1.5 px-3 py-2 sm:px-4">
          {M.years.map((year) => (
            <span
              key={year}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                year === M.selectedYear
                  ? 'bg-[#000000] text-white shadow-sm ring-1 ring-black/35'
                  : `border border-[#E5E5E5] bg-white ${HOME_TITLE_BLACK}`
              }`}
            >
              {year}
            </span>
          ))}
        </div>
      </div>

      <div className="border-b border-[#e5e5e5] bg-white px-2 py-2 sm:px-3">
        <div className="overflow-hidden" style={{ height: '10.5rem' }}>
          <div style={{ transform: 'scale(0.48)', transformOrigin: 'top left', width: '208%' }}>
            <PaymentTrendPanel
              className="w-full"
              series={chartSeries}
              loading={false}
              period={M.chartPeriod}
              onPeriodChange={() => {}}
            />
          </div>
        </div>
      </div>

      <section className="space-y-4 bg-[#F8F9FA] px-3 py-4 sm:px-4">
        <div className="rounded-xl border border-[#EAEAEA] bg-white px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.03)]">
          <h4 className="inline-flex items-center rounded-full bg-[#1A1A1A] px-2.5 py-0.5 text-[10px] font-medium text-white">
            {M.commandCenter.sectionTitle}
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{M.commandCenter.sectionSubtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
          {M.kpiCards.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.03)]"
            >
              <h5 className="text-xs font-medium uppercase tracking-wider text-gray-500">{card.title}</h5>
              <p className="mt-3 text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-[1.75rem]">
                <HeroMetricWithSuperPercent text={card.value} />
              </p>
              <p className="mt-2 text-sm leading-snug text-slate-500">{card.sub}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="border-t border-[#ecece9] bg-[#f4f4f1] px-3 py-2 text-center">
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#9CA3AF]">
          {landingHomeCopy.productPreviewLabel}
        </p>
      </div>
    </div>
  )
}
