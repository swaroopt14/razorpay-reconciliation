'use client'

import Link from 'next/link'
import { DM_Mono } from 'next/font/google'
import { useEffect, useMemo, useRef, useState } from 'react'
import { clampPage } from '../_lib/clampPage'
import {
  BORROWER_VERIFICATION_MOCK,
  type BorrowerQueueRow,
  type BorrowerQueueStatus,
  type SignalLevel,
} from '../verification/borrowerVerificationMock'
import {
  HOME_TITLE_BLACK,
  INTELLIGENCE_BLUE_GRADIENT,
} from '../command-center/homeCommandCenterTokens'
import { JournalIntelligenceKpiHero } from '../command-center/JournalIntelligenceKpiHero'
import { ZORD_SURFACE_CLASS, ZORD_SURFACE_MUTED } from '../command-center/homeSurfaceFonts'
import { Glyph } from '../shared'
import { BorrowerProfilePage } from '../profile/Borrower360'
import { useProfileParam } from '../profile/useProfileParam'

type QueueFilter = 'All' | BorrowerQueueStatus
type SortKey = 'borrower' | 'loan' | 'risk' | 'sla' | 'status'
type SortDirection = 'asc' | 'desc'

const ROWS_PER_PAGE = 10
const QUEUE_FILTERS: QueueFilter[] = ['All', 'Safe', 'Review', 'Blocked', 'Rejected']
const STATUS_ORDER: Record<BorrowerQueueStatus, number> = {
  Safe: 0,
  Review: 1,
  Blocked: 2,
  Rejected: 3,
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

function formatSla(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function statusBadgeTone(status: BorrowerQueueStatus): string {
  if (status === 'Safe') return 'border border-[#e5e5e5] bg-[#f4f4f5] text-[#000000]'
  if (status === 'Review') return 'border border-[#fde68a] bg-[#fef3c7] text-[#92400e]'
  if (status === 'Blocked') return 'border border-[#fecaca] bg-[#fee2e2] text-[#b91c1c]'
  return 'border border-[#e2e8f0] bg-slate-100 text-[#475569]'
}

function riskScoreTone(score: number): string {
  if (score < 30) return 'text-[#000000]'
  if (score < 60) return 'text-[#92400e]'
  return 'text-[#b91c1c]'
}

function signalDotTone(level: SignalLevel): string {
  if (level === 'pass') return 'bg-[#000000]'
  if (level === 'warn') return 'bg-[#d97706]'
  return 'bg-[#dc2626]'
}

function rowSearchHaystack(row: BorrowerQueueRow): string {
  return [row.borrowerId, row.borrowerName, row.status, row.source, row.product, row.stage, row.failReason ?? '']
    .join(' ')
    .toLowerCase()
}

function compareRows(a: BorrowerQueueRow, b: BorrowerQueueRow, sortKey: SortKey): number {
  if (sortKey === 'loan') return a.loanAmountInr - b.loanAmountInr
  if (sortKey === 'risk') return a.riskScore - b.riskScore
  if (sortKey === 'sla') return (a.slaMinutes ?? Number.MAX_SAFE_INTEGER) - (b.slaMinutes ?? Number.MAX_SAFE_INTEGER)
  if (sortKey === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  const byId = a.borrowerId.localeCompare(b.borrowerId)
  if (byId !== 0) return byId
  return a.borrowerName.localeCompare(b.borrowerName)
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

function SignalChips({ row }: { row: BorrowerQueueRow }) {
  const signals: { label: string; level: SignalLevel }[] = [
    { label: 'KYC', level: row.kyc },
    { label: 'Bank', level: row.bank },
    { label: 'Fraud', level: row.fraud },
    { label: 'AML', level: row.aml },
  ]
  return (
    <div className="flex items-center gap-2">
      {signals.map((signal) => (
        <span
          key={signal.label}
          title={`${signal.label}: ${signal.level}`}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#475569]"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${signalDotTone(signal.level)}`} />
          {signal.label}
        </span>
      ))}
    </div>
  )
}

/** Stripe-style smooth gradient area chart with hover dot + tooltip. */
function VolumeAreaChart() {
  const trend = BORROWER_VERIFICATION_MOCK.trend
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const values = trend.verificationsProcessed
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((v, idx) => ({
    x: (idx / (values.length - 1)) * 100,
    y: 38 - ((v - min) / span) * 30,
  }))
  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const hover = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div className="relative mt-3">
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-[190px] w-full">
        <defs>
          <linearGradient id="verification-volume-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[10, 20, 30].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#e2e8f0" strokeWidth="0.3" />
        ))}
        <polygon points={`0,44 ${polyline} 100,44`} fill="url(#verification-volume-fill)" />
        <polyline
          points={polyline}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover ? (
          <>
            <line x1={hover.x} y1="4" x2={hover.x} y2="42" stroke="#94a3b8" strokeWidth="0.4" strokeDasharray="1.4 1.4" />
            <circle cx={hover.x} cy={hover.y} r="1.7" fill="#3b82f6" stroke="#ffffff" strokeWidth="0.7" />
          </>
        ) : null}
        {points.map((p, idx) => (
          <rect
            key={trend.days[idx]}
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
          style={{ left: `${points[hoverIdx].x}%` }}
        >
          <p className="font-semibold text-[#0f172a]">{values[hoverIdx]} checks</p>
          <p className="text-[11px] font-medium text-slate-500">
            {trend.days[hoverIdx]} · {trend.passRatePct[hoverIdx]}% pass · {trend.flagsRaised[hoverIdx]} flags
          </p>
        </div>
      ) : null}
      <div className="mt-1 grid grid-cols-7 text-center">
        {trend.days.map((day) => (
          <span key={day} className="text-[11px] font-semibold text-slate-400">{day}</span>
        ))}
      </div>
    </div>
  )
}

