'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SettlementBatchSelectionProvider } from '../settlement-journal/context/SettlementBatchSelectionContext'
import { SettlementJournalBatchSidebar } from '../settlement-journal/components/SettlementJournalBatchSidebar'
import { SettlementJournalHeroBanner } from '../settlement-journal/components/SettlementJournalHeroBanner'
import { SettlementJournalDataHealthPanel } from '../settlement-journal/components/SettlementJournalDataHealthPanel'
import {
  SettlementJournalActivityPanel,
  type SettlementJournalActivityViewModel,
} from '../settlement-journal/components/SettlementJournalActivityPanel'
import { useSettlementSidebarBatches } from '../settlement-journal/hooks/useSettlementSidebarBatches'
import { useSettlementObservationRows } from '../settlement-journal/hooks/useSettlementObservationRows'
import { useSettlementParseErrorTotal } from '../settlement-journal/hooks/useSettlementParseErrorTotal'
import { useSettlementBatchIntelligence } from '../settlement-journal/hooks/useSettlementBatchIntelligence'
import { settlementObservationPageRange } from '../settlement-journal/settlementPaginationUtils'
import { downloadCsv, observationsToCsv } from '../settlement-journal/settlementExport'
import {
  observationInDateRange,
  matchesAmountRange,
  outcomeFromMatchConfidence,
  type AmountRangeFilter,
  type DateRangePreset,
  type SettlementSidebarOutcome,
} from '../settlement-journal/settlementJournalSidebarUtils'
import { SETTLEMENT_SIDEBAR_PAGE_SIZE } from '../settlement-journal/settlementConstants'
import { CommandCenterCardGlow } from '../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { JOURNAL_PAGE_BG, JournalPageHeader } from '../journal/JournalCommandCenterPrimitives'
import { JOURNAL_DM_SANS } from '../journal/journalFonts'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import { dockItems } from '@/services/payout-command/model'
import {
  observationSearchHaystack,
  getSettlementParseErrorsForClientBatch,
  type SettlementParseErrorRow,
} from '@/services/payout-command/prod-api/settlementObservations'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import { LiveDataHint } from '../shared'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'

type SettlementActivityTab = 'observations' | 'parseErrors'
const SETTLEMENT_PAGE_SUMMARY = dockItems.find((d) => d.id === 'settlement')?.summary ?? ''

const ROW_SIZE_OPTIONS = [25, 50, 100, 200] as const

export function SettlementJournalSurface({
  initialClientBatchId,
}: {
  initialClientBatchId?: string
} = {}) {
  return (
    <SettlementJournalSurfaceInner initialClientBatchId={initialClientBatchId} />
  )
}

function SettlementJournalSurfaceInner({
  initialClientBatchId,
}: {
  initialClientBatchId?: string
}) {
  const [selectedClientBatchId, setSelectedClientBatchId] = useState(
    () => initialClientBatchId?.trim() ?? '',
  )
  const journalEnabled = true

  const {
    tenantId,
    tenantReady,
    clientBatches,
    feedLoaded,
    feedMeta,
    refresh: refreshSidebar,
  } = useSettlementSidebarBatches({
    enabled: journalEnabled,
    initialClientBatchId: initialClientBatchId?.trim() || undefined,
    selectedClientBatchId,
    setSelectedClientBatchId,
  })

  const selectionValue = useMemo(
    () => ({
      tenantId,
      tenantReady,
      selectedClientBatchId,
      setSelectedClientBatchId,
      journalEnabled,
    }),
    [tenantId, tenantReady, selectedClientBatchId, journalEnabled],
  )

  return (
    <SettlementBatchSelectionProvider value={selectionValue}>
      <SettlementJournalSurfaceContent
        initialClientBatchId={initialClientBatchId}
        clientBatches={clientBatches}
        feedLoaded={feedLoaded}
        feedMeta={feedMeta}
        refreshSidebar={refreshSidebar}
        selectedClientBatchId={selectedClientBatchId}
        setSelectedClientBatchId={setSelectedClientBatchId}
        tenantReady={tenantReady}
      />
    </SettlementBatchSelectionProvider>
  )
}

