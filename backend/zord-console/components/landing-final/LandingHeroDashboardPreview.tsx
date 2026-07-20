'use client'

import { useCallback, useMemo, useState, type MouseEvent } from 'react'

import { buildMockTrendSeries, landingHeroMockData as M } from '@/components/landing-final/landingHeroMockData'
import type { LandingHeroPreviewPageMock } from '@/components/landing-final/landingHeroMockData'
import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import {
  AmbiguityPreviewSurface,
  AskPreviewSurface,
  BatchCommandCenterPreviewSurface,
  EvidencePreviewSurface,
  HomePreviewSurface,
  IntentJournalPreviewSurface,
  LeakagePreviewSurface,
  MonitoringPreviewSurface,
  SettlementJournalPreviewSurface,
  SupportPreviewSurface,
  VerificationPreviewSurface,
} from '@/components/landing-final/landingHeroPreviewSurfaces'
import { EnvironmentProvider } from '@/services/auth/EnvironmentProvider'
import {
  HOME_TITLE_BLACK,
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '@/features/payout-command/command-center/homeCommandCenterTokens'
import { PayoutConsoleNavStack } from '@/features/payout-command/layout/PayoutConsoleNavStack'
import { PageHeader } from '@/features/payout-command/layout/PageHeader'
import {
  PayoutPageActionsProvider,
  useRegisterPayoutPageActions,
} from '@/features/payout-command/layout/PayoutPageActionsContext'
import type { OpsInsightAlert } from '@/features/payout-command/command-center/types'
import {
  CONNECTORS_DOCK_TEMPORARILY_HIDDEN,
  DASHBOARD_FONT_STACK,
  dockItems,
  type DockId,
} from '@/services/payout-command/model'
import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'

const homeDock = dockItems.find((item) => item.id === 'home')!
const liveDockItems = dockItems.filter(
  (item) =>
    item.id !== 'sandbox' &&
    item.id !== 'billing' &&
    !(CONNECTORS_DOCK_TEMPORARILY_HIDDEN && item.id === 'connectors'),
)
type PreviewMetric = 'intended' | 'confirmed'
type PreviewPanel = 'ask' | 'export' | 'alerts' | 'search' | 'integrations' | null
type PreviewYear = keyof typeof M.metricsByYear

const PREVIEW_ALERTS: readonly OpsInsightAlert[] = [
  {
    id: 'landing-preview-gap',
    title: 'Payment gap increased',
    body: 'Cashfree unmatched value is above the mock review threshold.',
    createdAt: '2 min ago',
    tone: 'warning',
  },
  {
    id: 'landing-preview-proof',
    title: 'Evidence pack ready',
    body: 'Finance close pack is ready for export in the preview.',
    createdAt: '7 min ago',
    tone: 'ok',
  },
]

const PREVIEW_INTEGRATIONS = [
  { name: 'Cashfree', status: 'Connected', detail: 'Settlement file sync · last 2 min ago' },
  { name: 'Razorpay', status: 'Connected', detail: 'Payout webhooks · healthy' },
  { name: 'HDFC Bank', status: 'Needs attention', detail: 'Statement upload pending for BATCH-1048' },
] as const

const PERIOD_BUCKETS: Record<DisbursementTrendRange, number> = {
  week: 7,
  month: 30,
  quarter: 12,
  year: 12,
}

const YEAR_SEED: Record<PreviewYear, number> = {
  '2026': 0,
  '2027': 1,
  '2028': 2,
}

function LandingHeroDemoPanel({
  panel,
  profile,
  onClose,
}: {
  panel: PreviewPanel
  profile: LandingHeroPreviewPageMock
  onClose: () => void
}) {
  if (!panel) return null

  if (panel === 'integrations') {
    return (
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Integrations</p>
            <h4 className={`mt-1 text-sm font-bold ${HOME_TITLE_BLACK}`}>Connected rails (preview)</h4>
            <p className="mt-1 text-[11px] text-slate-500">
              Mock PSP, bank, and API connections shown inside this product preview.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {PREVIEW_INTEGRATIONS.map((item) => (
            <div key={item.name} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
              <div>
                <p className={`text-[12px] font-semibold ${HOME_TITLE_BLACK}`}>{item.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{item.detail}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  item.status === 'Connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                }`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const content = profile.panels[panel]
  if (!content) return null

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold text-neutral-950">{content.title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{content.body}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function MockPreviewActions({
  onRefresh,
  onExport,
}: {
  onRefresh: () => void
  onExport: () => void
}) {
  useRegisterPayoutPageActions({
    refresh: onRefresh,
    exportShare: onExport,
    refreshing: false,
    exportDisabled: false,
  })
  return null
}

function LandingHeroMockSurface(props: {
  activeDockId: DockId
  metric: PreviewMetric
  setMetric: (metric: PreviewMetric) => void
  profile: LandingHeroPreviewPageMock
  selectedMetric: { value: string; sub: string }
  period: DisbursementTrendRange
  setPeriod: (period: DisbursementTrendRange) => void
  year: PreviewYear
  setYear: (year: PreviewYear) => void
  chartSeries: ReturnType<typeof buildMockTrendSeries>
}) {
  if (props.activeDockId === 'workspace') return <AskPreviewSurface />
  if (props.activeDockId === 'leakage') return <LeakagePreviewSurface />
  if (props.activeDockId === 'ambiguity') return <AmbiguityPreviewSurface />
  if (props.activeDockId === 'verification') return <VerificationPreviewSurface />
  if (props.activeDockId === 'monitoring') return <MonitoringPreviewSurface />
  if (props.activeDockId === 'grid') return <IntentJournalPreviewSurface />
  if (props.activeDockId === 'settlement') return <SettlementJournalPreviewSurface />
  if (props.activeDockId === 'proof') return <EvidencePreviewSurface />
  if (props.activeDockId === 'support') return <SupportPreviewSurface />
  return (
    <HomePreviewSurface
      metric={props.metric}
      setMetric={props.setMetric}
      profile={props.profile}
      selectedMetric={props.selectedMetric}
      period={props.period}
      setPeriod={props.setPeriod}
      year={props.year}
      setYear={props.setYear}
      chartSeries={props.chartSeries}
    />
  )
}

function resolvePreviewHref(href: string): { dock?: DockId; panel?: Exclude<PreviewPanel, null>; batchCenter?: boolean } | null {
  const path = href.split('?')[0] ?? href
  const query = href.includes('?') ? new URLSearchParams(href.split('?')[1]) : null
  const dock = query?.get('dock') as DockId | null

  if (path.includes('batch-command-center') || path.includes('/batches')) {
    return { batchCenter: true }
  }
  if (path.includes('/settings/api-keys') || path.includes('/connectors')) {
    return { panel: 'integrations' }
  }
  if (dock && liveDockItems.some((item) => item.id === dock)) {
    return { dock }
  }
  if (path.startsWith('/payout-command-view') || path.startsWith('/sandbox')) {
    return { batchCenter: true }
  }
  return null
}

export function LandingHeroDashboardPreview() {
  const [activeDockId, setActiveDockId] = useState<DockId>(M.activeDock)
  const [showBatchCommandCenter, setShowBatchCommandCenter] = useState(false)
  const [metric, setMetric] = useState<PreviewMetric>('intended')
  const [year, setYear] = useState<PreviewYear>(M.selectedYear)
  const [period, setPeriod] = useState<DisbursementTrendRange>(M.chartPeriod)
  const [activePanel, setActivePanel] = useState<PreviewPanel>(null)
  const [refreshSeed, setRefreshSeed] = useState(0)
  const activeDock = liveDockItems.find((item) => item.id === activeDockId) ?? homeDock
  const pageProfile = M.pageProfiles[activeDockId as keyof typeof M.pageProfiles] ?? M.pageProfiles.home
  const selectedMetric = pageProfile.metrics[metric].values[year]
  const chartSeries = useMemo(
    () => buildMockTrendSeries(pageProfile.chartSeed + YEAR_SEED[year] + refreshSeed, PERIOD_BUCKETS[period]),
    [pageProfile.chartSeed, period, refreshSeed, year],
  )

  const openBatchCommandCenter = useCallback(() => {
    setActivePanel(null)
    setShowBatchCommandCenter(true)
  }, [])

  const closeBatchCommandCenter = useCallback(() => {
    setShowBatchCommandCenter(false)
  }, [])

  const openIntegrationsPreview = useCallback(() => {
    setShowBatchCommandCenter(false)
    setActivePanel('integrations')
  }, [])

  /** Keep landing mockups on-page — never navigate to live payout routes (404 when logged out). */
  const handlePreviewNavigation = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    const anchor = target?.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('http')) return
    if (!(href.startsWith('/') || href.startsWith('./'))) return

    const mapped = resolvePreviewHref(href)
    if (!mapped) return

    event.preventDefault()
    event.stopPropagation()
    if (mapped.batchCenter) {
      setShowBatchCommandCenter(true)
      setActivePanel(null)
      return
    }
    setShowBatchCommandCenter(false)
    // Landing preview stays on Today — dock links (Ask, Leakage, etc.) do not switch pages.
    if (mapped.dock && mapped.dock !== 'home') return
    if (mapped.dock) setActiveDockId(mapped.dock)
    if (mapped.panel) setActivePanel(mapped.panel)
    else if (mapped.dock) setActivePanel(null)
  }, [])

  return (
    <EnvironmentProvider routeMode="live">
      <section
        className={`payout-command-console relative ${PAYOUT_PAGE_BG_CLASS}`}
        style={{ fontFamily: DASHBOARD_FONT_STACK }}
        aria-label="Product preview of Zord Payment Command Center with illustrative data"
        onClickCapture={handlePreviewNavigation}
      >
        <div className={`${PAYOUT_CONSOLE_CARD_CLASS} overflow-hidden rounded-[1.15rem]`}>
          <PayoutConsoleNavStack
            activeDock={showBatchCommandCenter ? 'grid' : 'home'}
            onDockChange={() => {
              // Keep the dock visible for product preview, but do not navigate away from Today.
              setShowBatchCommandCenter(false)
              setActiveDockId('home')
              setActivePanel(null)
            }}
            onActivateClick={() => setActivePanel('export')}
            alerts={PREVIEW_ALERTS}
          />

          <section
            className={`relative ${
              showBatchCommandCenter
                ? 'p-3 sm:p-4'
                : activeDockId === 'workspace'
                  ? 'px-3 py-3 sm:px-4 sm:py-4 lg:px-5'
                  : 'p-4 sm:p-5 lg:p-6'
            }`}
          >
            <PayoutPageActionsProvider>
              <MockPreviewActions
                onRefresh={() => setRefreshSeed((value) => (value + 1) % 4)}
                onExport={() => {
                  setShowBatchCommandCenter(false)
                  setActivePanel('export')
                }}
              />
              {showBatchCommandCenter ? (
                <BatchCommandCenterPreviewSurface onBack={closeBatchCommandCenter} />
              ) : (
                <>
                  <PageHeader
                    pageEyebrow={activeDock.label === activeDock.title ? undefined : activeDock.label}
                    pageTitle={activeDock.title}
                    pageSubtitle={activeDock.summary}
                    onAskZordToggle={() => setActivePanel((panel) => (panel === 'ask' ? null : 'ask'))}
                    hideAskZordButton={activeDockId === 'workspace'}
                    onViewBatches={openBatchCommandCenter}
                    onIntegrationsClick={openIntegrationsPreview}
                  />
                  <LandingHeroDemoPanel
                    panel={activePanel}
                    profile={pageProfile}
                    onClose={() => setActivePanel(null)}
                  />
                  <LandingHeroMockSurface
                    activeDockId={activeDockId}
                    metric={metric}
                    setMetric={setMetric}
                    profile={pageProfile}
                    selectedMetric={selectedMetric}
                    period={period}
                    setPeriod={setPeriod}
                    year={year}
                    setYear={setYear}
                    chartSeries={chartSeries}
                  />
                </>
              )}
            </PayoutPageActionsProvider>
          </section>

          <div className="border-t border-[#ecece9] bg-[#f4f4f1] px-3 py-2 text-center">
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#9CA3AF]">
              {landingHomeCopy.productPreviewLabel}
            </p>
          </div>
        </div>
      </section>
    </EnvironmentProvider>
  )
}