export function BorrowerVerificationSurface() {
  const source = BORROWER_VERIFICATION_MOCK
  const profile = useProfileParam('borrower')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('All')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('borrower')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [runningCheck, setRunningCheck] = useState(false)
  const [lastCheckAt, setLastCheckAt] = useState(() => new Date())
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setPage(1)
  }, [queueFilter, query, sortKey, sortDirection])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const rows = source.queueRows
  const normalizedQuery = query.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (queueFilter !== 'All' && row.status !== queueFilter) return false
      if (!normalizedQuery) return true
      return rowSearchHaystack(row).includes(normalizedQuery)
    })
  }, [rows, queueFilter, normalizedQuery])

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows]
    copy.sort((a, b) => {
      const base = compareRows(a, b, sortKey)
      return sortDirection === 'asc' ? base : -base
    })
    return copy
  }, [filteredRows, sortKey, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * ROWS_PER_PAGE
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE)

  useEffect(() => {
    setPage((p) => clampPage(p, totalPages))
  }, [totalPages])

  const baseFunnel = source.funnel[0]?.count ?? 1
  const funnelRows = source.funnel.map((step, index) => {
    const ratio = Math.max(1, (step.count / baseFunnel) * 100)
    const prev = source.funnel[index - 1]?.count
    const dropPct = prev && prev > 0 ? Number((((prev - step.count) / prev) * 100).toFixed(1)) : null
    return { ...step, ratio, dropPct }
  })

  const riskMax = Math.max(...source.riskSignals.map((signal) => signal.value), 1)
  const riskTotal = source.riskSignals.reduce((sum, signal) => sum + signal.value, 0)
  const totalInsightCases = source.insights.reduce((sum, insight) => sum + (insight.caseCount ?? 0), 0)

  const heroBuckets = [
    {
      label: 'Safe to disburse',
      value: String(source.summary.safeToDisburse),
      sub: `of ${source.totals.totalBorrowers} borrowers`,
      spark: source.trend.safeToDisburse,
      sparkTone: 'good' as const,
    },
    {
      label: 'Blocked / review',
      value: String(source.summary.blockedOrReview),
      sub: 'Requires verification action',
      spark: source.trend.flagsRaised,
      sparkTone: 'bad' as const,
    },
    {
      label: 'Exposure prevented',
      value: source.summary.exposurePreventedLabel,
      sub: 'Fraud and mismatch prevention',
    },
    {
      label: 'KYC pass rate',
      value: `${source.summary.kycPassRate}%`,
      sub: 'via Sumsub',
      spark: source.trend.passRatePct,
      sparkTone: 'good' as const,
    },
    {
      label: 'Proof coverage',
      value: `${source.summary.proofCoveragePct}%`,
      sub: 'Disbursal evidence readiness',
    },
  ] as const

  const breakdown = source.checkBreakdown
  const complianceCards = [
    {
      title: 'Identity verification',
      metrics: [
        { label: 'Verified', value: String(breakdown.borrowerVerification.verified), tone: 'good' as const },
        { label: 'High risk', value: String(breakdown.borrowerVerification.highRisk), tone: 'warn' as const },
        { label: 'Rejected', value: String(breakdown.borrowerVerification.rejected), tone: 'bad' as const },
      ],
    },
    {
      title: 'Bank account',
      metrics: [
        { label: 'Verified', value: String(breakdown.bankAccount.verified), tone: 'good' as const },
        { label: 'Penny-drop OK', value: String(breakdown.bankAccount.pennyDropOk), tone: 'good' as const },
        { label: 'Name mismatch', value: String(breakdown.bankAccount.nameMismatch), tone: 'warn' as const },
        { label: 'Verify failed', value: String(breakdown.bankAccount.verifyFailed), tone: 'bad' as const },
      ],
    },
    {
      title: 'Fraud risk',
      metrics: [
        { label: 'Device risk', value: String(breakdown.fraudRisk.deviceRisk), tone: 'warn' as const },
        { label: 'Duplicates', value: String(breakdown.fraudRisk.duplicates), tone: 'warn' as const },
        { label: 'AML alerts', value: String(breakdown.fraudRisk.amlAlerts), tone: 'bad' as const },
        { label: 'Deepfake signals', value: String(breakdown.fraudRisk.deepfakeSignal), tone: 'bad' as const },
      ],
    },
    {
      title: 'Proof readiness',
      metrics: [
        { label: 'Ready', value: String(breakdown.proofReadiness.ready), tone: 'good' as const },
        { label: 'Awaiting confirm', value: String(breakdown.proofReadiness.awaitingConfirm), tone: 'warn' as const },
        { label: 'Missing proof', value: String(breakdown.proofReadiness.missingProof), tone: 'bad' as const },
      ],
    },
  ]

  const handleRunCheck = () => {
    if (runningCheck) return
    setRunningCheck(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setRunningCheck(false)
      setLastCheckAt(new Date())
      timerRef.current = null
    }, 900)
  }

  const handleSort = (next: SortKey) => {
    if (sortKey === next) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(next)
    setSortDirection('asc')
  }

  if (profile.selectedId) {
    return <BorrowerProfilePage borrowerId={profile.selectedId} onBack={profile.close} />
  }

  return (
    <div className={`mt-2 space-y-4 ${ZORD_SURFACE_CLASS}`}>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`text-[1.35rem] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>{source.header.title}</h2>
            <span className="inline-flex items-center rounded-full border border-[#cbd5e1] bg-[#f4f4f5] px-2.5 py-0.5 text-[12px] font-semibold text-[#000000]">
              {source.header.statusPill}
            </span>
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[12px] font-semibold text-sky-700">
              {source.header.providerPill}
            </span>
          </div>
          <p className={ZORD_SURFACE_MUTED}>
            Operate borrower readiness before disbursal with one verification workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/payout-command-view/batch-command-center"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-[#0f172a] transition hover:bg-slate-50"
          >
            <Glyph name="folder" className="h-4 w-4" />
            Upload batch
          </Link>
          <button
            type="button"
            onClick={handleRunCheck}
            disabled={runningCheck}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f172a] px-3.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-70"
          >
            <Glyph name="refresh" className={`h-4 w-4 ${runningCheck ? 'animate-spin' : ''}`} />
            {runningCheck ? 'Running check…' : 'Run check'}
          </button>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-2.5">
        <p className="text-[13px] font-medium text-sky-900">
          {source.header.syncLine} · Last pull {source.header.lastPullMinutes} min ago · Manual review fallback active for{' '}
          {source.header.manualReviewFallbackBorrowers} borrowers · Last check {formatClock(lastCheckAt)}
        </p>
        <Link
          href="/payout-command-view/today?dock=grid&tab=failures"
          className="text-[13px] font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4"
        >
          View manual queue
        </Link>
      </section>

      <JournalIntelligenceKpiHero
        eyebrow="Borrower verification"
        value={String(source.summary.safeToDisburse)}
        deltaPill={`${source.summary.kycPassRate}% pass`}
        subcopy={`Total borrowers ${source.totals.totalBorrowers.toLocaleString('en-IN')} · Last pull ${source.header.lastPullMinutes} min ago`}
        buckets={heroBuckets}
        testId="borrower-verification-kpi-hero"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {complianceCards.map((card) => (
          <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-[1.02rem] font-semibold text-[#000000]">{card.title}</h3>
            <dl className="mt-3 space-y-1.5 text-[14px]">
              {card.metrics.map((metric) => (
                <div key={metric.label} className="flex items-center justify-between">
                  <dt className="font-medium text-[#00239C]">{metric.label}</dt>
                  <dd
                    className={`font-semibold tabular-nums ${
                      metric.tone === 'good' ? 'text-[#000000]' : metric.tone === 'warn' ? 'text-[#92400e]' : 'text-[#b91c1c]'
                    } ${dmMono.className}`}
                  >
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#3b82f6] via-[#0ea5e9] to-[#10b981]" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Verification volume</h3>
              <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>Checks processed per day — last 7 days</p>
            </div>
            <div className="text-right">
              <p className={`text-[26px] font-semibold leading-none ${HOME_TITLE_BLACK} ${dmMono.className}`}>
                {source.trend.verificationsProcessed.reduce((sum, v) => sum + v, 0).toLocaleString('en-IN')}
              </p>
              <p className="text-[12px] font-semibold text-[#00239C]">checks this week</p>
            </div>
          </div>
          <VolumeAreaChart />
        </article>

        <article className="relative overflow-hidden rounded-2xl border border-[#24499e] p-5 text-white shadow-[0_14px_34px_rgba(0,35,156,0.32)]" style={{ background: INTELLIGENCE_BLUE_GRADIENT }}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/75">Verification insights</p>
            <span className="inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-semibold text-white">
              {source.insights.length} insights · {totalInsightCases} linked cases
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {source.insights.map((insight) => (
              <li key={insight.title} className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    insight.severity === 'high' ? 'bg-[#fda4af]' : insight.severity === 'medium' ? 'bg-[#fcd34d]' : 'bg-[#cbd5e1]'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-white">
                    {insight.title}
                    {insight.caseCount ? (
                      <span className={`ml-2 inline-flex rounded-full bg-white/90 px-1.5 text-[11px] font-semibold text-[#00239C] ${dmMono.className}`}>
                        {insight.caseCount}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[12.5px] leading-snug text-white/75">{insight.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Verification funnel</h3>
          <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>Stage conversion from application to disbursal-ready</p>
          <div className="mt-4 space-y-3">
            {funnelRows.map((step) => (
              <div key={step.label}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-[#00239C]">{step.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={`font-semibold tabular-nums ${HOME_TITLE_BLACK} ${dmMono.className}`}>{step.count}</span>
                    {step.dropPct !== null && step.dropPct > 0 ? (
                      <span className={`rounded-full bg-[#fee2e2] px-1.5 py-0.5 text-[11px] font-semibold text-[#b91c1c] ${dmMono.className}`}>
                        -{step.dropPct}%
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#2563eb]"
                    style={{ width: `${step.ratio}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>Top risk signals</h3>
              <p className={`mt-0.5 ${ZORD_SURFACE_MUTED}`}>Flagged across active verifications</p>
            </div>
            <div className="text-right">
              <p className={`text-[26px] font-semibold leading-none ${HOME_TITLE_BLACK} ${dmMono.className}`}>{riskTotal}</p>
              <p className="text-[12px] font-semibold text-[#00239C]">total flags</p>
            </div>
          </div>
          <div className="mt-5 space-y-3.5">
            {source.riskSignals.map((signal) => (
              <div key={signal.label} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
                <span className="text-[13px] font-semibold text-[#00239C]">{signal.label}</span>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${signal.value >= 14 ? 'bg-[#ef4444]' : signal.value >= 8 ? 'bg-[#f59e0b]' : 'bg-[#94a3b8]'}`}
                    style={{ width: `${(signal.value / riskMax) * 100}%` }}
                  />
                </div>
                <span className={`w-7 text-right text-[14px] font-semibold tabular-nums ${HOME_TITLE_BLACK} ${dmMono.className}`}>
                  {signal.value}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section>
        <div className="rounded-[14px] border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>Borrower queue</p>
              <p className="text-[12px] font-medium text-[#00239C]">Click any borrower to open the full 360° profile</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Glyph name="search" className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search borrower, stage, or reason"
                className={`w-56 border-0 bg-transparent text-[13px] font-medium outline-none placeholder:text-slate-400 ${HOME_TITLE_BLACK}`}
              />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {QUEUE_FILTERS.map((filter) => {
              const active = queueFilter === filter
              const count = source.queueCounts[filter]
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setQueueFilter(filter)}
                  className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition ${
                    active
                      ? 'border-[#0f172a] bg-[#0f172a] text-white'
                      : `border-slate-300 bg-white ${HOME_TITLE_BLACK} hover:bg-slate-50`
                  }`}
                >
                  {filter} ({count})
                </button>
              )
            })}
          </div>

          <div className="overflow-x-auto rounded-[10px] border border-slate-200">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left">
                    <SortHeader label="Borrower" sortKey="borrower" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#00239C]">Product</th>
                  <th className="px-3 py-2 text-left">
                    <SortHeader label="Amount" sortKey="loan" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#00239C]">Checks</th>
                  <th className="px-3 py-2 text-left">
                    <SortHeader label="Risk" sortKey="risk" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2 text-left">
                    <SortHeader label="SLA" sortKey="sla" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#00239C]">Stage</th>
                  <th className="px-3 py-2 text-left">
                    <SortHeader label="Status" sortKey="status" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[14px] font-medium text-[#00239C]">
                      No borrowers match your filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr
                      key={row.borrowerId}
                      onClick={() => profile.open(row.borrowerId)}
                      className="cursor-pointer border-t border-slate-200 transition hover:bg-sky-50/50"
                    >
                      <td className="px-3 py-2.5">
                        <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>{row.borrowerName}</p>
                        <p className={`text-[12px] font-medium text-[#00239C] ${dmMono.className}`}>{row.borrowerId}</p>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] font-medium text-[#00239C]">{row.product}</td>
                      <td className={`px-3 py-2.5 text-[14px] font-semibold tabular-nums ${HOME_TITLE_BLACK} ${dmMono.className}`}>
                        {formatLoanCompact(row.loanAmountInr)}
                      </td>
                      <td className="px-3 py-2.5">
                        <SignalChips row={row} />
                      </td>
                      <td className={`px-3 py-2.5 text-[14px] font-semibold tabular-nums ${riskScoreTone(row.riskScore)} ${dmMono.className}`}>
                        {row.riskScore}
                      </td>
                      <td className={`px-3 py-2.5 text-[13px] font-semibold tabular-nums ${row.slaMinutes !== null && row.slaMinutes < 90 ? 'text-[#b91c1c]' : 'text-[#475569]'} ${dmMono.className}`}>
                        {formatSla(row.slaMinutes)}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-[13px] font-semibold text-[#00239C]">{row.stage}</p>
                        {row.failReason ? (
                          <p className="max-w-[220px] truncate text-[12px] font-medium text-[#92400e]" title={row.failReason}>
                            {row.failReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${statusBadgeTone(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[13px] font-medium text-slate-600">
            <p>
              Showing {sortedRows.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + ROWS_PER_PAGE, sortedRows.length)} of {sortedRows.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded border border-slate-300 px-2 py-1 text-[12px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="rounded border border-slate-300 px-2 py-1 text-[12px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
