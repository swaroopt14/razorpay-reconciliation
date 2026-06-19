'use client'

import Link from 'next/link'
import { DM_Mono } from 'next/font/google'
import { useEffect, useMemo, useRef, useState } from 'react'
import { clampPage } from '../_lib/clampPage'
import {
  POST_DISBURSAL_MONITORING_MOCK,
  type DpdBucket,
  type LoanMonitoringRow,
  type MonitoringQueueStatus,
} from '../monitoring/postDisbursalMonitoringMock'
import { COMMAND_CENTER_LABEL_GREEN, HOME_TITLE_BLACK } from '../command-center/homeCommandCenterTokens'
import { JournalIntelligenceKpiHero } from '../command-center/JournalIntelligenceKpiHero'
import { ZORD_SURFACE_CLASS, ZORD_SURFACE_MUTED } from '../command-center/homeSurfaceFonts'
import { Glyph } from '../shared'
import { LoanProfilePage } from '../profile/Borrower360'
import { useProfileParam } from '../profile/useProfileParam'

type QueueFilter = 'All' | MonitoringQueueStatus
type SortKey = 'loan' | 'amount' | 'dpd' | 'status'
type SortDirection = 'asc' | 'desc'

const ROWS_PER_PAGE = 10
const QUEUE_FILTERS: QueueFilter[] = ['All', 'Confirmed', 'Pending', 'At risk']
const STATUS_ORDER: Record<MonitoringQueueStatus, number> = {
  Confirmed: 0,
  Pending: 1,
  'At risk': 2,
}

const DPD_TONE_BG: Record<DpdBucket['tone'], string> = {
  green: '#000000',
  lime: '#525252',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
}

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

function formatLoanCompact(amountInr: number): string {
  if (amountInr >= 10_000_000) return `₹${(amountInr / 10_000_000).toFixed(1)}Cr`
  const lakh = amountInr / 100_000
  const rounded = Number.isInteger(lakh) ? lakh.toFixed(0) : lakh.toFixed(1)
  return `₹${rounded}L`
}

function metricTone(tone?: 'good' | 'warn' | 'bad' | 'neutral'): string {
  if (tone === 'good') return 'text-[#000000]'
  if (tone === 'warn') return 'text-[#92400e]'
  if (tone === 'bad') return 'text-[#b91c1c]'
  return 'text-[#0f172a]'
}

function statusTone(status: MonitoringQueueStatus): string {
  if (status === 'Confirmed') return 'border border-[#e5e5e5] bg-[#f4f4f5] text-[#000000]'
  if (status === 'Pending') return 'border border-[#fde68a] bg-[#fef3c7] text-[#92400e]'
  return 'border border-[#fecaca] bg-[#fee2e2] text-[#b91c1c]'
}

function dpdTextTone(dpd: number): string {
  if (dpd === 0) return 'text-[#000000]'
  if (dpd <= 30) return 'text-[#92400e]'
  return 'text-[#b91c1c]'
}

function emiTone(emiStatus: LoanMonitoringRow['emiStatus']): string {
  if (emiStatus === 'Paid') return 'text-[#000000]'
  if (emiStatus === 'Due') return 'text-[#92400e]'
  if (emiStatus === 'Bounced') return 'text-[#b91c1c]'
  return 'text-[#64748b]'
}

function riskSignalTone(signal: LoanMonitoringRow['riskSignal']): string {
  if (signal === 'None') return 'text-[#64748b]'
  if (signal === 'Dormant' || signal === 'Device risk') return 'text-[#92400e]'
  return 'text-[#b91c1c]'
}

function rowSearchHaystack(row: LoanMonitoringRow): string {
  return [row.loanId, row.borrowerName, row.rail, row.emiStatus, row.riskSignal, row.region, row.nextAction, row.status]
    .join(' ')
    .toLowerCase()
}