function SettlementJournalSurfaceContent({
  initialClientBatchId: _initialClientBatchId,
  clientBatches,
  feedLoaded,
  feedMeta,
  refreshSidebar,
  selectedClientBatchId,
  setSelectedClientBatchId,
  tenantReady,
}: {
  initialClientBatchId?: string
  clientBatches: string[]
  feedLoaded: boolean
  feedMeta: ReturnType<typeof useSettlementSidebarBatches>['feedMeta']
  refreshSidebar: () => Promise<void>
  selectedClientBatchId: string
  setSelectedClientBatchId: (id: string) => void
  tenantReady: boolean
}) {
  const { mode } = useEnvironment()
  const batchCommandCenterHref = payoutBatchCommandCenterHref(mode === 'sandbox')
  const { kpis } = useSettlementBatchIntelligence(selectedClientBatchId, tenantReady)

  const [tableSearch, setTableSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | string>('All')
  const [dateRange, setDateRange] = useState<DateRangePreset>('all')
  const [filterBankRef, setFilterBankRef] = useState('')
  const [filterClientRef, setFilterClientRef] = useState('')
  const [filterSettlementBatchId, setFilterSettlementBatchId] = useState('')
  const [sourceSystemFilter, setSourceSystemFilter] = useState<'All' | string>('All')
  const [amountRangeFilter, setAmountRangeFilter] = useState<AmountRangeFilter>('All')
  const [rowsPerPage, setRowsPerPage] = useState<(typeof ROW_SIZE_OPTIONS)[number]>(50)
  const [page, setPage] = useState(1)
  const [jumpPage, setJumpPage] = useState('1')
  const [sidebarPage, setSidebarPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [feedRefreshing, setFeedRefreshing] = useState(false)
  const [batchMatchOutcomeCache, setBatchMatchOutcomeCache] = useState<
    Record<string, SettlementSidebarOutcome>
  >({})
  const [syncAt, setSyncAt] = useState<Date | null>(null)
  const [parseErrors, setParseErrors] = useState<SettlementParseErrorRow[]>([])
  const [parseErrorsLoading, setParseErrorsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<SettlementActivityTab>('observations')
  const selectClientBatch = useCallback(
    (batchId: string) => setSelectedClientBatchId(batchId),
    [setSelectedClientBatchId],
  )

  const filtersActive =
    tableSearch.trim() !== '' ||
    statusFilter !== 'All' ||
    dateRange !== 'all' ||
    filterBankRef.trim() !== '' ||
    filterClientRef.trim() !== '' ||
    filterSettlementBatchId.trim() !== '' ||
    sourceSystemFilter !== 'All' ||
    amountRangeFilter !== 'All'

  const {
    rows: observationRows,
    observationTotal,
    loading: detailLoading,
    refetch: refetchObservations,
  } = useSettlementObservationRows(selectedClientBatchId, tenantReady, {
    page,
    pageSize: rowsPerPage,
    fetchAll: filtersActive,
  })

  const { total: parseErrorTotal, loading: parseErrorTotalLoading } = useSettlementParseErrorTotal(
    selectedClientBatchId,
    tenantReady,
  )

  useEffect(() => {
    if (mode === 'sandbox' && feedLoaded && (observationTotal ?? 0) > 0) {
      markSandboxSetupStep('settlement-journal')
    }
  }, [mode, feedLoaded, observationTotal])

  useEffect(() => {
    if (!selectedClientBatchId) return
    const outcome = outcomeFromMatchConfidence(kpis.matchConfidence)
    setBatchMatchOutcomeCache((prev) => ({ ...prev, [selectedClientBatchId]: outcome }))
  }, [selectedClientBatchId, kpis.matchConfidence])

  const liveMatchOutcome = useMemo(
    () => outcomeFromMatchConfidence(kpis.matchConfidence),
    [kpis.matchConfidence],
  )

  useEffect(() => {
    setPage(1)
    setJumpPage('1')
    setExpandedId(null)
  }, [
    selectedClientBatchId,
    tableSearch,
    statusFilter,
    dateRange,
    filterBankRef,
    filterClientRef,
    filterSettlementBatchId,
    sourceSystemFilter,
    amountRangeFilter,
  ])

  useEffect(() => {
    setPage(1)
    setJumpPage('1')
    setExpandedId(null)
  }, [activeTab])

  const refetchParseErrors = useCallback(async () => {
    const bid = selectedClientBatchId.trim()
    if (!tenantReady || !bid) {
      setParseErrors([])
      setParseErrorsLoading(false)
      return
    }
    setParseErrorsLoading(true)
    try {
      const res = await getSettlementParseErrorsForClientBatch(bid)
      setParseErrors(res.data?.items ?? [])
    } finally {
      setParseErrorsLoading(false)
    }
  }, [tenantReady, selectedClientBatchId])

  useEffect(() => {
    void refetchParseErrors()
  }, [refetchParseErrors])

  const statusOptions = useMemo(() => {
    const set = new Set(observationRows.map((r) => r.status).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [observationRows])

  const sourceSystemOptions = useMemo(() => {
    const set = new Set(observationRows.map((r) => r.sourceSystem).filter((s) => s && s !== '—'))
    return ['All', ...Array.from(set).sort()]
  }, [observationRows])

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    const bankQ = filterBankRef.trim().toLowerCase()
    const clientQ = filterClientRef.trim().toLowerCase()
    const settlementBatchQ = filterSettlementBatchId.trim().toLowerCase()
    const scopedRows = observationRows.filter((row) => {
      const bySearch = !q || observationSearchHaystack(row).includes(q)
      const byStatus = statusFilter === 'All' || row.status === statusFilter
      const byDate = observationInDateRange(row.observationTime, dateRange)
      const byBank = !bankQ || row.bankRef.toLowerCase().includes(bankQ)
      const byClient = !clientQ || row.clientRef.toLowerCase().includes(clientQ)
      const bySettlementBatch =
        !settlementBatchQ || row.settlementBatchId.toLowerCase().includes(settlementBatchQ)
      const bySource = sourceSystemFilter === 'All' || row.sourceSystem === sourceSystemFilter
      const byAmount = matchesAmountRange(row.amount, amountRangeFilter)
      return (
        bySearch &&
        byStatus &&
        byDate &&
        byBank &&
        byClient &&
        bySettlementBatch &&
        bySource &&
        byAmount
      )
    })
    return scopedRows.sort((a, b) => {
      const aNum = Number.parseInt(a.sourceRowRef, 10)
      const bNum = Number.parseInt(b.sourceRowRef, 10)
      const aValid = Number.isFinite(aNum)
      const bValid = Number.isFinite(bNum)
      if (aValid && bValid) return aNum - bNum
      if (aValid) return -1
      if (bValid) return 1
      return 0
    })
  }, [
    observationRows,
    tableSearch,
    statusFilter,
    dateRange,
    filterBankRef,
    filterClientRef,
    filterSettlementBatchId,
    sourceSystemFilter,
    amountRangeFilter,
  ])

  const serverPagination = !filtersActive
  const totalPages = serverPagination
    ? settlementObservationPageRange({ page, pageSize: rowsPerPage, total: observationTotal }).totalPages
    : Math.max(1, Math.ceil(filteredRows.length / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const paginationRange = settlementObservationPageRange({
    page: safePage,
    pageSize: rowsPerPage,
    total: observationTotal,
  })
  const pageRows = serverPagination
    ? filteredRows
    : filteredRows.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage)
  const filteredCount = filteredRows.length
  const tableTotal = serverPagination ? (observationTotal ?? filteredCount) : filteredCount

  const sidebarTotalPages = Math.max(1, Math.ceil(clientBatches.length / SETTLEMENT_SIDEBAR_PAGE_SIZE))
  const safeSidebarPage = Math.min(sidebarPage, sidebarTotalPages)
  const sidebarRows = clientBatches.slice(
    (safeSidebarPage - 1) * SETTLEMENT_SIDEBAR_PAGE_SIZE,
    safeSidebarPage * SETTLEMENT_SIDEBAR_PAGE_SIZE,
  )

  const handleRefresh = useCallback(async () => {
    setFeedRefreshing(true)
    try {
      await refreshSidebar()
      await refetchObservations()
      await refetchParseErrors()
      setSyncAt(new Date())
    } finally {
      setFeedRefreshing(false)
    }
  }, [refreshSidebar, refetchObservations, refetchParseErrors])

  useRegisterPayoutPageActions({
    refresh: handleRefresh,
    refreshing: feedRefreshing || detailLoading || parseErrorsLoading,
    exportShare: () => {
      downloadCsv(
        `settlement-observations${selectedClientBatchId ? `-${selectedClientBatchId}` : ''}.csv`,
        observationsToCsv(filteredRows),
      )
    },
    exportDisabled: filteredRows.length === 0,
  })

  const clearTableFilters = () => {
    setTableSearch('')
    setStatusFilter('All')
    setDateRange('all')
    setFilterBankRef('')
    setFilterClientRef('')
    setFilterSettlementBatchId('')
    setSourceSystemFilter('All')
    setAmountRangeFilter('All')
  }

  const applySidebarBatchToFilters = () => {
    if (!selectedClientBatchId) return
    setFilterSettlementBatchId('')
    setFilterClientRef('')
    setTableSearch(selectedClientBatchId)
  }

  const feedMetaLine = [
    feedMeta?.ok ? `${feedMeta.batchCount} batch${feedMeta.batchCount === 1 ? '' : 'es'}` : null,
    syncAt ? `synced ${syncAt.toLocaleTimeString()}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const activityVm: SettlementJournalActivityViewModel = {
    tableSearch,
    setTableSearch,
    selectedClientBatchId,
    applySidebarBatchToFilters,
    clearTableFilters,
    dateRange,
    setDateRange,
    filterSettlementBatchId,
    setFilterSettlementBatchId,
    filterBankRef,
    setFilterBankRef,
    filterClientRef,
    setFilterClientRef,
    sourceSystemFilter,
    setSourceSystemFilter,
    sourceSystemOptions,
    statusFilter,
    setStatusFilter,
    statusOptions,
    amountRangeFilter,
    setAmountRangeFilter,
    filteredRows,
    pageRows,
    detailLoading,
    expandedId,
    setExpandedId,
    safePage,
    rowsPerPage,
    setRowsPerPage,
    setPage,
    setJumpPage,
    totalPages,
    jumpPage,
    activeTab,
    setActiveTab,
    parseErrors,
    parseErrorsLoading,
    parseErrorTotal,
    parseErrorTotalLoading: parseErrorTotalLoading || parseErrorsLoading,
    filteredCount,
    tableTotal,
    observationTotal,
    filtersActive,
    serverPagination,
    paginationStart: serverPagination ? paginationRange.start : filteredCount === 0 ? 0 : (safePage - 1) * rowsPerPage + 1,
    paginationEnd: serverPagination
      ? paginationRange.end
      : filteredCount === 0
        ? 0
        : Math.min(safePage * rowsPerPage, filteredCount),
  }

  return (
    <div
      className={`h-[calc(100vh-8rem)] overflow-hidden ${JOURNAL_PAGE_BG} ${JOURNAL_DM_SANS} text-[13px] font-normal leading-relaxed text-slate-900 antialiased`}
    >
      <div className="grid h-full grid-cols-[272px,minmax(0,1fr)]">
        <SettlementJournalBatchSidebar
          tenantReady={tenantReady}
          clientBatches={clientBatches}
          feedLoaded={feedLoaded}
          sidebarRows={sidebarRows}
          selectedClientBatchId={selectedClientBatchId}
          selectClientBatch={selectClientBatch}
          liveMatchOutcome={liveMatchOutcome}
          batchMatchOutcomeCache={batchMatchOutcomeCache}
          observationTotal={observationTotal}
          observationTotalLoading={detailLoading}
          safeSidebarPage={safeSidebarPage}
          sidebarTotalPages={sidebarTotalPages}
          setSidebarPage={setSidebarPage}
          batchCommandCenterHref={batchCommandCenterHref}
        />

        <main className="flex h-full min-w-0 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <JournalPageHeader label="Settlement journal" summary={SETTLEMENT_PAGE_SUMMARY}>
              <LiveDataHint isLive={Boolean(tenantReady && feedLoaded)} source="settlement" />
              <button
                type="button"
                disabled={feedRefreshing || !tenantReady}
                onClick={() => void handleRefresh()}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {feedRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <Link
                href={batchCommandCenterHref}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Batch Command Center
              </Link>
            </JournalPageHeader>
            {feedMetaLine ? (
              <p className="mb-4 font-mono text-[12px] text-slate-500">{feedMetaLine}</p>
            ) : null}

            {selectedClientBatchId ? (
              (observationTotal ?? 0) === 0 && !detailLoading ? (
                <section className={`relative mb-4 ${COMMAND_CENTER_KPI_CARD} px-6 py-8 text-center`}>
                  <CommandCenterCardGlow />
                  <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>No settlement records</p>
                  <p className={`relative mx-auto mt-2 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>
                    Batch <span className="font-mono">{selectedClientBatchId}</span> has no settlement data yet. Upload a settlement file from Batch Command Center to populate this view.
                  </p>
                </section>
              ) : (
                <>
                  <SettlementJournalHeroBanner
                    onExport={() => {
                      downloadCsv(
                        `settlement-observations${selectedClientBatchId ? `-${selectedClientBatchId}` : ''}.csv`,
                        observationsToCsv(filteredRows),
                      )
                    }}
                    exportDisabled={filteredRows.length === 0}
                    filteredCount={filteredCount}
                    filtersActive={filtersActive}
                  />
                  <SettlementJournalDataHealthPanel />

                  <SettlementJournalActivityPanel vm={activityVm} />
                </>
              )
            ) : (
              <section className={`relative mb-4 ${COMMAND_CENTER_KPI_CARD} px-6 py-8 text-center`}>
                <CommandCenterCardGlow />
                <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Settlement journal</p>
                <p className={`relative mx-auto mt-2 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>
                  Select a client batch from the sidebar to browse canonical settlement observations.
                </p>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
