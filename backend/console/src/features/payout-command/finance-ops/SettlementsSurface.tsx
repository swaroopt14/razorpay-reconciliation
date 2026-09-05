'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getFinanceResults, getRazorpaySettlements } from '@/services/payout-command/prod-api/financeApi'
import type {
  RazorpaySettlement,
  RazorpaySettlementOverview,
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
import { mapFinanceRowToPayoutRecon, sumPayoutKpis } from './payoutReconCopy'

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

/** List tabs — settlement cycles first (Intent/Transactions pattern). */
const LIST_TABS = [
  { id: 'batches', label: 'Settlement batches' },
  { id: 'matched', label: 'Matched' },
  { id: 'unresolved', label: 'Not resolved' },
  { id: 'failed', label: 'Failed' },
] as const

type ListTab = (typeof LIST_TABS)[number]['id']

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

function OverviewTile({
  label,
  title,
  subtitle,
}: {
  label: string
  title: string
  subtitle?: string
}) {
  return (
    <div className={`${RZ_CARD} px-4 py-3`}>
      <p className="text-[12px] font-medium text-[#6B6B6B]">{label}</p>
      <p className="mt-1 text-[14px] font-semibold text-[#1A1A1A]">{title}</p>
      {subtitle ? <p className={`mt-0.5 font-mono text-[11px] ${RZ_MUTED}`}>{subtitle}</p> : null}
    </div>
  )
}

function settlementListBucket(row: RazorpaySettlement): 'matched' | 'unresolved' | 'failed' {
  const s = String(row.status || '').toLowerCase()
  if (s === 'processed') return 'matched'
  if (s === 'failed') return 'failed'
  return 'unresolved'
}

export function SettlementsSurface() {
  const router = useRouter()
  const [range, setRange] = useState('all')
  const [tab, setTab] = useState<ListTab>('batches')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<RazorpaySettlement[]>([])
  const [overview, setOverview] = useState<RazorpaySettlementOverview | null>(null)
  const [kpis, setKpis] = useState(sumPayoutKpis([]))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [res, recon] = await Promise.all([getRazorpaySettlements('all'), getFinanceResults('ALL')])
    if (!res.ok || !res.data) {
      setError(res.status === 401 ? 'Sign in to load settlements.' : 'Could not load settlements.')
      setItems([])
      setOverview(null)
      setKpis(sumPayoutKpis([]))
      setLoading(false)
      return
    }
    setItems(res.data.items ?? [])
    setOverview(res.data.overview ?? null)
    const mapped = (recon.data?.results ?? []).map(mapFinanceRowToPayoutRecon)
    setKpis(sumPayoutKpis(mapped))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((row) => {
      if (tab === 'matched' && settlementListBucket(row) !== 'matched') return false
      if (tab === 'unresolved' && settlementListBucket(row) !== 'unresolved') return false
      if (tab === 'failed' && settlementListBucket(row) !== 'failed') return false
      if (!q) return true
      const hay = [row.id, row.utr, row.status, row.batch_label, String(row.amount)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, tab, search])

  const available = kpis.processedAmount || overview?.available_balance || 0

  function openSettlement(id: string, focus?: ListTab) {
    const focusQs =
      focus === 'matched' || focus === 'unresolved' || focus === 'failed' ? `&tab=${focus}` : ''
    router.push(`/settlements/${encodeURIComponent(id)}?demo=sandbox${focusQs}`)
  }

  return (
    <div className={RZ_PAGE}>
      <div className={RZ_WRAP}>
        <PageHeader
          title="Settlements"
          range={range}
          onRangeChange={setRange}
          rangeOptions={RANGE_OPTIONS}
          docsHref="https://razorpay.com/docs/payments/settlements/"
        />
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[#15803D]">
          <span className="inline-block h-2 w-2 rounded-full bg-[#22C55E]" />
          {overview?.schedule_active ? 'Active settlement schedule' : 'Settlement schedule'}
          <span className="text-[#8F8F8F]">·</span>
          <span className="text-[#334155]">{overview?.schedule || 'Domestic - After 2 days'}</span>
        </p>

        <div className="mt-5 space-y-3">
          <HeroAmountCard
            label="Matched / processed"
            amount={formatPaise(available, 2)}
            subtitle={`${kpis.processedCount.toLocaleString('en-IN')} matched payouts · same book as Reconciliation`}
            info="Gross processed payout amount. Matches Transactions and Reconciliation demo KPIs."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetricCard
              label="Matched"
              value={formatPaise(kpis.processedAmount, 2)}
              subtitle={`${kpis.processedCount.toLocaleString('en-IN')} processed`}
              info="Status processed · money credited — same as Reconciliation"
              onClick={() => setTab('matched')}
            />
            <MiniMetricCard
              label="Not resolved"
              value={formatPaise(kpis.reviewAmount, 2)}
              subtitle={`${kpis.reviewCount.toLocaleString('en-IN')} open · awaiting action`}
              info="Processing, pending, scheduled, or queued — same as Needs review"
              warn
              hrefLabel="View All"
              onClick={() => setTab('unresolved')}
            />
            <MiniMetricCard
              label="Failed"
              value={formatPaise(kpis.failedAmount, 2)}
              subtitle={`${kpis.failedCount.toLocaleString('en-IN')} payouts`}
              info="Failed, reversed, rejected, or cancelled — same as Reconciliation"
              warn
              onClick={() => setTab('failed')}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <OverviewTile
              label="Previous settlement"
              title={
                overview?.previous_settlement
                  ? formatPaise(overview.previous_settlement.amount || 0, 2)
                  : 'No settlement'
              }
              subtitle={overview?.previous_settlement?.id}
            />
            <OverviewTile
              label="Today’s settlement"
              title={
                overview?.today_settlement
                  ? formatPaise(overview.today_settlement.amount || 0, 2)
                  : 'No settlement'
              }
              subtitle={overview?.today_settlement?.id}
            />
            <OverviewTile
              label="Next settlement"
              title={
                overview?.next_settlement
                  ? `${overview.next_settlement.status} · ${formatPaise(overview.next_settlement.amount || 0, 2)}`
                  : 'No upcoming settlement scheduled'
              }
              subtitle={overview?.next_settlement?.id}
            />
          </div>
        </div>

        <div className="mt-8">
          <UnderlineTabs
            items={LIST_TABS.map((t) => ({ id: t.id, label: t.label }))}
            active={tab}
            onChange={(id) => setTab(id as ListTab)}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settlement id, batch, or UTR…"
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

          {error ? (
            <p className="mt-4 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
              {error}
            </p>
          ) : null}

          <div className={`${RZ_CARD} mt-4 overflow-hidden`}>
            {loading ? (
              <p className={`px-6 py-10 text-center ${RZ_MUTED}`}>Loading settlements…</p>
            ) : filtered.length === 0 ? (
              <PaymentsEmptyState
                title="No settlement batches found"
                body="Settlement cycles appear here once Razorpay settlement batches are created."
              />
            ) : (
              <ul className="divide-y divide-[#EEF0F3]">
                {filtered.map((row) => {
                  const title = row.batch_label || row.id
                  const matched = row.matched_count ?? 0
                  const unresolved = row.unresolved_count ?? 0
                  const failed = row.failed_count ?? 0
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => openSettlement(row.id, tab === 'batches' ? undefined : tab)}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#FAFBFC]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">{title}</p>
                            <StatusBadge tone={settlementTone(row.status)}>{row.status}</StatusBadge>
                          </div>
                          <p className="mt-0.5 font-mono text-[11px] text-[#8F8F8F]">{row.id}</p>
                          <p className={`mt-1 ${RZ_MUTED}`}>
                            {(row.items_count || 0).toLocaleString('en-IN')} lines
                            <span className="mx-1.5 text-[#D0D4DA]">·</span>
                            {formatPaise(row.amount)}
                            <span className="mx-1.5 text-[#D0D4DA]">·</span>
                            {formatUnix(row.created_at)}
                          </p>
                          <p className="mt-1 text-[12px] text-[#64748B]">
                            Matched {matched}
                            <span className="mx-1.5 text-[#D0D4DA]">·</span>
                            Not resolved {unresolved}
                            <span className="mx-1.5 text-[#D0D4DA]">·</span>
                            Failed {failed}
                            {row.utr ? (
                              <>
                                <span className="mx-1.5 text-[#D0D4DA]">·</span>
                                <span className="font-mono text-[11px]">UTR {row.utr}</span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <span className="shrink-0 text-[13px] font-medium text-[#528FF0]">Open →</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
