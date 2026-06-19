'use client'

import Link from 'next/link'
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clampPage } from '../_lib/clampPage'
import { EntityLogo } from '../entity-logo'
import {
  BankingInformationTokensBlock,
} from '../intent-journal/IntentDrawerSections'
import type { IntentDetail } from '@/services/payout-command/intent-journal-types'
import { getProdIntentDetail } from '@/services/payout-command/prod-api/getProdIntentDetail'
import { buildLiveIntentDetailFromRowAndApi } from '@/services/payout-command/liveJournalIntentDetail'
import { formatJournalMoney } from '../intent-journal/formatJournalMoney'
import { JournalBatchSelectionProvider } from '../intent-journal/context/JournalBatchSelectionContext'
import { IntentJournalHeroBanner } from '../intent-journal/components/IntentJournalHeroBanner'
import { IntentJournalBatchSidebar } from '../intent-journal/components/IntentJournalBatchSidebar'
import {
  IntentJournalActivityPanel,
  type IntentJournalActivityViewModel,
} from '../intent-journal/components/IntentJournalActivityPanel'
import {
  SIDEBAR_PAGE_SIZE,
  resolveBatchHealthStatus,
  type BatchFilter,
  type BatchRecord,
} from '../intent-journal/intentJournalSidebarUtils'
import { useJournalSidebarBatches } from '../intent-journal/hooks/useJournalSidebarBatches'
import { useJournalIntentRows } from '../intent-journal/hooks/useJournalIntentRows'
import { useJournalFailureRows } from '../intent-journal/hooks/useJournalFailureRows'
import { useJournalBatchMetrics } from '../intent-journal/hooks/useJournalBatchMetrics'
import { downloadCsv, failuresToCsv, intentsToCsv, downloadFailuresCsv } from '../intent-journal/journalExport'
import { LIVE_JOURNAL_POLL_MS } from '../intent-journal/journalConstants'
import type { PaymentIntentRecord } from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { ApiProdIntentDetailPayload } from '@/services/payout-command/prod-api/prodApiTypes'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import { markSandboxSetupStep, openSandboxSetupPanel } from '@/services/payout-command/sandbox-setup-guide'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { dockItems } from '@/services/payout-command/model'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_SM,
  HOME_INSIGHT_PROSE,
  HOME_INSIGHT_PROSE_STRONG,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { CommandCenterCardGlow } from '../command-center/CommandCenterCardGlow'
import { JOURNAL_PAGE_BG } from '../journal/JournalCommandCenterPrimitives'
import { JOURNAL_DM_SANS } from '../journal/journalFonts'
import { IntentEngineDetailPanel } from '../intent-journal/IntentEngineDetailPanel'
const JOURNAL_FILTER_LABEL =
  'mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]'

/** Cool blue-grey shell (replaces warm beige #f4f4f1 family). */
const JOURNAL_PANEL_BG = 'bg-[#f1f5f9]'
const JOURNAL_SUBTLE_BG = 'bg-slate-50'
const JOURNAL_BORDER = 'border-slate-200/90'

type TabKey = 'transactions' | 'failures'
type IntentStatus = 'Ready to Process' | 'Confirmed' | 'Pending' | 'Needs Review' | 'In Progress'
type IntentMatch = 'Matched' | 'Likely Matched' | 'Awaiting' | 'Mismatch' | 'Not Found'

type IntentRow = {
  batchId: string
  zordId: string
  requestId: string
  sourceRowNum?: number | null
  reference: string
  clientBatchRef?: string
  beneficiaryName?: string | null
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH'
  rail?: string
  status: IntentStatus
  match: IntentMatch
  lastUpdated: string
  paymentPartner: string
  bank: string
  paymentMethodDetail: string
  engineStatus?: string
  currency?: string
  tenantId: string
  intendedExecutionAt: string
  provider: string
  confidenceScore: number | null
  confidenceLabel: string
  infoSummary: string
  rawIntent?: PaymentIntentRecord
}

type FailureRow = {
  batchId: string
  requestId: string
  sourceRowNum?: number | null
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH'
  paymentPartner: string
  /** Connector column subtitle — stage / reason from DLQ payload. */
  connectorSubtitle: string
  failureReason: string
  failureStage: 'Validation' | 'Dispatch' | 'Processing' | 'Settlement'
  lastUpdated: string
  action: 'Retry' | 'Fix Details' | 'Investigate' | 'Escalate' | 'Fix Mandate'
}

type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'ytd'

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
]

/** Quick presets (sandbox / layout); live table does not yet filter by these ranges. */
const OVERVIEW_QUICK_RANGES: { label: string; value: DateRangePreset }[] = [
  { label: '1W', value: '7d' },
  { label: '1M', value: '30d' },
  { label: '3W', value: '90d' },
  { label: 'YTD', value: 'ytd' },
  { label: 'Total', value: 'all' },
]

const CONNECTOR_OPTIONS: Array<'All' | string> = ['All', 'Razorpay', 'Cashfree', 'PayU']

const DISPATCH_OPTIONS: Array<'All' | IntentRow['method']> = ['All', 'Bank Transfer', 'LSM', 'NACH']

const AMOUNT_RANGE_OPTIONS = [
  'All',
  'Under ₹10,000',
  '₹10,000 – ₹1,00,000',
  'Over ₹1,00,000',
] as const
type AmountRangeFilter = (typeof AMOUNT_RANGE_OPTIONS)[number]

function intentInDateRange(lastUpdated: string, preset: DateRangePreset): boolean {
  if (preset === 'all') return true
  const parsed = Date.parse(lastUpdated)
  if (!Number.isFinite(parsed)) return true
  const observed = new Date(parsed)
  const now = new Date()
  const start = new Date(now)
  if (preset === '7d') start.setDate(now.getDate() - 7)
  else if (preset === '30d') start.setDate(now.getDate() - 30)
  else if (preset === '90d') start.setDate(now.getDate() - 90)
  else if (preset === 'ytd') start.setMonth(0, 1)
  start.setHours(0, 0, 0, 0)
  return observed >= start
}

function matchesIntentAmountRange(amount: number, range: AmountRangeFilter): boolean {
  if (range === 'All') return true
  if (range === 'Under ₹10,000') return amount < 10_000
  if (range === '₹10,000 – ₹1,00,000') return amount >= 10_000 && amount <= 100_000
  return amount > 100_000
}

