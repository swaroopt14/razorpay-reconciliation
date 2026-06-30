'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { Glyph, LiveDataHint } from '../../shared'
import {
  BatchIntakePanel,
  type BatchIntakeSnapshot,
  type BatchUploadStatus,
  type IntentIngestSuccessPayload,
  type SettlementIngestSuccessPayload,
} from './BatchIntakePanel'
import { HydrationSafeLocaleTime } from '../../command-center/HydrationSafeLocaleTime'
import {
  derivePaymentProofTimeline,
  paymentProofProgressPct,
  type BatchSummary,
} from '@/services/payout-command/batch-model'
import { useBatchOperationsFeed } from '@/services/payout-command/batch-operations/useBatchOperationsFeed'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'
import { BatchAdvancedDetails } from './BatchAdvancedDetails'
import { BatchIngestSuccessDialog } from './BatchIngestSuccessDialog'
import { BatchProgressPanel } from './BatchProgressPanel'
import { PaymentStatusBreakdown } from './PaymentStatusBreakdown'
import { ReviewItemsTable } from './ReviewItemsTable'
import type { BatchRow } from '@/services/payout-command/batch-model'
import { mapPaymentStatusBreakdown } from '../mappers/mapBatchReviewKpis'

function summaryFromEngineRows(
  intentCount: number,
  successCount: number,
  failureCount: number,
  pendingCount: number,
  processingCount: number,
): BatchSummary {
  const totalRows = intentCount + failureCount
  if (totalRows <= 0) {
    return { totalRows: 0, processed: 0, success: 0, failed: 0, pending: 0 }
  }
  const success = successCount
  const failed = failureCount
  const pending = pendingCount
  const processed = success + failed + pending + processingCount
  return { totalRows, processed, success, failed, pending }
}

type IngestDialogState =
  | { kind: 'intent'; batchId: string; fileName: string }
  | { kind: 'settlement'; batchId: string; fileName: string }
  | null