function compareRows(a: LoanMonitoringRow, b: LoanMonitoringRow, sortKey: SortKey): number {
  if (sortKey === 'amount') return a.amountInr - b.amountInr
  if (sortKey === 'dpd') return a.dpd - b.dpd
  if (sortKey === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  return a.loanId.localeCompare(b.loanId)
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  direction,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeSort: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
}) {
  const isActive = activeSort === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left text-[13px] font-semibold text-[#00239C] transition hover:bg-slate-100"
    >
      {label}
      <span className="text-[11px] text-slate-500">{isActive ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
}

/** Stripe-style 12-week gradient area chart with dashed baseline + hover. */
function RepaymentTrendChart() {
  const trend = POST_DISBURSAL_MONITORING_MOCK.repaymentTrend
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const values = trend.weeks.map((w) => w.pct)
  const min = 60
  const max = 92
  const span = max - min
  const yFor = (pct: number) => 40 - ((pct - min) / span) * 34
  const points = values.map((v, idx) => ({
    x: (idx / (values.length - 1)) * 100,
    y: yFor(v),
  }))
  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const baselineY = yFor(trend.baselinePct)
  const hover = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div className="relative mt-3">
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-[200px] w-full">
        <defs>
          <linearGradient id="repayment-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[10, 20, 30].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#e2e8f0" strokeWidth="0.3" />
        ))}
        <line
          x1="0"
          y1={baselineY}
          x2="100"
          y2={baselineY}
          stroke="#94a3b8"
          strokeWidth="0.5"
          strokeDasharray="2 1.6"
        />
        <polygon points={`0,44 ${polyline} 100,44`} fill="url(#repayment-trend-fill)" />
        <polyline
          points={polyline}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover ? (
          <>
            <line x1={hover.x} y1="4" x2={hover.x} y2="42" stroke="#94a3b8" strokeWidth="0.4" strokeDasharray="1.4 1.4" />
            <circle cx={hover.x} cy={hover.y} r="1.7" fill="#0ea5e9" stroke="#ffffff" strokeWidth="0.7" />
          </>
        ) : null}
        {points.map((p, idx) => (
          <rect
            key={trend.weeks[idx].label}
            x={p.x - 100 / values.length / 2}
            y="0"
            width={100 / values.length}
            height="44"
            fill="transparent"
            onMouseEnter={() => setHoverIdx(idx)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}
      </svg>
      {hoverIdx !== null ? (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] shadow-md"
          style={{ left: `${Math.min(92, Math.max(8, points[hoverIdx].x))}%` }}
        >
          <p className="font-semibold text-[#000000]">{values[hoverIdx]}% on-time</p>
          <p className="text-[11px] font-medium text-slate-500">
            {trend.weeks[hoverIdx].label} · baseline {trend.baselinePct}%
          </p>
        </div>
      ) : null}
      <div className="mt-1 flex justify-between">
        <span className="text-[11px] font-semibold text-slate-400">{trend.weeks[0].label}</span>
        <span className="text-[11px] font-semibold text-slate-400">— baseline {trend.baselinePct}% —</span>
        <span className="text-[11px] font-semibold text-slate-400">{trend.weeks[trend.weeks.length - 1].label}</span>
      </div>
    </div>
  )
}

