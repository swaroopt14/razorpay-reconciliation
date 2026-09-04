'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { DEMO_BATCH_LABEL } from '@/services/payout-command/demo/ycDemoConstants'
import {
  markBatchDispatched,
  useDispatchedBatchId,
} from '@/services/payout-command/demo/demoBatchReadiness'
import { fetchJournalSidebarBatches } from '../intent-journal/journalBatchCache'
import { LIVE_JOURNAL_POLL_MS } from '../intent-journal/journalConstants'
import type { JournalBatchRecord } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { formatJournalMoney } from '../intent-journal/formatJournalMoney'
import {
  HeroAmountCard,
  MiniMetricCard,
  PageHeader,
  PaymentsEmptyState,
  RZ_CARD,
  RZ_MUTED,
  RZ_PAGE,
  RZ_WRAP,
  UnderlineTabs,
} from './razorpayChrome'

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

function displayBatchTitle(batchId: string, sandbox: boolean) {
  if (!sandbox) return batchId
  if (batchId.trim().toLowerCase() === 'batch-001') return DEMO_BATCH_LABEL
  return batchId
}

export function TransactionsSurface() {
  const router = useRouter()
  const { mode } = useEnvironment()
  const { tenantId, tenantReady } = useSessionTenant()
  const [batches, setBatches] = useState<JournalBatchRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState('today')
  const [tab, setTab] = useState<'payments' | 'batches'>('batches')
  const dispatchedBatchId = useDispatchedBatchId()

  function openProof(batchId: string) {
    markBatchDispatched(batchId)
    router.push(`/proof?demo=sandbox&batch_id=${encodeURIComponent(batchId)}`)
  }

  const load = useCallback(async () => {
    if (!tenantReady || !tenantId.trim()) {
      setBatches([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchJournalSidebarBatches(tenantId)
      setBatches(rows)
    } catch {
      setError('Could not load transactions.')
      setBatches([])
    } finally {
      setLoading(false)
    }
  }, [tenantId, tenantReady])

  useEffect(() => {
    void load()
    if (!tenantReady || !tenantId.trim()) return
    const id = window.setInterval(() => void load(), LIVE_JOURNAL_POLL_MS)
    return () => window.clearInterval(id)
  }, [load, tenantReady, tenantId])

  const visibleBatches = useMemo(
    () => batches.filter((b) => (b.transactions || 0) > 0 || (b.totalValue || 0) > 0),
    [batches],
  )

  const totals = useMemo(() => {
    const rows = visibleBatches
    const paymentCount = rows.reduce((s, b) => s + (b.transactions || 0), 0)
    const amount = rows.reduce((s, b) => s + (b.totalValue || 0), 0)
    const review = rows.reduce(
      (s, b) => s + (b.intelligenceCounts?.pending_count ?? b.unresolvedCount ?? 0),
      0,
    )
    const failed = rows.reduce((s, b) => s + (b.intelligenceCounts?.failed_count ?? 0), 0)
    const confirmed = rows.reduce(
      (s, b) => s + (b.confirmedCount || b.intelligenceCounts?.success_count || 0),
      0,
    )
    const reviewAmount = rows.reduce((s, b) => s + (b.reviewAmount || 0), 0)
    const failedAmount = rows.reduce((s, b) => s + (b.failedAmount || 0), 0)
    const successAmount = rows.reduce((s, b) => {
      if ((b.confirmedAmount || 0) > 0) return s + (b.confirmedAmount || 0)
      const successCount = b.confirmedCount || b.intelligenceCounts?.success_count || 0
      const tx = b.transactions || 0
      if (successCount > 0 && tx > 0 && (b.totalValue || 0) > 0) {
        return s + ((b.totalValue || 0) * successCount) / tx
      }
      // Prefer residual so Successful + Review + Failed = Collected.
      const residual = (b.totalValue || 0) - (b.reviewAmount || 0) - (b.failedAmount || 0)
      return s + Math.max(0, residual)
    }, 0)
    return { paymentCount, amount, review, failed, confirmed, reviewAmount, failedAmount, successAmount }
  }, [visibleBatches])

  function openBatch(batchId: string) {
    router.push(`/transactions/${encodeURIComponent(batchId)}?demo=sandbox`)
  }

  return (
    <div className={RZ_PAGE}>
      <div className={RZ_WRAP}>
        <PageHeader
          title="Transactions"
          range={range}
          onRangeChange={setRange}
          rangeOptions={RANGE_OPTIONS}
          docsHref="https://razorpay.com/docs/payments/"
          actions={
            visibleBatches[0] ? (
              dispatchedBatchId === visibleBatches[0].batchId ? (
                <button
                  type="button"
                  onClick={() => router.push(`/proof?demo=sandbox&batch_id=${encodeURIComponent(visibleBatches[0].batchId)}`)}
                  className="inline-flex h-9 items-center rounded-[6px] border border-[#E6E8EB] bg-white px-3.5 text-[13px] font-semibold text-[#1A1A1A] hover:bg-[#FAFBFC]"
                >
                  Open proof
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openProof(visibleBatches[0].batchId)}
                  className="inline-flex h-9 items-center rounded-[6px] bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
                >
                  Dispatch
                </button>
              )
            ) : null
          }
        />

        <div className="mt-5 space-y-3">
          <HeroAmountCard
            label="Collected Amount"
            amount={formatJournalMoney(totals.amount)}
            subtitle={`from ${totals.paymentCount.toLocaleString('en-IN')} captured payments`}
            info="Sum of payment instructions across batches in this workspace."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetricCard
              label="Successful"
              value={formatJournalMoney(totals.successAmount)}
              subtitle={`${totals.confirmed.toLocaleString('en-IN')} processed`}
              info="Processed payouts across batches"
              onClick={() => setTab('batches')}
            />
            <MiniMetricCard
              label="Needs review"
              value={formatJournalMoney(totals.reviewAmount)}
              subtitle={`${totals.review.toLocaleString('en-IN')} open · awaiting action`}
              info="Processing, pending, scheduled, or queued payouts awaiting action"
              warn
              hrefLabel="View All"
              onClick={() => router.push('/exceptions?demo=sandbox')}
            />
            <MiniMetricCard
              label="Failed"
              value={formatJournalMoney(totals.failedAmount)}
              subtitle={`${totals.failed.toLocaleString('en-IN')} payments`}
              info="Failed, rejected, cancelled, or reversed payouts"
              warn
              onClick={() => setTab('payments')}
            />
          </div>
        </div>

        <div className="mt-8">
          <UnderlineTabs
            items={[
              { id: 'batches', label: 'Batches' },
              { id: 'payments', label: 'Payments' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as 'payments' | 'batches')}
          />

          {error ? (
            <p className="mt-4 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
              {error}
            </p>
          ) : null}

          <div className={`${RZ_CARD} mt-0 rounded-t-none border-t-0`}>
            {loading ? (
              <p className={`px-6 py-10 text-center ${RZ_MUTED}`}>Loading transactions…</p>
            ) : tab === 'batches' ? (
              visibleBatches.length === 0 ? (
                <PaymentsEmptyState
                  title="Start collecting payments"
                  body="Use Payment Links, Payment Pages, Payment Gateway, and others to collect payments from your customers"
                  actionLabel="Explore payment products"
                  onAction={() => router.push('/sandbox/batch-command-center?demo=sandbox')}
                />
              ) : (
                <ul className="divide-y divide-[#EEF0F3]">
                  {visibleBatches.map((batch) => (
                    <li key={batch.batchId}>
                      <button
                        type="button"
                        onClick={() => openBatch(batch.batchId)}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#FAFBFC]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">
                            {displayBatchTitle(batch.batchId, mode === 'sandbox')}
                          </p>
                          {mode === 'sandbox' ? (
                            <p className="mt-0.5 font-mono text-[11px] text-[#8F8F8F]">{batch.batchId}</p>
                          ) : null}
                          <p className={`mt-0.5 ${RZ_MUTED}`}>
                            {(batch.transactions || 0).toLocaleString('en-IN')} payments
                            <span className="mx-1.5 text-[#D0D4DA]">·</span>
                            {formatJournalMoney(batch.totalValue || 0)}
                          </p>
                        </div>
                        <span className="text-[13px] font-medium text-[#528FF0]">Open →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : visibleBatches.length === 0 ? (
              <PaymentsEmptyState
                title="Start collecting payments"
                body="Use Payment Links, Payment Pages, Payment Gateway, and others to collect payments from your customers"
                actionLabel="Explore payment products"
                onAction={() => router.push('/sandbox/batch-command-center?demo=sandbox')}
              />
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-[14px] font-semibold text-[#1A1A1A]">Open a batch to see payments</p>
                <p className={`mt-1 ${RZ_MUTED}`}>
                  Payment rows live inside each batch detail page, same as Razorpay settlement views.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('batches')}
                  className="mt-4 text-[13px] font-medium text-[#528FF0] hover:underline"
                >
                  View batches →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
