'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  getRazorpaySettlements,
  getSettlementReconCombined,
} from '@/services/payout-command/prod-api/financeApi'
import type {
  RazorpaySettlement,
  RazorpaySettlementReconLine,
} from '@/services/payout-command/prod-api/financeTypes'
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
import { formatPaise } from './reasonCopy'
import { payoutStatusBucket } from './payoutReconCopy'

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

const DETAIL_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'matched', label: 'Matched' },
  { id: 'unresolved', label: 'Not resolved' },
  { id: 'failed', label: 'Failed' },
  { id: 'all', label: 'All lines' },
] as const

type DetailTab = (typeof DETAIL_TABS)[number]['id']

function settlementTone(status: string): 'captured' | 'pending' | 'failed' | 'created' {
  const s = status.toLowerCase()
  if (s === 'processed') return 'captured'
  if (s === 'failed') return 'failed'
  if (s === 'created' || s === 'initiated') return 'pending'
  return 'created'
}

function formatUnix(ts?: number | null) {
  if (ts == null || !Number.isFinite(ts)) return '—'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function lineBucket(line: RazorpaySettlementReconLine): 'matched' | 'unresolved' | 'failed' {
  const explicit = String(line.finance_bucket || '').toLowerCase()
  if (explicit === 'matched' || explicit === 'unresolved' || explicit === 'failed') {
    return explicit
  }
  const bucket = payoutStatusBucket(line.provider_status || '')
  if (bucket === 'processed') return 'matched'
  if (bucket === 'review') return 'unresolved'
  return 'failed'
}

function resultTone(result?: string): 'captured' | 'pending' | 'failed' | 'created' {
  const r = String(result || '').toUpperCase()
  if (r === 'MATCHED') return 'captured'
  if (r === 'VARIANCE' || r === 'CONFLICTED' || r === 'AMBIGUOUS') return 'pending'
  if (r === 'UNRESOLVED') return 'failed'
  return 'created'
}

export function SettlementDetailSurface({ settlementId }: { settlementId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') || 'overview') as DetailTab
  const [range, setRange] = useState('all')
  const [tab, setTab] = useState<DetailTab>(
    DETAIL_TABS.some((t) => t.id === initialTab) ? initialTab : 'overview',
  )
  const [search, setSearch] = useState('')
  const [settlement, setSettlement] = useState<RazorpaySettlement | null>(null)
  const [lines, setLines] = useState<RazorpaySettlementReconLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [listRes, reconRes] = await Promise.all([
      getRazorpaySettlements('all'),
      getSettlementReconCombined(settlementId),
    ])
    const header =
      (listRes.data?.items ?? []).find((row) => row.id === settlementId) ?? null
    if (!listRes.ok || !header) {
      setError(listRes.status === 401 ? 'Sign in to load settlement.' : 'Settlement not found.')
      setSettlement(null)
      setLines([])
      setLoading(false)
      return
    }
    setSettlement(header)
    if (!reconRes.ok || !reconRes.data) {
      setError('Could not load settlement lines.')
      setLines([])
      setLoading(false)
      return
    }
    setLines(reconRes.data.items ?? [])
    setLoading(false)
  }, [settlementId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = searchParams.get('tab') as DetailTab | null
    if (t && DETAIL_TABS.some((x) => x.id === t)) setTab(t)
  }, [searchParams])

  const buckets = useMemo(() => {
    let matchedCount = 0
    let matchedAmount = 0
    let unresolvedCount = 0
    let unresolvedAmount = 0
    let failedCount = 0
    let failedAmount = 0
    for (const line of lines) {
      const amt = Number(line.amount) || 0
      const b = lineBucket(line)
      if (b === 'matched') {
        matchedCount += 1
        matchedAmount += amt
      } else if (b === 'unresolved') {
        unresolvedCount += 1
        unresolvedAmount += amt
      } else {
        failedCount += 1
        failedAmount += amt
      }
    }
    return {
      matchedCount,
      matchedAmount,
      unresolvedCount,
      unresolvedAmount,
      failedCount,
      failedAmount,
    }
  }, [lines])

  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lines.filter((line) => {
      if (tab === 'matched' && lineBucket(line) !== 'matched') return false
      if (tab === 'unresolved' && lineBucket(line) !== 'unresolved') return false
      if (tab === 'failed' && lineBucket(line) !== 'failed') return false
      if (tab === 'overview') return false
      if (!q) return true
      const hay = [
        line.entity_id,
        line.payment_id,
        line.order_id,
        line.utr,
        line.provider_status,
        line.reconciliation_result,
        line.reason,
        line.description,
        String(line.amount),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [lines, tab, search])

  const title = settlement?.batch_label || settlementId

  return (
    <div className={RZ_PAGE}>
      <div className={RZ_WRAP}>
        <div className="mb-4">
          <button
            type="button"
            onClick={() => router.push('/settlements?demo=sandbox')}
            className="text-[13px] font-medium text-[#528FF0] hover:underline"
          >
            ← Settlements
          </button>
        </div>

        <PageHeader
          title={title}
          range={range}
          onRangeChange={setRange}
          rangeOptions={RANGE_OPTIONS}
          docsHref="https://razorpay.com/docs/payments/settlements/"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[#64748B]">
          <span className="font-mono text-[12px] text-[#8F8F8F]">{settlementId}</span>
          {settlement ? <StatusBadge tone={settlementTone(settlement.status)}>{settlement.status}</StatusBadge> : null}
          {settlement?.utr ? (
            <span className="font-mono text-[12px]">UTR {settlement.utr}</span>
          ) : null}
        </div>

        <div className="mt-5 space-y-3">
          <HeroAmountCard
            label="Settlement net"
            amount={formatPaise(settlement?.amount || 0, 2)}
            subtitle={`${(settlement?.items_count ?? lines.length).toLocaleString('en-IN')} lines · fees ${formatPaise(settlement?.fees || 0)} · tax ${formatPaise(settlement?.tax || 0)}`}
            info="Net settlement amount for this cycle (gross − fees − tax)."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetricCard
              label="Matched"
              value={formatPaise(buckets.matchedAmount, 2)}
              subtitle={`${buckets.matchedCount.toLocaleString('en-IN')} lines`}
              info="Processed provider status — same demo spine as Reconciliation"
              onClick={() => setTab('matched')}
            />
            <MiniMetricCard
              label="Not resolved"
              value={formatPaise(buckets.unresolvedAmount, 2)}
              subtitle={`${buckets.unresolvedCount.toLocaleString('en-IN')} lines`}
              info="Pending / processing / queued / scheduled"
              warn
              hrefLabel="View All"
              onClick={() => setTab('unresolved')}
            />
            <MiniMetricCard
              label="Failed"
              value={formatPaise(buckets.failedAmount, 2)}
              subtitle={`${buckets.failedCount.toLocaleString('en-IN')} lines`}
              info="Failed / reversed / rejected / cancelled"
              warn
              onClick={() => setTab('failed')}
            />
          </div>
        </div>

        <div className="mt-8">
          <UnderlineTabs
            items={DETAIL_TABS.map((t) => {
              if (t.id === 'matched') return { id: t.id, label: `Matched (${buckets.matchedCount})` }
              if (t.id === 'unresolved')
                return { id: t.id, label: `Not resolved (${buckets.unresolvedCount})` }
              if (t.id === 'failed') return { id: t.id, label: `Failed (${buckets.failedCount})` }
              if (t.id === 'all') return { id: t.id, label: `All lines (${lines.length})` }
              return { id: t.id, label: t.label }
            })}
            active={tab}
            onChange={(id) => setTab(id as DetailTab)}
          />

          {tab !== 'overview' ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search payout id, UTR, reason…"
                className="h-9 w-full max-w-md rounded-[6px] border border-[#E6E8EB] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none placeholder:text-[#A0A4AB] focus:border-[#528FF0]"
              />
              <button
                type="button"
                onClick={() => void load()}
                className="h-9 rounded-[6px] border border-[#E6E8EB] bg-white px-3 text-[13px] font-medium text-[#1A1A1A] hover:bg-[#FAFBFC]"
              >
                Refresh
              </button>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
              {error}
            </p>
          ) : null}

          <div className={`${RZ_CARD} mt-4 overflow-hidden`}>
            {loading ? (
              <p className={`px-6 py-10 text-center ${RZ_MUTED}`}>Loading settlement…</p>
            ) : tab === 'overview' ? (
              <div className="space-y-4 px-5 py-5 text-[13px]">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-[#8F8F8F]">Created on</dt>
                    <dd className="mt-0.5 font-medium text-[#1A1A1A]">{formatUnix(settlement?.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#8F8F8F]">Provider status</dt>
                    <dd className="mt-0.5">
                      {settlement ? (
                        <StatusBadge tone={settlementTone(settlement.status)}>{settlement.status}</StatusBadge>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#8F8F8F]">Gross</dt>
                    <dd className="mt-0.5 tabular-nums font-medium">{formatPaise(settlement?.amount_gross || 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#8F8F8F]">Net</dt>
                    <dd className="mt-0.5 tabular-nums font-medium">{formatPaise(settlement?.amount || 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#8F8F8F]">Fees</dt>
                    <dd className="mt-0.5 tabular-nums">{formatPaise(settlement?.fees || 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#8F8F8F]">Tax</dt>
                    <dd className="mt-0.5 tabular-nums">{formatPaise(settlement?.tax || 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#8F8F8F]">Schedule</dt>
                    <dd className="mt-0.5">{settlement?.settlement_schedule || 'Domestic - After 2 days'}</dd>
                  </div>
                  <div>
                    <dt className="text-[#8F8F8F]">UTR</dt>
                    <dd className="mt-0.5 font-mono text-[12px]">{settlement?.utr || '—'}</dd>
                  </div>
                </dl>
                <p className={`${RZ_MUTED} leading-relaxed`}>
                  Matched / Not resolved / Failed use the same payout status spine as Reconciliation and
                  Payouts (processed · review · failed). Provider settlement status stays separate from
                  recon result chips on each line.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('matched')}
                    className="rounded-[6px] border border-[#E6E8EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1A1A1A] hover:bg-[#FAFBFC]"
                  >
                    View matched ({buckets.matchedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('unresolved')}
                    className="rounded-[6px] border border-[#E6E8EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1A1A1A] hover:bg-[#FAFBFC]"
                  >
                    View not resolved ({buckets.unresolvedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('failed')}
                    className="rounded-[6px] border border-[#E6E8EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1A1A1A] hover:bg-[#FAFBFC]"
                  >
                    View failed ({buckets.failedCount})
                  </button>
                  <Link
                    href="/reconciliation?demo=sandbox"
                    className="rounded-[6px] border border-[#E6E8EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#528FF0] hover:bg-[#FAFBFC]"
                  >
                    Open Reconciliation →
                  </Link>
                </div>
              </div>
            ) : filteredLines.length === 0 ? (
              <PaymentsEmptyState
                title="No lines in this tab"
                body="Try All lines, or open another settlement batch from the list."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-[13px]">
                  <thead className="border-b border-[#EEF0F3] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Payout / entity</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 text-right font-semibold">Amount</th>
                      <th className="px-4 py-3 font-semibold">Provider</th>
                      <th className="px-4 py-3 font-semibold">Recon</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((line) => {
                      const bucket = lineBucket(line)
                      const providerTone =
                        bucket === 'matched' ? 'captured' : bucket === 'failed' ? 'failed' : 'pending'
                      return (
                        <tr key={`${line.entity_id}-${line.created_at}`} className="border-t border-[#F3F4F6]">
                          <td className="px-4 py-3">
                            <p className="font-mono text-[12px] text-[#1A1A1A]">
                              {line.payment_id || line.entity_id}
                            </p>
                            {line.utr ? (
                              <p className="mt-0.5 font-mono text-[11px] text-[#8F8F8F]">UTR {line.utr}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 capitalize text-[#334155]">{line.type || '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1A1A1A]">
                            {formatPaise(line.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={providerTone}>{line.provider_status || '—'}</StatusBadge>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={resultTone(line.reconciliation_result)}>
                              {line.reconciliation_result || '—'}
                            </StatusBadge>
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-3 text-[#64748B]" title={line.reason || line.description || ''}>
                            {line.reason || line.description || '—'}
                          </td>
                          <td className="px-4 py-3 text-[#64748B]">{formatUnix(line.created_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