export function PostDisbursalMonitoringSurface() {
  const data = POST_DISBURSAL_MONITORING_MOCK
  const profile = useProfileParam('loan')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('All')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('loan')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [runningCheck, setRunningCheck] = useState(false)
  const [lastRunLabel, setLastRunLabel] = useState('2 min ago')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setPage(1)
  }, [queueFilter, query, sortKey, sortDirection])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = useMemo(() => {
    return data.queueRows.filter((row) => {
      if (queueFilter !== 'All' && row.status !== queueFilter) return false
      if (!normalizedQuery) return true
      return rowSearchHaystack(row).includes(normalizedQuery)
    })
  }, [data.queueRows, queueFilter, normalizedQuery])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]
    rows.sort((a, b) => {
      const base = compareRows(a, b, sortKey)
      return sortDirection === 'asc' ? base : -base
    })
    return rows
  }, [filteredRows, sortKey, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * ROWS_PER_PAGE
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE)

  useEffect(() => {
    setPage((p) => clampPage(p, totalPages))
  }, [totalPages])

  const dpdTotalCr = data.dpdBuckets.reduce((sum, bucket) => sum + bucket.amountCr, 0)
  const overdueCr = data.dpdBuckets.filter((b) => b.label !== 'Current').reduce((sum, b) => sum + b.amountCr, 0)

  const moneyFlowMaxCr = Math.max(...data.moneyFlow.map((row) => row.amountCr), 1)
  const suspiciousMax = Math.max(...data.suspiciousBehavior.map((row) => row.value), 1)
  const suspiciousTotal = data.suspiciousBehavior.reduce((sum, row) => sum + row.value, 0)
  const bounceMax = Math.max(...data.enach.bounceReasons.map((row) => row.value), 1)

  const heroBuckets = data.summaryCards.map((card) => ({
    label: card.label,
    value: card.value,
    sub: card.sub,
    spark: card.spark,
    sparkTone: card.sparkTone,
  }))

  const handleSort = (next: SortKey) => {
    if (sortKey === next) {
      setSortDirection((p) => (p === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(next)
    setSortDirection('asc')
  }

  const runCheck = () => {
    if (runningCheck) return
    setRunningCheck(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setRunningCheck(false)
      setLastRunLabel('Just now')
      timerRef.current = null
    }, 900)
  }

  if (profile.selectedId) {
    return <LoanProfilePage loanId={profile.selectedId} onBack={profile.close} />
  }

  return (
    <div className={`mt-2 space-y-4 ${ZORD_SURFACE_CLASS}`}>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className={`text-[1.35rem] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>{data.header.title}</h2>
          <span className="inline-flex items-center rounded-full border border-[#cbd5e1] bg-[#f4f4f5] px-2.5 py-0.5 text-[12px] font-semibold text-[#000000]">
            {data.header.statusPill}
          </span>
        </div>
        <p className={ZORD_SURFACE_MUTED}>Track disbursed loans, RBI delinquency posture, repayment signals, and post-disbursal fraud in one command center.</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/payout-command-view/batch-command-center"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-[#000000] transition hover:bg-slate-50"
          >
            <Glyph name="folder" className="h-4 w-4" />
            Upload bank confirmation
          </Link>
          <Link
            href="/payout-command-view/batch-command-center"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-[#000000] transition hover:bg-slate-50"
          >
            <Glyph name="folder" className="h-4 w-4" />
            Upload repayment data
          </Link>
          <Link
            href="/payout-command-view/today?dock=proof"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-[#000000] transition hover:bg-slate-50"
          >
            <Glyph name="arrow-up-right" className="h-4 w-4" />
            Export report
          </Link>
          <button
            type="button"
            onClick={runCheck}
            disabled={runningCheck}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f172a] px-3.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-70"
          >
            <Glyph name="refresh" className={`h-4 w-4 ${runningCheck ? 'animate-spin' : ''}`} />
            {runningCheck ? 'Running check…' : 'Run check'}
          </button>
          <span className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[12px] font-semibold text-slate-600">
            Last check: {lastRunLabel}
          </span>
        </div>
      </section>

      <JournalIntelligenceKpiHero
        eyebrow="Post-disbursal monitoring"
        value={data.summaryCards[0]?.value ?? '—'}
        deltaPill={data.header.statusPill}
        subcopy={`Portfolio queue: ${data.queueCounts.All.toLocaleString('en-IN')} loans · Last check ${lastRunLabel}`}
        buckets={heroBuckets}
        testId="post-disbursal-kpi-hero"
      />

      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#000000] via-[#f59e0b] to-[#ef4444]" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Portfolio delinquency — RBI DPD / SMA</h3>
            <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>₹{dpdTotalCr.toFixed(1)}Cr book across 780 loans · ₹{overdueCr.toFixed(1)}Cr past due</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.rollRates.map((roll) => (
              <span
                key={`${roll.from}-${roll.to}`}
                className={`inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-[#475569] ${dmMono.className}`}
              >
                {roll.from}→{roll.to} {roll.pct}%
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex h-9 w-full overflow-hidden rounded-xl">
          {data.dpdBuckets.map((bucket) => (
            <div
              key={bucket.label}
              title={`${bucket.label} (${bucket.range}): ₹${bucket.amountCr}Cr · ${bucket.loans} loans`}
              className="flex items-center justify-center transition hover:opacity-90"
              style={{
                width: `${(bucket.amountCr / dpdTotalCr) * 100}%`,
                minWidth: '36px',
                backgroundColor: DPD_TONE_BG[bucket.tone],
              }}
            >
              <span className={`px-1 text-[11px] font-semibold text-white ${dmMono.className}`}>₹{bucket.amountCr}Cr</span>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {data.dpdBuckets.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: DPD_TONE_BG[bucket.tone] }} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#000000]">
                  {bucket.label} <span className="font-medium text-slate-500">({bucket.range})</span>
                </p>
                <p className={`text-[12px] font-medium text-[#00239C] ${dmMono.className}`}>₹{bucket.amountCr}Cr · {bucket.loans} loans</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <p className={COMMAND_CENTER_LABEL_GREEN}>Check breakdown</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.checkBreakdownCards.map((card) => (
            <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-[1.02rem] font-semibold text-[#000000]">{card.title}</h3>
              <dl className="mt-3 space-y-1.5 text-[14px]">
                {card.metrics.map((metric) => (
                  <div key={metric.label} className="flex items-center justify-between">
                    <dt className="font-medium text-[#00239C]">{metric.label}</dt>
                    <dd className={`font-semibold tabular-nums ${metricTone(metric.tone)} ${dmMono.className}`}>{metric.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#f97316] to-[#ef4444]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>eNACH repayment health</h3>
              <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>{data.enach.presentations} presentations this cycle · next cycle {data.enach.nextPresentationCycle}</p>
            </div>
            <div className="text-right">
              <p className={`text-[26px] font-semibold leading-none text-[#b91c1c] ${dmMono.className}`}>{data.enach.bounceRatePct}%</p>
              <p className="text-[12px] font-semibold text-[#00239C]">bounce rate</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {data.enach.bounceReasons.map((reason) => (
              <div key={reason.label} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
                <span className="text-[13px] font-semibold text-[#00239C]">{reason.label}</span>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${reason.tone === 'red' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`}
                    style={{ width: `${(reason.value / bounceMax) * 100}%` }}
                  />
                </div>
                <span className={`w-7 text-right text-[14px] font-semibold tabular-nums ${HOME_TITLE_BLACK} ${dmMono.className}`}>{reason.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-center">
            <div>
              <p className={`text-[18px] font-semibold ${HOME_TITLE_BLACK} ${dmMono.className}`}>{data.enach.bounced}</p>
              <p className="text-[11px] font-semibold text-slate-500">bounced</p>
            </div>
            <div>
              <p className={`text-[18px] font-semibold text-[#000000] ${dmMono.className}`}>{data.enach.retrySuccessPct}%</p>
              <p className="text-[11px] font-semibold text-slate-500">retry success</p>
            </div>
            <div>
              <p className={`text-[18px] font-semibold ${HOME_TITLE_BLACK} ${dmMono.className}`}>{data.enach.presentations}</p>
              <p className="text-[11px] font-semibold text-slate-500">presented</p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Live alerts</h3>
              <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>Real-time post-disbursal risk events</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fecaca] bg-[#fef2f2] px-2.5 py-0.5 text-[12px] font-semibold text-[#b91c1c]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#dc2626]" />
              {data.alerts.filter((a) => a.severity === 'high').length} high
            </span>
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {data.alerts.map((alert) => (
              <li
                key={`${alert.time}-${alert.loanId}`}
                onClick={() => profile.open(alert.loanId)}
                className="flex cursor-pointer items-start gap-3 py-2.5 transition hover:bg-slate-50"
              >
                <span className={`mt-0.5 w-11 shrink-0 text-[12px] font-medium text-[#00239C] ${dmMono.className}`}>{alert.time}</span>
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    alert.severity === 'high' ? 'bg-[#dc2626]' : alert.severity === 'medium' ? 'bg-[#d97706]' : 'bg-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#000000]">
                    <span className={`text-[#1d4ed8] ${dmMono.className}`}>{alert.loanId}</span> · {alert.label}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#10b981] via-[#0ea5e9] to-[#3b82f6]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Repayment trend</h3>
              <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>On-time rate over 12 weeks vs portfolio baseline</p>
            </div>
            <div className="text-right">
              <p className={`text-[26px] font-semibold leading-none text-[#ef4444] ${dmMono.className}`}>
                {data.repaymentTrend.weeks[data.repaymentTrend.weeks.length - 1].pct}%
              </p>
              <p className="text-[12px] font-semibold text-[#00239C]">this week</p>
            </div>
          </div>
          <RepaymentTrendChart />
          <p className="mt-3 border-t border-slate-200 pt-3 text-[13px] font-semibold text-[#b91c1c]">
            On-time rate is {data.repaymentTrend.baselinePct - data.repaymentTrend.weeks[data.repaymentTrend.weeks.length - 1].pct}pp below the
            portfolio baseline and falling for 8 straight weeks.
          </p>
        </article>

        <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#3b82f6] via-[#0ea5e9] to-[#10b981]" />
          <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Money flow</h3>
          <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>Settlement cascade from disbursal to recovery</p>
          <div className="mt-5 space-y-4">
            {data.moneyFlow.map((row) => {
              const barColor =
                row.tone === 'blue'
                  ? 'bg-[#3b82f6]'
                  : row.tone === 'green'
                    ? 'bg-[#000000]'
                    : row.tone === 'amber'
                      ? 'bg-[#f59e0b]'
                      : row.tone === 'red'
                        ? 'bg-[#ef4444]'
                        : 'bg-[#65a30d]'
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-semibold text-[#00239C]">{row.label}</span>
                    <span className="flex items-center gap-2">
                      <span className={`font-semibold tabular-nums ${HOME_TITLE_BLACK} ${dmMono.className}`}>₹{row.amountCr}Cr</span>
                      <span className={`rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-[#475569] ${dmMono.className}`}>
                        {row.pct}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-3.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${(row.amountCr / moneyFlowMaxCr) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Suspicious behavior</h3>
              <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>Flagged accounts post-disbursal</p>
            </div>
            <div className="text-right">
              <p className={`text-[26px] font-semibold leading-none ${HOME_TITLE_BLACK} ${dmMono.className}`}>{suspiciousTotal}</p>
              <p className="text-[12px] font-semibold text-[#00239C]">total signals</p>
            </div>
          </div>
          <div className="mt-5 space-y-3.5">
            {data.suspiciousBehavior.map((row) => (
              <div key={row.label} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
                <span className="text-[13px] font-semibold text-[#00239C]">{row.label}</span>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${row.tone === 'red' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`}
                    style={{ width: `${(row.value / suspiciousMax) * 100}%` }}
                  />
                </div>
                <span className={`w-7 text-right text-[14px] font-semibold tabular-nums ${HOME_TITLE_BLACK} ${dmMono.className}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Account connection map</h3>
          <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>Fraud clusters detected by the graph engine</p>
          <div className="mt-4 space-y-4">
            {data.connectionClusters.map((cluster) => (
              <div key={cluster.id} className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[#000000]">{cluster.title}</p>
                  <span className="inline-flex rounded-full border border-[#fecaca] bg-[#fef2f2] px-2 py-0.5 text-[11px] font-semibold text-[#b91c1c]">
                    {cluster.riskLabel}
                  </span>
                </div>
                <div className="mt-2.5 space-y-1">
                  {cluster.nodes.map((node, idx) => {
                    const edge = cluster.edges.find((e) => e.from === node.id)
                    return (
                      <div key={node.id}>
                        <div
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
                            node.type === 'borrower'
                              ? 'border-[#bfd6f8] bg-[#eff6ff] text-[#1e3a8a]'
                              : node.type === 'counterparty'
                                ? 'border-[#e9d5ff] bg-[#faf5ff] text-[#6b21a8]'
                                : 'border-slate-200 bg-white text-[#334155]'
                          }`}
                        >
                          <span className={dmMono.className}>{node.label}</span>
                          {node.risk ? <span className="text-[11px] font-semibold text-[#b91c1c]">{node.risk}</span> : null}
                        </div>
                        {idx < cluster.nodes.length - 1 ? (
                          <p className={`pl-5 text-[11px] font-medium text-slate-400 ${dmMono.className}`}>
                            ↓ {edge?.label ?? ''}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>Loan monitoring queue</p>
            <p className="text-[12px] font-medium text-[#00239C]">Click any loan to open the full 360° view</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Glyph name="search" className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search loan, borrower, or region"
              className="w-56 border-0 bg-transparent text-[13px] font-medium text-[#0f172a] outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUEUE_FILTERS.map((filter) => {
            const active = queueFilter === filter
            const count = data.queueCounts[filter]
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setQueueFilter(filter)}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition ${
                  active
                    ? 'border-[#0f172a] bg-[#0f172a] text-white'
                    : 'border-slate-300 bg-white text-[#334155] hover:bg-slate-50'
                }`}
              >
                {filter} ({count})
              </button>
            )
          })}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left"><SortHeader label="Loan" sortKey="loan" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="Amount" sortKey="amount" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="DPD" sortKey="dpd" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#00239C]">Rail</th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#00239C]">EMI</th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#00239C]">Risk signal</th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#00239C]">Region</th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#00239C]">Next action</th>
                <th className="px-3 py-2 text-left"><SortHeader label="Status" sortKey="status" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[14px] font-medium text-slate-400">No loans match your filters.</td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.loanId}
                    onClick={() => profile.open(row.loanId)}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-sky-50/50"
                  >
                    <td className="px-3 py-2.5">
                      <p className="text-[14px] font-semibold text-[#000000]">{row.borrowerName}</p>
                      <p className={`text-[12px] font-medium text-[#00239C] ${dmMono.className}`}>{row.loanId} · {row.lastEventAt}</p>
                    </td>
                    <td className={`px-3 py-2.5 text-[14px] font-semibold tabular-nums text-[#000000] ${dmMono.className}`}>{formatLoanCompact(row.amountInr)}</td>
                    <td className={`px-3 py-2.5 text-[14px] font-semibold tabular-nums ${dpdTextTone(row.dpd)} ${dmMono.className}`}>{row.dpd}</td>
                    <td className="px-3 py-2.5 text-[13px] font-medium text-[#00239C]">{row.rail}</td>
                    <td className={`px-3 py-2.5 text-[13px] font-semibold ${emiTone(row.emiStatus)}`}>{row.emiStatus}</td>
                    <td className={`px-3 py-2.5 text-[13px] font-semibold ${riskSignalTone(row.riskSignal)}`}>{row.riskSignal}</td>
                    <td className="px-3 py-2.5 text-[13px] font-medium text-[#00239C]">{row.region}</td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-[#00239C]">{row.nextAction}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${statusTone(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[13px] font-medium text-slate-600">
          <p>
            Showing {sortedRows.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + ROWS_PER_PAGE, sortedRows.length)} of {sortedRows.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded border border-slate-300 px-2 py-1 text-[12px] font-semibold text-[#00239C] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded border border-slate-300 px-2 py-1 text-[12px] font-semibold text-[#00239C] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