export default function BatchCommandCenterClient() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSandboxRoute = pathname?.startsWith('/sandbox') ?? false
  const { tenantId, tenantReady } = useSessionTenant()

  const initialBatchFromUrl = searchParams.get('batch_id')?.trim() ?? ''
  const [committedBatchId, setCommittedBatchId] = useState(initialBatchFromUrl)
  const [intakeSnapshot, setIntakeSnapshot] = useState<BatchIntakeSnapshot>({
    intakeStep: 'idle',
    intentFileName: null,
    intentIngestOk: false,
    settlementFileName: null,
    settlementIngestOk: false,
    uploadedFileName: null,
    uploadState: 'idle',
    settlementBatchId: null,
  })
  const [ingestDialog, setIngestDialog] = useState<IngestDialogState>(null)
  const [intentFilePreviewRows, setIntentFilePreviewRows] = useState<BatchRow[]>([])
  const [settlementFilePreviewRows, setSettlementFilePreviewRows] = useState<BatchRow[]>([])
  const [uploadStatus, setUploadStatus] = useState<BatchUploadStatus>({ state: 'idle', message: null })
  const [toolbarNotice, setToolbarNotice] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const batchReferenceRef = useRef<HTMLInputElement | null>(null)
  const toolbarNoticeTimerRef = useRef<number | null>(null)

  const activeBatchId = useMemo(() => {
    const fromInput = committedBatchId.trim()
    const fromIntake = intakeSnapshot.settlementBatchId?.trim() ?? ''
    return fromInput || fromIntake
  }, [committedBatchId, intakeSnapshot.settlementBatchId])

  const feed = useBatchOperationsFeed({
    enabled: tenantReady,
    batchId: activeBatchId,
  })

  // Browser back/forward or external ?batch_id= link — not fired while the user is typing.
  useEffect(() => {
    const urlBatch = searchParams.get('batch_id')?.trim() ?? ''
    setCommittedBatchId(urlBatch)
  }, [searchParams])

  const syncBatchIdToUrl = useCallback(
    (id: string) => {
      const trimmed = id.trim()
      const params = new URLSearchParams(searchParams.toString())
      if (trimmed) params.set('batch_id', trimmed)
      else params.delete('batch_id')
      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  useEffect(() => {
    const urlBatch = searchParams.get('batch_id')?.trim() ?? ''
    const nextBatch = committedBatchId.trim()
    if (urlBatch === nextBatch) return
    syncBatchIdToUrl(committedBatchId)
  }, [committedBatchId, searchParams, syncBatchIdToUrl])

  const handleBatchIdCommit = useCallback((value: string) => {
    setCommittedBatchId(value)
  }, [])

  const showToolbarNotice = useCallback((message: string) => {
    setToolbarNotice(message)
    if (toolbarNoticeTimerRef.current) window.clearTimeout(toolbarNoticeTimerRef.current)
    toolbarNoticeTimerRef.current = window.setTimeout(() => {
      setToolbarNotice(null)
      toolbarNoticeTimerRef.current = null
    }, 4500)
  }, [])

  useEffect(() => {
    return () => {
      if (toolbarNoticeTimerRef.current) window.clearTimeout(toolbarNoticeTimerRef.current)
    }
  }, [])

  const onIntentIngestSuccess = useCallback(
    (payload: IntentIngestSuccessPayload) => {
      const batchId = payload.effectiveBatch ?? payload.batchId
      setIntentFilePreviewRows(payload.parsedRows)
      setIngestDialog({ kind: 'intent', batchId, fileName: payload.fileName })
      void feed.refreshBatchFeed()
    },
    [feed],
  )

  const onSettlementIngestSuccess = useCallback(
    (payload: SettlementIngestSuccessPayload) => {
      setSettlementFilePreviewRows(payload.parsedRows)
      setIngestDialog({ kind: 'settlement', batchId: payload.batchId, fileName: payload.fileName })
      void feed.refreshBatchFeed()
    },
    [feed],
  )

  const scrollToIntakeStep = useCallback((step: 1 | 2) => {
    const el = document.getElementById(step === 1 ? 'batch-intake-step-1' : 'batch-intake-step-2')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const focusBatchReference = useCallback(() => {
    batchReferenceRef.current?.focus()
    batchReferenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const engineSummary = useMemo(() => {
    const success = feed.intentRows.filter((r) => r.status === 'Confirmed').length
    const pending = feed.intentRows.filter((r) => r.status === 'Pending').length
    const processing = feed.intentRows.filter((r) => r.status === 'In Progress').length
    const failed = feed.failureRows.length
    return summaryFromEngineRows(feed.intentRows.length + failed, success, failed, pending, processing)
  }, [feed.intentRows, feed.failureRows])

  const statCardsSummary = feed.intelligenceSummary ?? engineSummary
  const intentJournalHref = useMemo(() => {
    const base = isSandboxRoute ? '/sandbox?dock=grid' : '/payout-command-view/today?dock=grid'
    if (!activeBatchId) return base
    return `${base}&batch_id=${encodeURIComponent(activeBatchId)}`
  }, [activeBatchId, isSandboxRoute])

  const failuresTabHref = useMemo(() => `${intentJournalHref}&tab=failures`, [intentJournalHref])

  const settlementJournalHref = useMemo(() => {
    if (!activeBatchId) return null
    const base = isSandboxRoute
      ? '/sandbox?dock=settlement'
      : '/payout-command-view/today?dock=settlement'
    return `${base}&client_batch_id=${encodeURIComponent(activeBatchId)}`
  }, [activeBatchId, isSandboxRoute])

  const pieSlices = useMemo(() => mapPaymentStatusBreakdown(statCardsSummary), [statCardsSummary])

  const pipelineBusy = useMemo(
    () =>
      intakeSnapshot.intakeStep === 'intent_uploading' ||
      intakeSnapshot.intakeStep === 'settlement_uploading' ||
      uploadStatus.state === 'syncing' ||
      (feed.detailLoading && Boolean(activeBatchId)),
    [intakeSnapshot, uploadStatus.state, feed.detailLoading, activeBatchId],
  )

  const pipelineSteps = useMemo(
    () => derivePaymentProofTimeline(statCardsSummary, intakeSnapshot),
    [statCardsSummary, intakeSnapshot],
  )

  const pipelineProgressPct = useMemo(
    () => paymentProofProgressPct(pipelineSteps),
    [pipelineSteps],
  )

  const shareBatchSummary = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const batchLabel = activeBatchId || '—'
    const tid = tenantId.trim() || '—'
    const text = [
      'Zord — Payment Batch Review snapshot',
      '',
      `Tenant: ${tid}`,
      `Batch id: ${batchLabel}`,
      `Total rows: ${statCardsSummary.totalRows}`,
      `Confirmed: ${statCardsSummary.success} · Pending: ${statCardsSummary.pending} · Failed: ${statCardsSummary.failed}`,
      '',
      `Open: ${url}`,
    ].join('\n')
    const subject = `Batch status · ${batchLabel}`
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: subject, text, url })
        showToolbarNotice('Shared via your device.')
        return
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return
      }
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    showToolbarNotice('Opened email draft with batch summary.')
  }, [activeBatchId, showToolbarNotice, statCardsSummary, tenantId])

  const createPaymentHref = '/payout-command-view/create-payment'

  return (
    <div
      className="payout-command-console text-[13px] font-normal leading-relaxed text-[#1A1A1A] antialiased"
      data-testid="batch-review-page"
    >
      <div className="w-full space-y-5 p-4 sm:p-5 lg:p-6">
        <header>
          <h1 className="text-[22px] font-bold tracking-tight text-[#0f172a]">{BATCH_REVIEW_COPY.pageTitle}</h1>
          <p className="mt-1 text-[14px] text-[#64748b]">{BATCH_REVIEW_COPY.pageSubtitle}</p>
        </header>

        <div className="flex flex-col gap-3 rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => scrollToIntakeStep(1)}
              className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#0f172a] transition hover:bg-slate-50"
            >
              {BATCH_REVIEW_COPY.toolbar.uploadPaymentFile}
            </button>
            <button
              type="button"
              onClick={() => scrollToIntakeStep(2)}
              className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#0f172a] transition hover:bg-slate-50"
            >
              {BATCH_REVIEW_COPY.toolbar.uploadSettlementFile}
            </button>
            <Link
              href={createPaymentHref}
              className="inline-flex h-9 items-center rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#0f172a] transition hover:bg-slate-50"
            >
              {BATCH_REVIEW_COPY.toolbar.createPaymentManually}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LiveDataHint isLive={Boolean(tenantReady && feed.feedLoaded)} source={BATCH_REVIEW_COPY.toolbar.liveSource} />
            {feed.syncAt ? (
              <span className="text-[12px] text-[#64748b]">
                Synced <HydrationSafeLocaleTime date={feed.syncAt} />
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={intentJournalHref}
              className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3.5 text-[14px] font-medium text-[#0f172a] transition hover:bg-slate-50"
            >
              {BATCH_REVIEW_COPY.toolbar.intentJournal}
            </Link>
            {settlementJournalHref ? (
              <Link
                href={settlementJournalHref}
                className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3.5 text-[14px] font-medium text-[#0f172a] transition hover:bg-slate-50"
              >
                {BATCH_REVIEW_COPY.toolbar.settlementJournal}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void feed.refreshBatchFeed()}
              disabled={feed.detailLoading}
              title={BATCH_REVIEW_COPY.toolbar.refresh}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#64748b] transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Glyph name="refresh" className={`h-[15px] w-[15px] ${feed.detailLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              disabled={shareBusy}
              onClick={() => {
                void (async () => {
                  setShareBusy(true)
                  try {
                    await shareBatchSummary()
                  } finally {
                    setShareBusy(false)
                  }
                })()
              }}
              className="flex h-9 items-center gap-2 rounded-lg bg-[#2563eb] px-4 text-[14px] font-medium text-white transition hover:bg-[#1d4ed8] disabled:opacity-70"
            >
              {shareBusy ? 'Opening…' : BATCH_REVIEW_COPY.toolbar.share}
            </button>
          </div>
        </div>

        {toolbarNotice ? (
          <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] font-medium text-slate-800">
            {toolbarNotice}
          </div>
        ) : null}

        {feed.feedError ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
            {feed.feedError}
          </div>
        ) : null}

        <BatchAdvancedDetails
          batchId={committedBatchId}
          onBatchIdChange={handleBatchIdCommit}
          onAfterFetch={() => void feed.refreshBatchFeed()}
        />

        <BatchIntakePanel
          committedBatchId={committedBatchId}
          batchReferenceRef={batchReferenceRef}
          onBatchIdCommit={handleBatchIdCommit}
          isSandboxRoute={isSandboxRoute}
          onIntentIngestSuccess={onIntentIngestSuccess}
          onSettlementIngestSuccess={onSettlementIngestSuccess}
          onSnapshotChange={setIntakeSnapshot}
          onUploadStatusChange={setUploadStatus}
          onIntentUploadFailed={() => void feed.refreshBatchFeed()}
        />

        <BatchProgressPanel
          steps={pipelineSteps}
          progressPct={pipelineProgressPct}
          busy={pipelineBusy}
        />

        {uploadStatus.message ? (
          <div
            role="status"
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-[13px] font-medium ${
              uploadStatus.state === 'failed'
                ? 'border-red-200 bg-red-50 text-red-900'
                : uploadStatus.state === 'synced'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}
          >
            {uploadStatus.state === 'synced' && (
              <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {uploadStatus.message}
          </div>
        ) : null}

        <PaymentStatusBreakdown slices={pieSlices} hasBatch={Boolean(activeBatchId) || statCardsSummary.totalRows > 0} />

        <ReviewItemsTable
          failures={feed.failureRows}
          intents={feed.intentRows}
          settlementRows={feed.settlementObservationRows}
          intentFileRows={intentFilePreviewRows}
          settlementFileRows={settlementFilePreviewRows}
          failuresTabHref={failuresTabHref}
          loading={feed.detailLoading && !feed.feedLoaded}
        />
      </div>

      {ingestDialog ? (
        <BatchIngestSuccessDialog
          kind={ingestDialog.kind}
          batchId={ingestDialog.batchId}
          fileName={ingestDialog.fileName}
          intentJournalHref={intentJournalHref}
          settlementJournalHref={settlementJournalHref}
          onClose={() => setIngestDialog(null)}
        />
      ) : null}
    </div>
  )
}
