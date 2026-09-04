'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { DEMO_BATCH_LABEL } from '@/services/payout-command/demo/ycDemoConstants'
import {
  markBatchDispatched,
  useDispatchedBatchId,
} from '@/services/payout-command/demo/demoBatchReadiness'
import { DemoTablePager, type DemoTablePageSize } from '../demo/DemoTablePager'
import { formatJournalMoney } from '../intent-journal/formatJournalMoney'
import { useJournalBatchMetrics } from '../intent-journal/hooks/useJournalBatchMetrics'
import { useJournalIntentRows } from '../intent-journal/hooks/useJournalIntentRows'
import type { JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import {
  HeroAmountCard,
  MiniMetricCard,
  PageHeader,
  PaymentsEmptyState,
  RZ_CARD,
  RZ_MUTED,
  RZ_PAGE,
  RZ_WRAP,
  StatusBadge,
  UnderlineTabs,
} from './razorpayChrome'
import { PayoutDetailDrawer } from './PayoutDetailDrawer'
import { PaymentProviderBadge } from './PaymentProviderBadge'
import {
  isFailedPayoutStatus,
  isReviewPayoutStatus,
  isSuccessfulPayoutStatus,
  mapIntentRowToPayoutStatus,
  payoutStatusTone,
} from './razorpayPayoutStatus'

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

const DEFAULT_PAGE_SIZE: DemoTablePageSize = 20

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function BatchDetailSurface({ batchId }: { batchId: string }) {
  const router = useRouter()
  const { mode } = useEnvironment()
  const { tenantId, tenantReady } = useSessionTenant()
  const [range, setRange] = useState('today')
  const [tab, setTab] = useState<'payments' | 'review'>('payments')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<DemoTablePageSize>(DEFAULT_PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dispatchedBatchId = useDispatchedBatchId()
  const alreadyDispatched = dispatchedBatchId === batchId

  function openProof() {
    markBatchDispatched(batchId)
    router.push(`/proof?demo=sandbox&batch_id=${encodeURIComponent(batchId)}`)
  }

  const enabled = tenantReady && Boolean(batchId.trim())
  const { batch, metrics, loading: metricsLoading, error: metricsError } = useJournalBatchMetrics(
    batchId,
    enabled,
  )
  const intentFeed = useJournalIntentRows(batchId, enabled, tenantId)

  const intents = intentFeed.rows
  const title = mode === 'sandbox' ? DEMO_BATCH_LABEL : batchId

  const kpis = useMemo(() => {
    const instructionCount =
      (metrics?.instructionCount != null && metrics.instructionCount > 0
        ? metrics.instructionCount
        : null) ??
      (intents.length > 0 ? intents.length : null) ??
      batch?.transactions ??
      0
    const amount = metrics?.intendedValue ?? batch?.totalValue ?? 0

    let successCount = 0
    let successAmount = 0
    let reviewCount = 0
    let reviewAmount = 0
    let failedCount = 0
    let failedAmount = 0

    for (const row of intents) {
      const status = mapIntentRowToPayoutStatus(row)
      const rowAmount = Number.isFinite(row.amount) ? row.amount : 0
      if (isSuccessfulPayoutStatus(status)) {
        successCount += 1
        successAmount += rowAmount
      } else if (isReviewPayoutStatus(status)) {
        reviewCount += 1
        reviewAmount += rowAmount
      } else if (isFailedPayoutStatus(status)) {
        failedCount += 1
        failedAmount += rowAmount
      }
    }

    return {
      instructionCount: Number(instructionCount) || 0,
      amount: roundMoney(amount),
      reviewCount,
      reviewAmount: roundMoney(reviewAmount),
      failedCount,
      failedAmount: roundMoney(failedAmount),
      successCount,
      successAmount: roundMoney(successAmount),
    }
  }, [metrics, intents, batch])

  const reviewRows = useMemo(
    () =>
      intents.filter((row) => {
        const status = mapIntentRowToPayoutStatus(row)
        return isReviewPayoutStatus(status) || isFailedPayoutStatus(status)
      }),
    [intents],
  )

  const filteredIntents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return intents
    return intents.filter((row) => {
      const hay = [
        row.requestId,
        row.zordId,
        row.reference,
        row.beneficiaryName,
        row.clientBatchRef,
        String(row.amount),
        mapIntentRowToPayoutStatus(row),
        (row.rawIntent as { utr?: string } | undefined)?.utr,
        (row.rawIntent as { fund_account_id?: string } | undefined)?.fund_account_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [intents, search])

  const filteredReview = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reviewRows
    return reviewRows.filter((row) => {
      const hay = [
        row.requestId,
        row.reference,
        row.beneficiaryName,
        row.infoSummary,
        mapIntentRowToPayoutStatus(row),
        (row.rawIntent as { status_details?: { reason?: string; description?: string } } | undefined)
          ?.status_details?.reason,
        (row.rawIntent as { status_details?: { description?: string } } | undefined)?.status_details
          ?.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [reviewRows, search])

  useEffect(() => {
    setPage(1)
  }, [batchId, search, tab, pageSize])

  const paymentsTotalPages = Math.max(1, Math.ceil(filteredIntents.length / pageSize))
  const safePaymentsPage = Math.min(page, paymentsTotalPages)
  const pagedIntents = useMemo(() => {
    const start = (safePaymentsPage - 1) * pageSize
    return filteredIntents.slice(start, start + pageSize)
  }, [filteredIntents, safePaymentsPage, pageSize])

  const reviewTotalPages = Math.max(1, Math.ceil(filteredReview.length / pageSize))
  const safeReviewPage = Math.min(page, reviewTotalPages)
  const pagedReview = useMemo(() => {
    const start = (safeReviewPage - 1) * pageSize
    return filteredReview.slice(start, start + pageSize)
  }, [filteredReview, safeReviewPage, pageSize])

  const selectedRow = useMemo(
    () => intents.find((row) => row.requestId === selectedId) ?? null,
    [intents, selectedId],
  )

  const loading = metricsLoading || intentFeed.loading
  const error = metricsError || intentFeed.error

  const refresh = useCallback(() => {
    void intentFeed.refetch()
  }, [intentFeed])

  return (
    <div className={RZ_PAGE}>
      <div className={`${RZ_WRAP} ${selectedRow ? 'pr-[min(560px,100%)]' : ''}`}>
        <div className="mb-4">
          <Link
            href="/transactions?demo=sandbox"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#528FF0] hover:underline"
          >
            ← Back to Transactions
          </Link>
        </div>

        <PageHeader
          title={title}
          range={range}
          onRangeChange={setRange}
          rangeOptions={RANGE_OPTIONS}
          docsHref="https://razorpay.com/docs/payments/"
          actions={
            alreadyDispatched ? (
              <button
                type="button"
                onClick={() => router.push(`/proof?demo=sandbox&batch_id=${encodeURIComponent(batchId)}`)}
                className="inline-flex h-9 items-center rounded-[6px] border border-[#E6E8EB] bg-white px-3.5 text-[13px] font-semibold text-[#1A1A1A] hover:bg-[#FAFBFC]"
              >
                Open proof
              </button>
            ) : (
              <button
                type="button"
                onClick={openProof}
                className="inline-flex h-9 items-center rounded-[6px] bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
              >
                Dispatch
              </button>
            )
          }
        />
        <p className="mt-1 font-mono text-[12px] text-[#8F8F8F]">{batchId}</p>

        <div className="mt-5 space-y-3">
          <HeroAmountCard
            label="Batch Amount"
            amount={formatJournalMoney(kpis.amount)}
            subtitle={`from ${kpis.instructionCount.toLocaleString('en-IN')} payouts in this batch`}
            info="Total value of payout instructions in this batch."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetricCard
              label="Successful"
              value={formatJournalMoney(kpis.successAmount)}
              subtitle={`${kpis.successCount.toLocaleString('en-IN')} processed`}
              info="Fully processed payouts in this batch"
              onClick={() => setTab('payments')}
            />
            <MiniMetricCard
              label="Needs review"
              value={formatJournalMoney(kpis.reviewAmount)}
              subtitle={`${kpis.reviewCount.toLocaleString('en-IN')} open · awaiting action`}
              info="Processing, pending, scheduled, or queued payouts"
              warn
              hrefLabel="View All"
              onClick={() => setTab('review')}
            />
            <MiniMetricCard
              label="Failed"
              value={formatJournalMoney(kpis.failedAmount)}
              subtitle={`${kpis.failedCount.toLocaleString('en-IN')} payouts`}
              info="Failed, rejected, cancelled, or reversed payouts"
              warn
              onClick={() => setTab('review')}
            />
          </div>
        </div>

        <div className="mt-8">
          <UnderlineTabs
            items={[
              { id: 'payments', label: `Payments (${kpis.instructionCount})` },
              {
                id: 'review',
                label: `Review queue (${kpis.reviewCount + kpis.failedCount})`,
              },
            ]}
            active={tab}
            onChange={(id) => setTab(id as 'payments' | 'review')}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search payout id, UTR, recipient…"
              className="h-9 w-full max-w-md rounded-[6px] border border-[#E6E8EB] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none placeholder:text-[#A0A4AB] focus:border-[#528FF0]"
            />
            <button
              type="button"
              onClick={refresh}
              className="h-9 rounded-[6px] border border-[#E6E8EB] bg-white px-3 text-[13px] font-medium text-[#1A1A1A] hover:bg-[#FAFBFC]"
            >
              Refresh
            </button>
          </div>

          {error ? (
            <p className="mt-4 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
              {error}
            </p>
          ) : null}

          <div className={`${RZ_CARD} mt-4 overflow-hidden`}>
            {loading && intents.length === 0 ? (
              <p className={`px-6 py-10 text-center ${RZ_MUTED}`}>Loading batch…</p>
            ) : tab === 'payments' ? (
              filteredIntents.length === 0 ? (
                <PaymentsEmptyState
                  title="No payouts in this batch"
                  body="Upload payment instructions from Batch Command Center to populate this batch."
                  actionLabel="Open Batch Command Center"
                  onAction={() => router.push('/sandbox/batch-command-center?demo=sandbox')}
                />
              ) : (
                <>
                  <PaymentsTable
                    rows={pagedIntents}
                    selectedId={selectedId}
                    onSelect={(row) => setSelectedId(row.requestId)}
                  />
                  <DemoTablePager
                    page={safePaymentsPage}
                    pageSize={pageSize}
                    total={filteredIntents.length}
                    noun="payouts"
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              )
            ) : filteredReview.length === 0 ? (
              <PaymentsEmptyState
                title="No items in review queue"
                body="Pending, queued, failed, or reversed payouts will appear here."
              />
            ) : (
              <>
                <ReviewTable
                  rows={pagedReview}
                  selectedId={selectedId}
                  onSelect={(row) => setSelectedId(row.requestId)}
                />
                <DemoTablePager
                  page={safeReviewPage}
                  pageSize={pageSize}
                  total={filteredReview.length}
                  noun="review items"
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {selectedRow ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/20 xl:bg-transparent"
            aria-label="Close payout details overlay"
            onClick={() => setSelectedId(null)}
          />
          <PayoutDetailDrawer row={selectedRow} onClose={() => setSelectedId(null)} />
        </>
      ) : null}
    </div>
  )
}

function PaymentsTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: JournalIntentRow[]
  selectedId: string | null
  onSelect: (row: JournalIntentRow) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[13px]">
        <thead className="border-b border-[#EEF0F3] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
          <tr>
            <th className="px-4 py-3 font-semibold">Payout Id</th>
            <th className="px-4 py-3 font-semibold">Processor</th>
            <th className="px-4 py-3 font-semibold">Fund account</th>
            <th className="px-4 py-3 font-semibold">Recipient</th>
            <th className="px-4 py-3 text-right font-semibold">Amount</th>
            <th className="px-4 py-3 font-semibold">Mode</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">UTR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = mapIntentRowToPayoutStatus(row)
            const raw = row.rawIntent as
              | {
                  fund_account_id?: string
                  utr?: string | null
                  mode?: string
                  payment_provider?: string
                  provider_hint?: string
                }
              | undefined
            const selected = selectedId === row.requestId
            return (
              <tr
                key={row.requestId}
                onClick={() => onSelect(row)}
                className={`cursor-pointer border-t border-[#F3F4F6] hover:bg-[#FAFBFC] ${
                  selected ? 'bg-[#FFFBEB]' : ''
                }`}
              >
                <td className="px-4 py-3 font-mono text-[12px] text-[#1A1A1A]">{row.requestId}</td>
                <td className="px-4 py-3">
                  <PaymentProviderBadge
                    provider={raw?.payment_provider || raw?.provider_hint || row.paymentPartner || row.provider}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">
                  {raw?.fund_account_id || '—'}
                </td>
                <td className="px-4 py-3 text-[#334155]">{row.beneficiaryName || '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1A1A1A]">
                  {formatJournalMoney(row.amount, row.currency)}
                </td>
                <td className="px-4 py-3 text-[#6B6B6B]">
                  {raw?.mode || row.paymentMethodDetail || row.method || '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={payoutStatusTone(status)}>{status}</StatusBadge>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#8F8F8F]">{raw?.utr || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ReviewTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: JournalIntentRow[]
  selectedId: string | null
  onSelect: (row: JournalIntentRow) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[13px]">
        <thead className="border-b border-[#EEF0F3] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
          <tr>
            <th className="px-4 py-3 font-semibold">Payout Id</th>
            <th className="px-4 py-3 font-semibold">Processor</th>
            <th className="px-4 py-3 font-semibold">Recipient</th>
            <th className="px-4 py-3 text-right font-semibold">Amount</th>
            <th className="px-4 py-3 font-semibold">Reason</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = mapIntentRowToPayoutStatus(row)
            const details = (
              row.rawIntent as
                | {
                    status_details?: { reason?: string; source?: string; description?: string }
                    payment_provider?: string
                    provider_hint?: string
                  }
                | undefined
            )?.status_details
            const provider =
              (row.rawIntent as { payment_provider?: string; provider_hint?: string } | undefined)
                ?.payment_provider ||
              (row.rawIntent as { provider_hint?: string } | undefined)?.provider_hint ||
              row.paymentPartner ||
              row.provider
            const selected = selectedId === row.requestId
            return (
              <tr
                key={row.requestId}
                onClick={() => onSelect(row)}
                className={`cursor-pointer border-t border-[#F3F4F6] hover:bg-[#FAFBFC] ${
                  selected ? 'bg-[#FFFBEB]' : ''
                }`}
              >
                <td className="px-4 py-3 font-mono text-[12px] text-[#1A1A1A]">{row.requestId}</td>
                <td className="px-4 py-3">
                  <PaymentProviderBadge provider={provider} />
                </td>
                <td className="px-4 py-3 text-[#334155]">{row.beneficiaryName || '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1A1A1A]">
                  {formatJournalMoney(row.amount, row.currency)}
                </td>
                <td className="max-w-[260px] px-4 py-3 text-[#334155]">
                  {details?.description || details?.reason || row.infoSummary || '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={payoutStatusTone(status)}>{status}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-[#6B6B6B]">{details?.source || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