const ROW_SIZE_OPTIONS = [25, 50, 100, 200] as const

const JOURNAL_NO_BATCHES_DISMISS_KEY = 'zord:intent-journal-no-batches-notice'
const JOURNAL_SANDBOX_SETUP_DISMISS_KEY = 'zord:intent-journal-sandbox-setup-notice'

function journalNoticeDismissed(storageKey: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

function dismissJournalNotice(storageKey: string) {
  try {
    sessionStorage.setItem(storageKey, '1')
  } catch {
    /* ignore */
  }
}

function reopenJournalNotice(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    /* ignore */
  }
}

/** Stripe-style dismissible notice — black shell + green Recommended chip (home / dispatch parity). */
function JournalRecommendedBlackCard({
  eyebrow,
  title,
  body,
  bodyBold = false,
  onDismiss,
  children,
}: {
  eyebrow?: string
  title: string
  body: ReactNode
  /** White bold body copy (sandbox setup card). */
  bodyBold?: boolean
  onDismiss: () => void
  children?: ReactNode
}) {
  return (
    <aside className="mb-4 overflow-hidden rounded-xl border border-white/12 bg-[#0A0A0A] shadow-[0_14px_44px_rgba(0,0,0,0.32)] ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#000000] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white">
            Recommended
          </span>
          {eyebrow ? <span className="text-[12px] font-medium text-white/50">{eyebrow}</span> : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[20px] font-light leading-none text-white/55 transition hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="px-4 py-3.5">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{title}</h3>
        <div
          className={`mt-1.5 text-[13px] leading-relaxed ${
            bodyBold ? 'font-bold text-white' : 'font-medium text-white/72'
          }`}
        >
          {body}
        </div>
        {children ? <div className="mt-4 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </aside>
  )
}

function scoreDashArray(score: number) {
  const bounded = Math.max(8, Math.min(95, score))
  return `${Math.round((bounded / 100) * 53)} 53`
}

function KpiSpark({ tone }: { tone: string }) {
  const heights = [36, 58, 44, 72, 52, 88, 61, 94, 55, 78]
  return (
    <div className="flex h-7 max-w-[120px] flex-1 items-end justify-end gap-px" aria-hidden>
      {heights.map((h, i) => (
        <span key={i} className={`w-1 max-w-[3px] rounded-sm ${tone}`} style={{ height: `${h}%`, opacity: 0.35 + (i % 3) * 0.15 }} />
      ))}
    </div>
  )
}

type KpiVariant = 'total' | 'confirmed' | 'pending' | 'attention'

function KpiGlyph({ variant }: { variant: KpiVariant }) {
  const common = 'h-5 w-5'
  if (variant === 'total')
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  if (variant === 'confirmed')
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  if (variant === 'pending')
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  return (
    <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function intentHaystack(row: IntentRow) {
  return [
    row.batchId,
    row.requestId,
    row.reference,
    row.tenantId,
    row.provider,
    row.currency ?? '',
    row.intendedExecutionAt,
    row.confidenceLabel,
    row.infoSummary,
    row.method,
    row.status,
    row.match,
    row.paymentPartner,
    row.bank,
    row.paymentMethodDetail,
    row.engineStatus ?? '',
    row.lastUpdated,
    String(row.amount),
  ]
    .join(' ')
    .toLowerCase()
}

function failureHaystack(row: FailureRow) {
  return [
    row.batchId,
    row.requestId,
    row.reference,
    row.method,
    row.paymentPartner,
    row.connectorSubtitle,
    row.failureReason,
    row.failureStage,
    row.action,
    row.lastUpdated,
    String(row.amount),
  ]
    .join(' ')
    .toLowerCase()
}

export function IntentJournalSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const { mode } = useEnvironment()
  const batchCommandCenterHref = payoutBatchCommandCenterHref(mode === 'sandbox')
  /** Same `/api/prod/intelligence/*` + `/api/prod/intents*` + DLQ polling as live — sandbox is not local-only. */
  const journalUsesBackendFeed = mode === 'live' || mode === 'sandbox'

  const [selectedBatchId, setSelectedBatchId] = useState(() => initialBatchId?.trim() ?? '')

  const {
    tenantId: liveTenantId,
    tenantReady,
    batches: liveBatchList,
    feedLoaded: liveFeedLoaded,
    feedError,
    syncAt: liveSyncAt,
    refresh: refreshSidebar,
  } = useJournalSidebarBatches({
    enabled: journalUsesBackendFeed,
    initialBatchId: initialBatchId?.trim() || undefined,
    selectedBatchId,
    setSelectedBatchId,
  })

  const intentFeed = useJournalIntentRows(
    selectedBatchId,
    journalUsesBackendFeed && tenantReady,
    liveTenantId,
  )
  const failureFeed = useJournalFailureRows(selectedBatchId, journalUsesBackendFeed && tenantReady)
  const { batch: selectedMetricsBatch } = useJournalBatchMetrics(
    selectedBatchId,
    journalUsesBackendFeed && tenantReady,
  )

  const liveIntentRows = intentFeed.rows
  const liveFailureRows = failureFeed.rows
  const intentPagination = intentFeed.pagination
  const dlqPagination = failureFeed.pagination
  const liveDetailLoading = intentFeed.loading || failureFeed.loading

  const selectBatch = useCallback((batchId: string) => {
    setSelectedBatchId(batchId)
  }, [])

  const [failureReviewId, setFailureReviewId] = useState<string | null>(null)
  const batches = useMemo(() => {
    if (!journalUsesBackendFeed) return []
    return liveBatchList as BatchRecord[]
  }, [journalUsesBackendFeed, liveBatchList])

  const intents = useMemo(() => {
    if (!journalUsesBackendFeed) return []
    return liveIntentRows as IntentRow[]
  }, [journalUsesBackendFeed, liveIntentRows])

  const failures = useMemo(() => {
    if (!journalUsesBackendFeed) return []
    return liveFailureRows as FailureRow[]
  }, [journalUsesBackendFeed, liveFailureRows])

  const [noBatchesNoticeDismissed, setNoBatchesNoticeDismissed] = useState(false)
  const [sandboxSetupNoticeDismissed, setSandboxSetupNoticeDismissed] = useState(false)

  useEffect(() => {
    setNoBatchesNoticeDismissed(journalNoticeDismissed(JOURNAL_NO_BATCHES_DISMISS_KEY))
    setSandboxSetupNoticeDismissed(journalNoticeDismissed(JOURNAL_SANDBOX_SETUP_DISMISS_KEY))
  }, [])

  useEffect(() => {
    if (mode === 'sandbox' && liveBatchList.length > 0) {
      markSandboxSetupStep('journal')
    }
  }, [mode, liveBatchList.length])

  const [batchFilter, setBatchFilter] = useState<BatchFilter>('All Batches')
  const [sidebarPage, setSidebarPage] = useState(1)
  const [activeTab, setActiveTab] = useState<TabKey>('transactions')

  const [tableSearch, setTableSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRangePreset>('all')
  const [filterBatchId, setFilterBatchId] = useState('')
  const [connectorFilter, setConnectorFilter] = useState<(typeof CONNECTOR_OPTIONS)[number]>('All')
  const [dispatchModeFilter, setDispatchModeFilter] = useState<(typeof DISPATCH_OPTIONS)[number]>('All')
  const [intentStatusFilter, setIntentStatusFilter] = useState<'All' | IntentStatus>('All')
  const [failureStageFilter, setFailureStageFilter] = useState<'All' | FailureRow['failureStage']>('All')
  const [amountRangeFilter, setAmountRangeFilter] = useState<AmountRangeFilter>('All')

  const [rowsPerPage, setRowsPerPage] = useState<(typeof ROW_SIZE_OPTIONS)[number]>(50)
  const [page, setPage] = useState(1)
  const [jumpPage, setJumpPage] = useState('1')
  const [failurePage, setFailurePage] = useState(1)
  const [failureJumpPage, setFailureJumpPage] = useState('1')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null)
  const [liveIntentDrawerApi, setLiveIntentDrawerApi] = useState<ApiProdIntentDetailPayload | null>(null)

  const expandedIdRef = useRef<string | null>(null)
  expandedIdRef.current = expandedId

  useEffect(() => {
    setExpandedId(null)
    setSelectedIntentId(null)
    setLiveIntentDrawerApi(null)
    setFailureReviewId(null)
  }, [selectedBatchId])

  useEffect(() => {
    if (!journalUsesBackendFeed || !tenantReady || !expandedId) {
      setLiveIntentDrawerApi(null)
      return
    }
    let cancelled = false
    const targetId = expandedId
    setLiveIntentDrawerApi(null)
    void getProdIntentDetail(targetId).then((api) => {
      if (cancelled || expandedIdRef.current !== targetId) return
      setLiveIntentDrawerApi(api)
    })
    return () => {
      cancelled = true
    }
  }, [journalUsesBackendFeed, tenantReady, expandedId])

  // Dispatch modal — smart routing on use-case + connector history
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false)
  const [dispatchUseCase, setDispatchUseCase] = useState<UseCase>('salary')
  const [dispatchBanner, setDispatchBanner] = useState<{
    batchId: string
    target: DispatchTarget
    useCase: UseCase
    intents: number
    at: Date
  } | null>(null)

  const sidebarBatchList = useMemo(() => {
    if (!journalUsesBackendFeed) return []
    return liveBatchList
  }, [journalUsesBackendFeed, liveBatchList])

  const failureFeedLoading = failureFeed.loading
  const selectedDlqTotal: number | null = journalUsesBackendFeed
    ? dlqPagination?.total != null && Number.isFinite(dlqPagination.total)
      ? dlqPagination.total
      : failureFeedLoading
        ? null
        : null
    : null
  const selectedEngineIntentTotal: number | null = journalUsesBackendFeed
    ? intentPagination?.total != null && Number.isFinite(intentPagination.total)
      ? intentPagination.total
      : null
    : null

  // Sidebar list filters — intelligence batches from `GET /v1/intelligence/batches`.
  const filteredBatches = useMemo(() => {
    if (batchFilter === 'All Batches') return sidebarBatchList
    if (batchFilter === 'Recent') return sidebarBatchList.slice(0, 10)
    if (batchFilter === 'Needs Attention') {
      return sidebarBatchList.filter((b) => {
        const batchForHealth =
          b.batchId === selectedBatchId && selectedMetricsBatch
            ? selectedMetricsBatch
            : b
        const health = resolveBatchHealthStatus(batchForHealth)
        return health === 'At Risk' || health === 'Critical'
      })
    }
    if (batchFilter === 'High Value') return sidebarBatchList.filter((b) => b.totalValue >= 1_500_000)
    return sidebarBatchList.filter((b) => resolveBatchHealthStatus(b) === 'Stable')
  }, [batchFilter, sidebarBatchList, selectedBatchId, selectedMetricsBatch])

  /** Resolved from intelligence batch list only — no synthetic batch row. */
  const selectedBatch: BatchRecord | null =
    selectedBatchId.trim() === ''
      ? null
      : (filteredBatches.find((b) => b.batchId === selectedBatchId) ??
          batches.find((b) => b.batchId === selectedBatchId) ??
          null)

  useEffect(() => {
    if (!journalUsesBackendFeed || liveDetailLoading || !selectedBatchId.trim()) return
    if ((selectedDlqTotal ?? 0) > 0 && (selectedEngineIntentTotal ?? 0) === 0) {
      setActiveTab('failures')
    }
  }, [
    journalUsesBackendFeed,
    liveDetailLoading,
    selectedBatchId,
    selectedDlqTotal,
    selectedEngineIntentTotal,
  ])

  const sandboxJournalEmpty =
    mode === 'sandbox' && tenantReady && liveFeedLoaded && liveBatchList.length === 0

  const showNoBatchesNotice =
    journalUsesBackendFeed &&
    tenantReady &&
    liveFeedLoaded &&
    liveBatchList.length === 0 &&
    !noBatchesNoticeDismissed &&
    mode !== 'sandbox'

  const showSandboxSetupNotice = sandboxJournalEmpty && !sandboxSetupNoticeDismissed

  const needsAttentionCount = batches.filter((b) => {
    const batchForHealth =
      b.batchId === selectedBatchId && selectedMetricsBatch ? selectedMetricsBatch : b
    const health = resolveBatchHealthStatus(batchForHealth)
    return health === 'At Risk' || health === 'Critical'
  }).length
  const sidebarTotalPages = Math.max(1, Math.ceil(filteredBatches.length / SIDEBAR_PAGE_SIZE))
  const safeSidebarPage = Math.min(sidebarPage, sidebarTotalPages)
  const sidebarPageRows = filteredBatches.slice((safeSidebarPage - 1) * SIDEBAR_PAGE_SIZE, safeSidebarPage * SIDEBAR_PAGE_SIZE)

  const filteredIntents = useMemo(() => {
    const sidebarBid = journalUsesBackendFeed && selectedBatch ? selectedBatch.batchId : ''
    const scopeBatch = sidebarBid !== ''
    return intents.filter((row) => {
      const q = tableSearch.trim().toLowerCase()
      const bySearch = !q || intentHaystack(row).includes(q)
      const bySidebarBatch = !scopeBatch || row.batchId === sidebarBid
      const byBatchFilter =
        !filterBatchId.trim() || row.batchId.toLowerCase().includes(filterBatchId.trim().toLowerCase())
      const byConnector = connectorFilter === 'All' || row.paymentPartner === connectorFilter
      const byDispatch = dispatchModeFilter === 'All' || row.method === dispatchModeFilter
      const byStatus = intentStatusFilter === 'All' || row.status === intentStatusFilter
      const byDate = intentInDateRange(row.lastUpdated, dateRange)
      const byAmount = matchesIntentAmountRange(row.amount, amountRangeFilter)
      return bySearch && bySidebarBatch && byBatchFilter && byConnector && byDispatch && byStatus && byDate && byAmount
    })
  }, [
    journalUsesBackendFeed,
    intents,
    selectedBatch,
    tableSearch,
    filterBatchId,
    connectorFilter,
    dispatchModeFilter,
    intentStatusFilter,
    dateRange,
    amountRangeFilter,
  ])

  const filteredFailures = useMemo(() => {
    const sidebarBid = journalUsesBackendFeed && selectedBatch ? selectedBatch.batchId : ''
    const scopeBatch = sidebarBid !== ''
    const filtered = failures.filter((row) => {
      const q = tableSearch.trim().toLowerCase()
      const bySearch = !q || failureHaystack(row).includes(q)
      const bySidebarBatch = !scopeBatch || row.batchId === sidebarBid
      const byBatch =
        !filterBatchId.trim() || row.batchId.toLowerCase().includes(filterBatchId.trim().toLowerCase())
      const byConnector = connectorFilter === 'All' || row.paymentPartner === connectorFilter
      const byDispatch = dispatchModeFilter === 'All' || row.method === dispatchModeFilter
      const byStage = failureStageFilter === 'All' || row.failureStage === failureStageFilter
      const byDate = intentInDateRange(row.lastUpdated, dateRange)
      const byAmount = matchesIntentAmountRange(row.amount, amountRangeFilter)
      return bySearch && bySidebarBatch && byBatch && byConnector && byDispatch && byStage && byDate && byAmount
    })
    return [...filtered].sort((a, b) => {
      const aRow = a.sourceRowNum
      const bRow = b.sourceRowNum
      if (aRow == null && bRow == null) return 0
      if (aRow == null) return 1
      if (bRow == null) return -1
      return aRow - bRow
    })
  }, [
    journalUsesBackendFeed,
    failures,
    selectedBatch,
    tableSearch,
    filterBatchId,
    connectorFilter,
    dispatchModeFilter,
    failureStageFilter,
    dateRange,
    amountRangeFilter,
  ])

  useEffect(() => {
    setPage(1)
    setJumpPage('1')
    setFailurePage(1)
    setFailureJumpPage('1')
  }, [
    tableSearch,
    dateRange,
    filterBatchId,
    connectorFilter,
    dispatchModeFilter,
    intentStatusFilter,
    failureStageFilter,
    amountRangeFilter,
    activeTab,
    selectedBatchId,
  ])

  const intentTotal = filteredIntents.length
  const totalPages = Math.max(1, Math.ceil(intentTotal / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredIntents.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage)

  const failureTotal = filteredFailures.length
  const failureTotalPages = Math.max(1, Math.ceil(failureTotal / rowsPerPage))
  const safeFailurePage = Math.min(failurePage, failureTotalPages)
  const failurePageRows = filteredFailures.slice((safeFailurePage - 1) * rowsPerPage, safeFailurePage * rowsPerPage)

  const tableFiltersActive =
    tableSearch.trim() !== '' ||
    dateRange !== 'all' ||
    filterBatchId.trim() !== '' ||
    connectorFilter !== 'All' ||
    dispatchModeFilter !== 'All' ||
    intentStatusFilter !== 'All' ||
    failureStageFilter !== 'All' ||
    amountRangeFilter !== 'All'

  useEffect(() => {
    setPage((p) => clampPage(p, totalPages))
    setJumpPage((prev) => {
      const parsed = Number(prev)
      const seed = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
      return String(clampPage(seed, totalPages))
    })
  }, [totalPages])

  useEffect(() => {
    setFailurePage((p) => clampPage(p, failureTotalPages))
    setFailureJumpPage((prev) => {
      const parsed = Number(prev)
      const seed = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
      return String(clampPage(seed, failureTotalPages))
    })
  }, [failureTotalPages])

  useEffect(() => {
    setSidebarPage((p) => clampPage(p, sidebarTotalPages))
  }, [sidebarTotalPages])

  const [feedRefreshing, setFeedRefreshing] = useState(false)

  const handlePageRefresh = useCallback(async () => {
    if (!journalUsesBackendFeed) return
    setFeedRefreshing(true)
    try {
      await Promise.all([refreshSidebar(), intentFeed.refetch(), failureFeed.refetch()])
    } finally {
      setFeedRefreshing(false)
    }
  }, [journalUsesBackendFeed, refreshSidebar, intentFeed, failureFeed])

  useRegisterPayoutPageActions({
    refresh: journalUsesBackendFeed ? handlePageRefresh : undefined,
    refreshing: feedRefreshing || liveDetailLoading,
    exportShare: () => {
      if (activeTab === 'failures') {
        downloadCsv(
          `intent-journal-review-items${selectedBatchId ? `-${selectedBatchId}` : ''}.csv`,
          failuresToCsv(filteredFailures),
        )
        return
      }
      downloadCsv(
        `intent-journal-payment-instructions${selectedBatchId ? `-${selectedBatchId}` : ''}.csv`,
        intentsToCsv(filteredIntents),
      )
    },
    exportDisabled:
      activeTab === 'failures' ? filteredFailures.length === 0 : filteredIntents.length === 0,
  })

  const clearTableFilters = () => {
    setTableSearch('')
    setDateRange('all')
    setFilterBatchId('')
    setConnectorFilter('All')
    setDispatchModeFilter('All')
    setIntentStatusFilter('All')
    setFailureStageFilter('All')
    setAmountRangeFilter('All')
  }

  const activityVm: IntentJournalActivityViewModel = {
    activeTab,
    setActiveTab,
    tableSearch,
    setTableSearch,
    dateRange,
    setDateRange,
    filterBatchId,
    setFilterBatchId,
    connectorFilter,
    setConnectorFilter,
    dispatchModeFilter,
    setDispatchModeFilter,
    intentStatusFilter,
    setIntentStatusFilter,
    failureStageFilter,
    setFailureStageFilter,
    amountRangeFilter,
    setAmountRangeFilter,
    page,
    setPage,
    jumpPage,
    setJumpPage,
    failurePage,
    setFailurePage,
    failureJumpPage,
    setFailureJumpPage,
    rowsPerPage,
    setRowsPerPage,
    expandedId,
    setExpandedId,
    selectedIntentId,
    setSelectedIntentId,
    failureReviewId,
    setFailureReviewId,
    liveIntentDrawerApi,
    filteredIntents,
    filteredFailures,
    pageRows,
    failurePageRows,
    intentTotal,
    failureTotal,
    apiIntentTotal: selectedEngineIntentTotal,
    apiFailureTotal: selectedDlqTotal,
    tableFiltersActive,
    safePage,
    safeFailurePage,
    totalPages,
    failureTotalPages,
    selectedBatch,
    selectedBatchId,
    journalUsesBackendFeed,
    liveDetailLoading,
    clearTableFilters,
    failures,
    batches,
  }

  const selectionValue = {
    tenantId: liveTenantId,
    tenantReady,
    selectedBatchId,
    setSelectedBatchId,
    journalEnabled: journalUsesBackendFeed,
  }

  return (
    <JournalBatchSelectionProvider value={selectionValue}>
      <>
      <div
        className={`h-[calc(100vh-8rem)] overflow-hidden ${JOURNAL_PAGE_BG} ${JOURNAL_DM_SANS} text-[13px] font-normal leading-relaxed tracking-[0] text-slate-900 antialiased`}
      >
      <div className="grid h-full grid-cols-[272px,minmax(0,1fr)]">
        <IntentJournalBatchSidebar
          batches={batches}
          batchFilter={batchFilter}
          setBatchFilter={setBatchFilter}
          setSidebarPage={setSidebarPage}
          journalUsesBackendFeed={journalUsesBackendFeed}
          sidebarPageRows={sidebarPageRows}
          selectedBatchId={selectedBatchId}
          selectBatch={selectBatch}
          selectedEngineIntentTotal={selectedEngineIntentTotal}
          safeSidebarPage={safeSidebarPage}
          sidebarTotalPages={sidebarTotalPages}
          needsAttentionCount={needsAttentionCount}
          selectedMetricsBatch={selectedMetricsBatch}
        />

        <main className="flex h-full min-w-0 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {journalUsesBackendFeed && !tenantReady ? (
              <p className={`mb-4 rounded-xl border border-slate-200/90 bg-slate-50 px-3.5 py-2.5 ${HOME_BODY_IMPERIAL_SM}`}>
                Resolving your workspace…
              </p>
            ) : null}

            {journalUsesBackendFeed && feedError ? (
              <p className="mb-4 rounded-xl border border-amber-200/90 bg-amber-50 px-3.5 py-2.5 text-[14px] text-amber-950">
                {feedError}
              </p>
            ) : null}


            {journalUsesBackendFeed &&
            liveFeedLoaded &&
            liveBatchList.length === 0 &&
            noBatchesNoticeDismissed &&
            mode !== 'sandbox' ? (
              <button
                type="button"
                onClick={() => {
                  reopenJournalNotice(JOURNAL_NO_BATCHES_DISMISS_KEY)
                  setNoBatchesNoticeDismissed(false)
                }}
                className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-[13px] font-medium text-[#000000] shadow-sm transition hover:bg-slate-50"
              >
                Show batch ingest tip
              </button>
            ) : null}

            {showNoBatchesNotice ? (
              <JournalRecommendedBlackCard
                eyebrow="Batches"
                title="No batches yet"
                body="Upload a payment file from Batch Command Center to get started."
                onDismiss={() => {
                  dismissJournalNotice(JOURNAL_NO_BATCHES_DISMISS_KEY)
                  setNoBatchesNoticeDismissed(true)
                }}
              />
            ) : null}

            {sandboxJournalEmpty && sandboxSetupNoticeDismissed ? (
              <button
                type="button"
                onClick={() => {
                  reopenJournalNotice(JOURNAL_SANDBOX_SETUP_DISMISS_KEY)
                  setSandboxSetupNoticeDismissed(false)
                }}
                className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-[13px] font-medium text-[#000000] shadow-sm transition hover:bg-slate-50"
              >
                Show sandbox setup
              </button>
            ) : null}

            {showSandboxSetupNotice ? (
              <JournalRecommendedBlackCard
                eyebrow="Sandbox"
                title="Upload intent + settlement in Batch Command Center"
                bodyBold
                body="Step 1: intent file → POST /api/bulk-ingest. Step 2: settlement file (PSP + Batch-Id) → POST /api/settlement/upload. This journal then loads batches from the intent engine and intelligence — no demo rows."
                onDismiss={() => {
                  dismissJournalNotice(JOURNAL_SANDBOX_SETUP_DISMISS_KEY)
                  setSandboxSetupNoticeDismissed(true)
                }}
              >
                <Link
                  href={batchCommandCenterHref}
                  className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-[#0A0A0A] transition hover:bg-white/90"
                >
                  Open Batch Command Center
                </Link>
                <button
                  type="button"
                  className="rounded-xl border border-white/25 bg-transparent px-4 py-2.5 text-[14px] font-medium text-white/90 transition hover:bg-white/10"
                  onClick={() => openSandboxSetupPanel()}
                >
                  Setup steps
                </button>
              </JournalRecommendedBlackCard>
            ) : null}

            {/* ── Persistent dispatch success banner ─────────────────────── */}
            {dispatchBanner ? (
              <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-white/20 bg-[#000000] px-4 py-2.5 text-white shadow-[0_0_28px_rgba(0,0,0,0.35)] ring-1 ring-white/15">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#000000]">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <EntityLogo name={dispatchBanner.target.name} kind={dispatchBanner.target.type} size={20} />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-white">
                      Batch {dispatchBanner.batchId} dispatched to {dispatchBanner.target.name}
                      <span className="ml-1 font-mono text-[14px] font-normal text-white/70">· {USE_CASE_RAIL[dispatchBanner.useCase]}</span>
                    </p>
                    <p className="text-[14px] text-white/60">
                      just now · {dispatchBanner.intents.toLocaleString('en-US')} intents queued · awaiting settlement signal
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchBanner(null)}
                  className="rounded-md border border-white/30 bg-black px-2 py-1 text-[14px] font-semibold text-white transition hover:bg-neutral-900"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchBanner(null)}
                  aria-label="Dismiss"
                  className="text-[19px] leading-none text-white/70 hover:text-white"
                >
                  ×
                </button>
              </div>
            ) : null}
            {selectedBatch ? (
              <>
                <IntentJournalHeroBanner
                  onExportIntents={() => {
                    downloadCsv(
                      `intent-journal-payment-instructions${selectedBatchId ? `-${selectedBatchId}` : ''}.csv`,
                      intentsToCsv(filteredIntents),
                    )
                  }}
                  onExportReviewItems={() => {
                    downloadCsv(
                      `intent-journal-review-items${selectedBatchId ? `-${selectedBatchId}` : ''}.csv`,
                      failuresToCsv(filteredFailures),
                    )
                  }}
                  intentExportCount={filteredIntents.length}
                  reviewExportCount={filteredFailures.length}
                  exportDisabled={false}
                />

                <IntentJournalActivityPanel vm={activityVm} isSandboxRoute={mode === 'sandbox'} />
              </>
            ) : (
              <section className={`relative mb-4 ${COMMAND_CENTER_KPI_CARD} ${JOURNAL_DM_SANS} px-6 py-8 text-center`}>
                <CommandCenterCardGlow />
                <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Intent journal</p>
                <p className={`relative mx-auto mt-2 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>
                  Select a batch from the sidebar to view batch totals, intents, and DLQ rows for your workspace.
                </p>
              </section>
            )}

          </div>
        </main>
      </div>

      {/* ── Dispatch modal — smart routing recommendation ─────────────── */}
      {dispatchModalOpen && selectedBatch ? (
        <DispatchRoutingModal
          batch={selectedBatch}
          useCase={dispatchUseCase}
          onUseCaseChange={setDispatchUseCase}
          onClose={() => setDispatchModalOpen(false)}
          onDispatchComplete={(target, useCase) => {
            // Demo: real impl would POST /api/dispatch with { batchId, useCase, target }
            setDispatchBanner({
              batchId: selectedBatch.batchId,
              target,
              useCase,
              intents: selectedBatch.transactions,
              at: new Date(),
            })
            setDispatchModalOpen(false)
          }}
        />
      ) : null}
    </div>
    </>
    </JournalBatchSelectionProvider>
  )
}

// ─── Dispatch routing modal ─────────────────────────────────────────────
type UseCase = 'salary' | 'vendor' | 'payroll' | 'mandate'
type RailType = 'psp' | 'bank'

type DispatchTarget = {
  name: string
  type: RailType
  rails: string[]
  primaryRail: string
  /** p95 dispatch + acknowledgment time per use-case, in seconds. */
  delayBySec: Record<UseCase, number>
  ambiguityPct: number
  defensibility: number
  costTier: 'low' | 'mid' | 'high'
}

const USE_CASES: { id: UseCase; label: string; hint: string }[] = [
  { id: 'salary', label: 'Salary run', hint: 'Monthly employee disbursements · IMPS/NEFT' },
  { id: 'payroll', label: 'Payroll', hint: 'Contractor / gig payouts · IMPS' },
  { id: 'vendor', label: 'Vendor payout', hint: 'B2B settlement · NEFT/RTGS' },
  { id: 'mandate', label: 'Mandate (NACH)', hint: 'Recurring debit presentation' },
]

/** Use-case → preferred primary rail. Targets that support it get a fit bonus. */
const USE_CASE_RAIL: Record<UseCase, string> = {
  salary: 'IMPS',
  payroll: 'IMPS',
  vendor: 'NEFT',
  mandate: 'NACH',
}

const DISPATCH_TARGETS: DispatchTarget[] = [
  // PSP rail
  { name: 'Cashfree', type: 'psp', rails: ['IMPS', 'UPI', 'NEFT'], primaryRail: 'IMPS', delayBySec: { salary: 6, payroll: 7, vendor: 9, mandate: 22 }, ambiguityPct: 1.8, defensibility: 84, costTier: 'low' },
  { name: 'Razorpay', type: 'psp', rails: ['IMPS', 'NEFT', 'NACH'], primaryRail: 'IMPS', delayBySec: { salary: 11, payroll: 9, vendor: 14, mandate: 18 }, ambiguityPct: 3.2, defensibility: 72, costTier: 'mid' },
  { name: 'PayU', type: 'psp', rails: ['IMPS', 'NACH'], primaryRail: 'NACH', delayBySec: { salary: 14, payroll: 15, vendor: 18, mandate: 12 }, ambiguityPct: 6.0, defensibility: 58, costTier: 'high' },
  // Bank-direct rail
  { name: 'HDFC Bank', type: 'bank', rails: ['NEFT', 'RTGS', 'IMPS', 'NACH'], primaryRail: 'NEFT', delayBySec: { salary: 8, payroll: 10, vendor: 6, mandate: 14 }, ambiguityPct: 0.8, defensibility: 91, costTier: 'low' },
  { name: 'ICICI Bank', type: 'bank', rails: ['NEFT', 'RTGS', 'IMPS'], primaryRail: 'NEFT', delayBySec: { salary: 9, payroll: 11, vendor: 7, mandate: 16 }, ambiguityPct: 1.4, defensibility: 88, costTier: 'low' },
  { name: 'SBI', type: 'bank', rails: ['NEFT', 'RTGS', 'NACH'], primaryRail: 'NEFT', delayBySec: { salary: 12, payroll: 14, vendor: 9, mandate: 20 }, ambiguityPct: 2.1, defensibility: 82, costTier: 'mid' },
]

const REASON_CODE_DESCRIPTIONS: Record<string, string> = {
  LOW_P95_DELAY: 'p95 dispatch latency ≤ 7s in the last 14 days',
  HIGH_DEFENSIBILITY: 'Defensibility score ≥ 85 — strongest evidence chain',
  LOW_AMBIGUITY: 'Ambiguous-signal rate ≤ 2% — clean acknowledgments',
  USE_CASE_FIT: `Supports the preferred rail for this use-case`,
  COST_OPTIMAL: 'Lowest fee tier among comparable targets',
  SPONSOR_BANK_HEALTHY: 'Bank-direct rail with healthy sponsor-bank queue',
  WEBHOOK_RELIABLE: 'PSP webhook reliability ≥ 98% over 14d',
}

function reasonCodes(t: DispatchTarget, useCase: UseCase): string[] {
  const codes: string[] = []
  if (t.delayBySec[useCase] <= 7) codes.push('LOW_P95_DELAY')
  if (t.defensibility >= 85) codes.push('HIGH_DEFENSIBILITY')
  if (t.ambiguityPct <= 2.0) codes.push('LOW_AMBIGUITY')
  if (t.rails.includes(USE_CASE_RAIL[useCase])) codes.push('USE_CASE_FIT')
  if (t.costTier === 'low') codes.push('COST_OPTIMAL')
  if (t.type === 'bank' && t.defensibility >= 85) codes.push('SPONSOR_BANK_HEALTHY')
  if (t.type === 'psp' && t.ambiguityPct <= 2.0) codes.push('WEBHOOK_RELIABLE')
  return codes
}

function scoreTarget(t: DispatchTarget, useCase: UseCase): number {
  let base = t.defensibility - t.delayBySec[useCase] * 3 - t.ambiguityPct * 10
  if (t.rails.includes(USE_CASE_RAIL[useCase])) base += 8
  return Math.max(0, Math.round(base))
}

type DispatchPhase = 'select' | 'dispatching' | 'success'

function DispatchRoutingModal({
  batch,
  useCase,
  onUseCaseChange,
  onClose,
  onDispatchComplete,
}: {
  batch: BatchRecord
  useCase: UseCase
  onUseCaseChange: (uc: UseCase) => void
  onClose: () => void
  onDispatchComplete: (target: DispatchTarget, useCase: UseCase) => void
}) {
  const scored = useMemo(() =>
    DISPATCH_TARGETS
      .map((t) => ({ target: t, score: scoreTarget(t, useCase), codes: reasonCodes(t, useCase) }))
      .sort((a, b) => b.score - a.score),
    [useCase],
  )
  const winnerName = scored[0].target.name

  const psps = scored.filter((s) => s.target.type === 'psp')
  const banks = scored.filter((s) => s.target.type === 'bank')

  const [selected, setSelected] = useState<DispatchTarget>(scored[0].target)
  // When use-case changes, reset selection to the new winner.
  useEffect(() => { setSelected(scored[0].target) }, [scored])

  const [phase, setPhase] = useState<DispatchPhase>('select')
  const [stepIdx, setStepIdx] = useState(0)

  const dispatchSteps = useMemo(
    () => [
      `Validating ${batch.transactions.toLocaleString('en-US')} intents`,
      'Reserving funds with sponsor bank',
      `Sending to ${selected.name}`,
      'Awaiting acknowledgment',
      'Confirming dispatch',
    ],
    [batch.transactions, selected.name],
  )

  // Phase machine: dispatching → 5 steps × 1s → success → 2s → onDispatchComplete.
  useEffect(() => {
    if (phase !== 'dispatching') return
    setStepIdx(0)
    const stepTimers: number[] = []
    for (let i = 1; i <= dispatchSteps.length; i++) {
      stepTimers.push(window.setTimeout(() => setStepIdx(i), i * 1000))
    }
    const successTimer = window.setTimeout(() => setPhase('success'), dispatchSteps.length * 1000)
    return () => {
      stepTimers.forEach((id) => window.clearTimeout(id))
      window.clearTimeout(successTimer)
    }
  }, [phase, dispatchSteps.length])

  useEffect(() => {
    if (phase !== 'success') return
    const id = window.setTimeout(() => onDispatchComplete(selected, useCase), 2000)
    return () => window.clearTimeout(id)
  }, [phase, selected, useCase, onDispatchComplete])

  const isWorking = phase !== 'select'

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] cursor-default bg-black/30 backdrop-blur-[2px]"
        aria-label="Close dispatch modal"
        onClick={() => { if (!isWorking) onClose() }}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[90] w-[min(calc(100vw-2rem),46rem)] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        {/* ─── Phase: SELECT ─── */}
        {phase === 'select' ? (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-[#E5E5E5] px-5 py-4">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Dispatch · {batch.batchId}</p>
                <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.01em] text-[#0f172a]">Choose target → Zord recommends best fit</h2>
                <p className="mt-1 text-[15px] text-[#64748b]">Ranked by 14-day p95 delay, ambiguity, defensibility, and use-case fit.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[15px] text-[#475569] transition hover:bg-slate-50"
              >
                Close
              </button>
            </header>

            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto px-5 py-4">
              {/* Use-case picker */}
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">1. Use-case</p>
              <div className="grid grid-cols-2 gap-2">
                {USE_CASES.map((uc) => (
                  <button
                    key={uc.id}
                    type="button"
                    onClick={() => onUseCaseChange(uc.id)}
                    className={`rounded-[10px] border px-3 py-2 text-left transition ${
                      useCase === uc.id ? 'border-[#0f172a] bg-slate-100' : 'border-[#E5E5E5] bg-white hover:border-[#0f172a]/30'
                    }`}
                  >
                    <p className="text-[15px] font-semibold text-[#0f172a]">{uc.label}</p>
                    <p className="mt-0.5 text-[14px] text-[#64748b]">{uc.hint}</p>
                  </button>
                ))}
              </div>

              {/* PSP rail */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">PSP rail</p>
                <p className="text-[13px] text-[#94a3b8]">Goes via payment processor</p>
              </div>
              <ul className="mt-2 space-y-2">
                {psps.map(({ target, score, codes }) => (
                  <DispatchOption
                    key={target.name}
                    target={target}
                    score={score}
                    codes={codes}
                    isRecommended={target.name === winnerName}
                    isSelected={selected.name === target.name}
                    useCase={useCase}
                    onPick={() => setSelected(target)}
                  />
                ))}
              </ul>

              {/* Bank-direct rail */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">Bank-direct rail</p>
                <p className="text-[13px] text-[#94a3b8]">Goes straight to sponsor bank</p>
              </div>
              <ul className="mt-2 space-y-2">
                {banks.map(({ target, score, codes }) => (
                  <DispatchOption
                    key={target.name}
                    target={target}
                    score={score}
                    codes={codes}
                    isRecommended={target.name === winnerName}
                    isSelected={selected.name === target.name}
                    useCase={useCase}
                    onPick={() => setSelected(target)}
                  />
                ))}
              </ul>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-[#E5E5E5] bg-slate-50 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2 text-[14px] text-[#64748b]">
                <EntityLogo name={selected.name} kind={selected.type} size={20} />
                <span>
                  Selected: <span className="font-semibold text-[#0f172a]">{selected.name}</span>{' '}
                  <span className="text-[#94a3b8]">· {USE_CASE_RAIL[useCase]} rail</span>
                </span>
                {selected.name !== winnerName ? (
                  <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[13px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    Override · not recommended
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-[8px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-[15px] font-medium text-[#475569] transition hover:bg-[#f3f3ee]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('dispatching')}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-[#0f172a] px-3 py-1.5 text-[15px] font-semibold text-white transition hover:bg-black"
                >
                  Confirm dispatch
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m3 6 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </footer>
          </>
        ) : null}

        {/* ─── Phase: DISPATCHING ─── */}
        {phase === 'dispatching' ? (
          <div className="px-6 py-8">
            <div className="mx-auto max-w-md">
              <div className="flex items-center justify-center gap-3">
                <span className="relative flex h-10 w-10 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#0f172a]/10" />
                  <span className="absolute inset-1 rounded-full border-2 border-[#0f172a]/20 border-t-[#0f172a] animate-spin" />
                  <EntityLogo name={selected.name} kind={selected.type} size={20} />
                </span>
              </div>
              <p className="mt-4 text-center text-[17px] font-semibold text-[#0f172a]">
                Dispatching {batch.batchId} → {selected.name}
              </p>
              <p className="mt-1 text-center text-[15px] text-[#64748b]">
                {USE_CASE_RAIL[useCase]} rail · {batch.transactions.toLocaleString('en-US')} intents
              </p>

              {/* Progress bar */}
              <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                <div
                  className="h-full rounded-full bg-[#0f172a] transition-all duration-700 ease-out"
                  style={{ width: `${(stepIdx / dispatchSteps.length) * 100}%` }}
                />
              </div>

              {/* Step list */}
              <ul className="mt-5 space-y-2.5">
                {dispatchSteps.map((label, i) => {
                  const done = i < stepIdx
                  const active = i === stepIdx
                  return (
                    <li key={label} className="flex items-center gap-2.5 text-[15px]">
                      {done ? (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black text-white">
                          <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                            <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      ) : active ? (
                        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-[#0f172a]/20 border-t-[#0f172a] animate-spin" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-[#E5E5E5] bg-white" />
                      )}
                      <span className={done ? 'text-[#0f172a]' : active ? 'text-[#0f172a] font-medium' : 'text-[#94a3b8]'}>
                        {label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        ) : null}

        {/* ─── Phase: SUCCESS (2s) ─── */}
        {phase === 'success' ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                <path d="M5 13l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.01em] text-[#0f172a]">Batch dispatched</h3>
            <div className="mt-2 inline-flex items-center gap-2 rounded-[10px] border border-black/20 bg-neutral-100 px-3 py-1.5">
              <EntityLogo name={selected.name} kind={selected.type} size={20} />
              <span className="text-[15px] font-medium text-black">
                {selected.name}
                <span className="ml-1 font-mono text-[14px] font-normal text-neutral-600">· {USE_CASE_RAIL[useCase]}</span>
              </span>
            </div>
            <p className="mt-3 text-[15px] text-[#64748b]">
              {batch.transactions.toLocaleString('en-US')} intents queued · awaiting settlement signal
            </p>
          </div>
        ) : null}
      </div>
    </>
  )
}

function DispatchOption({
  target,
  score,
  codes,
  isRecommended,
  isSelected,
  useCase,
  onPick,
}: {
  target: DispatchTarget
  score: number
  codes: string[]
  isRecommended: boolean
  isSelected: boolean
  useCase: UseCase
  onPick: () => void
}) {
  const scoreTone =
    score >= 75 ? 'text-black' : score >= 55 ? 'text-amber-700' : 'text-rose-700'
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`flex w-full items-start gap-3 rounded-[10px] border p-3 text-left transition ${
          isSelected ? 'border-[#0f172a] bg-slate-100' : 'border-[#E5E5E5] bg-white hover:border-[#0f172a]/30'
        }`}
      >
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <span className={`text-[19px] font-bold leading-none tabular-nums ${scoreTone}`}>{score}</span>
          <span className="text-[12px] uppercase tracking-wide text-[#94a3b8]">score</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <EntityLogo name={target.name} kind={target.type} size={22} />
            <p className="text-[18px] font-semibold text-[#0f172a]">{target.name}</p>
            {isRecommended ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-black px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-white ring-1 ring-black/20">
                <span className="h-1 w-1 rounded-full bg-white" aria-hidden />
                Recommended
              </span>
            ) : null}
            <span className="ml-auto text-[13px] text-[#94a3b8]">{target.rails.join(' · ')}</span>
          </div>

          {/* Reason code chips */}
          {codes.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {codes.map((c) => (
                <span
                  key={c}
                  title={REASON_CODE_DESCRIPTIONS[c] ?? c}
                  className="inline-flex items-center rounded-full border border-[#E5E5E5] bg-slate-50 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-[#475569]"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}

          {/* Metrics */}
          <div className="mt-2 grid grid-cols-3 gap-2 text-[14px]">
            <div>
              <p className="text-[13px] uppercase tracking-wide text-[#94a3b8]">p95 delay</p>
              <p className="font-medium tabular-nums text-[#0f172a]">{target.delayBySec[useCase]}s</p>
            </div>
            <div>
              <p className="text-[13px] uppercase tracking-wide text-[#94a3b8]">Ambiguity</p>
              <p className="font-medium tabular-nums text-[#0f172a]">{target.ambiguityPct.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[13px] uppercase tracking-wide text-[#94a3b8]">Defensibility</p>
              <p className="font-medium tabular-nums text-[#0f172a]">{target.defensibility}</p>
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}
