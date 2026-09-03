'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { InfoDot, RZ_CARD, RZ_MUTED, RZ_PAGE } from './razorpayChrome'

/** Demo numbers matching the Cash Position mock — structured, not invented per-row. */
const DEMO = {
  available: 24_82_450.78,
  availableDelta: 4.2,
  expectedIncoming: 8_41_230,
  committedOutflows: 5_21_540,
  unresolved: 42_500,
  exceptionCount: 8,
  projectedT7: 27_85_140.78,
  projectedDelta: 6.3,
  opening: 22_41_050,
  actualInflows: 6_85_920,
  fees: 32_450,
  taxes: 23_620,
  varianceVsExpected: 43_910.78,
  bestCase: 31_42_000,
  baseCase: 27_85_140,
  worstCase: 24_32_000,
  confidence: 87,
  taxRows: [
    { component: 'TDS', expected: 42_000, settled: 42_000, ledger: 42_000 },
    { component: 'GST', expected: 18_420, settled: 18_420, ledger: 18_420 },
    { component: 'Marketplace Fees', expected: 22_560, settled: 22_560, ledger: 22_560 },
    { component: 'Other Charges', expected: 10_600, settled: 10_600, ledger: 10_600 },
  ],
  inflowRows: [
    {
      type: 'Settlement',
      typeTone: 'settlement' as const,
      source: 'Razorpay Settlements (Batch 2401)',
      count: 1284,
      amount: 4_82_340,
      date: '13 Jun 2026',
      description: 'Net settlements after fees & taxes',
      status: 'Expected',
    },
    {
      type: 'Refund Reversal',
      typeTone: 'refund' as const,
      source: 'Refunds',
      count: 12,
      amount: 18_450,
      date: '14 Jun 2026',
      description: 'Chargeback reversals',
      status: 'Expected',
    },
    {
      type: 'Settlement',
      typeTone: 'settlement' as const,
      source: 'Razorpay Settlements (Batch 2402)',
      count: 896,
      amount: 3_40_440,
      date: '15 Jun 2026',
      description: 'Pending cycle — T+1 banking hours',
      status: 'Expected',
    },
  ],
  outflowRows: [
    {
      type: 'Payout',
      typeTone: 'payout' as const,
      source: 'Bulk NEFT · HDFC',
      count: 842,
      amount: 4_12_000,
      date: '13 Jun 2026',
      description: 'Approved bulk payout batch',
      status: 'Committed',
    },
    {
      type: 'Payout',
      typeTone: 'payout' as const,
      source: 'Vendor IMPS',
      count: 48,
      amount: 1_09_540,
      date: '14 Jun 2026',
      description: 'Scheduled vendor disbursements',
      status: 'Committed',
    },
  ],
}

function inr(n: number, decimals = 2): string {
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

function inrLakh(n: number): string {
  return `₹${(n / 100_000).toFixed(2)}L`
}

const DAYS = ['12 Jun', '13 Jun', '14 Jun', '15 Jun', '16 Jun', '17 Jun', '18 Jun']
const FLOW = {
  expected: [6.2, 8.1, 7.4, 9.2, 8.0, 10.1, 8.4],
  actual: [5.1, 6.8, 6.2, 7.5, 6.9, 8.2, 6.9],
  outflows: [3.2, 4.1, 5.0, 4.6, 5.2, 4.8, 5.2],
  net: [18.4, 20.1, 21.2, 22.8, 23.9, 25.6, 27.9],
}

const FORECAST_DAYS = ['Today', 'T+1', 'T+2', 'T+3', 'T+4', 'T+5', 'T+6', 'T+7']
const FORECAST = {
  base: [24.8, 25.4, 25.9, 26.3, 26.8, 27.2, 27.5, 27.9],
  high: [25.2, 26.4, 27.1, 28.0, 28.9, 29.6, 30.4, 31.4],
  low: [24.4, 24.6, 24.5, 24.4, 24.3, 24.3, 24.3, 24.3],
}

function polyline(values: number[], w: number, h: number, minY: number, maxY: number, pad = 8) {
  const span = maxY - minY || 1
  return values
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1)
      const y = h - pad - ((v - minY) / span) * (h - pad * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

function areaPath(high: number[], low: number[], w: number, h: number, minY: number, maxY: number, pad = 8) {
  const span = maxY - minY || 1
  const top = high.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, high.length - 1)
    const y = h - pad - ((v - minY) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const bottom = low
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(1, low.length - 1)
      const y = h - pad - ((v - minY) / span) * (h - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .reverse()
  return `M${top.join(' L')} L${bottom.join(' L')} Z`
}

function CashFlowChart() {
  const w = 640
  const h = 220
  const minY = -10
  const maxY = 30
  const ticks = [30, 20, 10, 0, -10]
  return (
    <svg viewBox={`0 0 ${w} ${h + 28}`} className="h-[248px] w-full" role="img" aria-label="Cash flow overview">
      {ticks.map((t) => {
        const y = 8 + ((maxY - t) / (maxY - minY)) * (h - 16)
        return (
          <g key={t}>
            <line x1={40} x2={w - 8} y1={y} y2={y} stroke="#EEF0F3" strokeWidth="1" />
            <text x={36} y={y + 3} textAnchor="end" className="fill-[#8F8F8F]" style={{ fontSize: 10 }}>
              {t}L
            </text>
          </g>
        )
      })}
      <g transform="translate(40,0)">
        <path d={polyline(FLOW.expected, w - 40, h, minY, maxY, 8)} fill="none" stroke="#86EFAC" strokeWidth="2.2" />
        <path d={polyline(FLOW.actual, w - 40, h, minY, maxY, 8)} fill="none" stroke="#3B82F6" strokeWidth="2.2" />
        <path d={polyline(FLOW.outflows, w - 40, h, minY, maxY, 8)} fill="none" stroke="#EF4444" strokeWidth="2.2" />
        <path
          d={polyline(FLOW.net, w - 40, h, minY, maxY, 8)}
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="2.2"
          strokeDasharray="4 3"
        />
      </g>
      {DAYS.map((d, i) => {
        const x = 40 + 8 + (i * (w - 40 - 16)) / (DAYS.length - 1)
        return (
          <text key={d} x={x} y={h + 18} textAnchor="middle" className="fill-[#8F8F8F]" style={{ fontSize: 10 }}>
            {d}
          </text>
        )
      })}
    </svg>
  )
}

function ForecastChart() {
  const w = 640
  const h = 180
  const minY = 22
  const maxY = 33
  return (
    <svg viewBox={`0 0 ${w} ${h + 28}`} className="h-[208px] w-full" role="img" aria-label="Forward cash forecast">
      <path
        d={areaPath(FORECAST.high, FORECAST.low, w - 8, h, minY, maxY, 12)}
        fill="#DBEAFE"
        opacity="0.7"
        transform="translate(4,0)"
      />
      <path
        d={polyline(FORECAST.base, w - 8, h, minY, maxY, 12)}
        fill="none"
        stroke="#2563EB"
        strokeWidth="2.4"
        transform="translate(4,0)"
      />
      {FORECAST.base.map((v, i) => {
        const x = 4 + 12 + (i * (w - 8 - 24)) / (FORECAST.base.length - 1)
        const y = 12 + ((maxY - v) / (maxY - minY)) * (h - 24)
        return <circle key={i} cx={x} cy={y} r="3" fill="#2563EB" />
      })}
      {FORECAST_DAYS.map((d, i) => {
        const x = 4 + 12 + (i * (w - 8 - 24)) / (FORECAST_DAYS.length - 1)
        return (
          <text key={d} x={x} y={h + 18} textAnchor="middle" className="fill-[#8F8F8F]" style={{ fontSize: 10 }}>
            {d}
          </text>
        )
      })}
    </svg>
  )
}

function KpiCard({
  label,
  value,
  hint,
  delta,
  warn,
  onClick,
}: {
  label: string
  value: string
  hint: string
  delta?: number
  warn?: boolean
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <p className="text-[12px] font-medium text-[#6B6B6B]">{label}</p>
        <InfoDot label={label} />
        {warn ? (
          <svg className="h-3.5 w-3.5 text-[#E89A1A]" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1.8 13 12.2H1L7 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M7 5.6v3.2M7 10.6h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        ) : null}
      </div>
      <p className="mt-2 text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-[#1A1A1A] sm:text-[22px]">
        {value}
      </p>
      {delta != null ? (
        <p className="mt-1 text-[12px] font-medium text-[#147A3F]">
          ↗ {delta.toFixed(1)}% <span className="font-normal text-[#8F8F8F]">vs last 7 days</span>
        </p>
      ) : (
        <p className={`mt-1 ${RZ_MUTED}`}>{hint}</p>
      )}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${RZ_CARD} px-4 py-3.5 text-left transition hover:border-[#D5D8DE]`}>
        {inner}
      </button>
    )
  }
  return <div className={`${RZ_CARD} px-4 py-3.5`}>{inner}</div>
}

type BottomTab = 'inflows' | 'outflows' | 'settlements' | 'payouts'

const BOTTOM_TABS: { id: BottomTab; label: string }[] = [
  { id: 'inflows', label: 'Expected Inflows' },
  { id: 'outflows', label: 'Committed Outflows' },
  { id: 'settlements', label: 'Pending Settlements' },
  { id: 'payouts', label: 'Scheduled Payouts' },
]

function typeBadge(tone: 'settlement' | 'refund' | 'payout', label: string) {
  const cls =
    tone === 'settlement'
      ? 'bg-[#E8F8EE] text-[#147A3F]'
      : tone === 'refund'
        ? 'bg-[#F3E8FF] text-[#7C3AED]'
        : 'bg-[#EEF4FF] text-[#2B6CB0]'
  return (
    <span className={`inline-flex h-6 items-center rounded-[4px] px-2 text-[11px] font-semibold ${cls}`}>{label}</span>
  )
}

export function CashPositionSurface() {
  const router = useRouter()
  const [bottomTab, setBottomTab] = useState<BottomTab>('inflows')
  const taxTotal = useMemo(() => DEMO.taxRows.reduce((s, r) => s + r.expected, 0), [])

  const tableRows =
    bottomTab === 'outflows' || bottomTab === 'payouts' ? DEMO.outflowRows : DEMO.inflowRows

  return (
    <div className={RZ_PAGE}>
      <div className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">Cash Position</h1>
              <InfoDot label="Real-time expected vs actual cash across settlements, payouts, fees and tax." />
            </div>
            <p className={`mt-1 ${RZ_MUTED}`}>Real-time view of expected vs actual cash across your business.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#E6E8EB] bg-white px-3 text-[13px] font-medium text-[#1A1A1A]"
            >
              <svg className="h-3.5 w-3.5 text-[#6B6B6B]" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="2" y="3" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M2 6h10M5 1.5v3M9 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              12 Jun – 18 Jun 2026
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#E6E8EB] bg-white px-3 text-[13px] font-medium text-[#1A1A1A]"
            >
              <svg className="h-3.5 w-3.5 text-[#6B6B6B]" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M2 10V4M2 10l2.5-2.5M2 4l2.5 2.5M12 4v6M12 4l-2.5 2.5M12 10l-2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Compare
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#E6E8EB] bg-white px-3 text-[13px] font-medium text-[#1A1A1A]"
            >
              <svg className="h-3.5 w-3.5 text-[#6B6B6B]" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M2 3.5h10M4 7h6M5.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Filters
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2563EB] px-3 text-[13px] font-medium text-white"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M7 2v7M4.5 6.5 7 9l2.5-2.5M2.5 11.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Available Cash" value={inr(DEMO.available)} hint="" delta={DEMO.availableDelta} />
          <KpiCard label="Expected Incoming" value={inr(DEMO.expectedIncoming)} hint="Today + next 7 days" />
          <KpiCard label="Committed Outflows" value={inr(DEMO.committedOutflows)} hint="Approved payouts" />
          <KpiCard
            label="Unresolved Exposure"
            value={inr(DEMO.unresolved)}
            hint={`${DEMO.exceptionCount} exceptions`}
            warn
            onClick={() => router.push('/exceptions')}
          />
          <KpiCard label="Projected Cash (T+7)" value={inr(DEMO.projectedT7)} hint="" delta={DEMO.projectedDelta} />
        </div>

        {/* Cash flow + summary */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className={`${RZ_CARD} px-5 py-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Cash Flow Overview</h2>
              <div className="flex flex-wrap gap-3 text-[11px] text-[#6B6B6B]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#86EFAC]" /> Expected Inflows
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#3B82F6]" /> Actual Inflows
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#EF4444]" /> Committed Outflows
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#8B5CF6]" /> Net Cash Position
                </span>
              </div>
            </div>
            <div className="mt-2">
              <CashFlowChart />
            </div>
          </section>

          <section className={`${RZ_CARD} px-5 py-4`}>
            <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Cash Position Summary</h2>
            <ul className="mt-3 space-y-0 text-[13px]">
              {(
                [
                  ['Opening Cash (12 Jun)', inr(DEMO.opening), 'neutral'],
                  ['+ Expected Inflows', inr(DEMO.expectedIncoming), 'plus'],
                  ['+ Actual Inflows', inr(DEMO.actualInflows), 'plus'],
                  ['- Committed Outflows', inr(DEMO.committedOutflows), 'minus'],
                  ['- Fees & Charges', inr(DEMO.fees), 'minus'],
                  ['- Taxes', inr(DEMO.taxes), 'minus'],
                ] as const
              ).map(([label, value, tone]) => (
                <li
                  key={label}
                  className="flex items-center justify-between border-b border-[#F1F5F9] py-2.5"
                >
                  <span className="text-[#6B6B6B]">{label}</span>
                  <span
                    className={`tabular-nums font-medium ${
                      tone === 'plus' ? 'text-[#147A3F]' : tone === 'minus' ? 'text-[#C0372A]' : 'text-[#1A1A1A]'
                    }`}
                  >
                    {value}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-[#E6E8EB] pt-3">
                <span className="font-semibold text-[#1A1A1A]">Projected Closing (18 Jun)</span>
                <span className="text-[15px] font-semibold tabular-nums text-[#1A1A1A]">{inr(DEMO.projectedT7)}</span>
              </li>
              <li className="mt-2 flex items-center justify-between rounded-[8px] bg-[#F0FDF4] px-3 py-2.5">
                <span className="text-[13px] text-[#147A3F]">Variance vs Expected</span>
                <span className="text-[13px] font-semibold tabular-nums text-[#147A3F]">
                  ↗ {inr(DEMO.varianceVsExpected)}
                </span>
              </li>
            </ul>
          </section>
        </div>

        {/* Forecast + tax */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className={`${RZ_CARD} px-5 py-4`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Forward Cash Forecaster</h2>
              <span className="rounded-full bg-[#EEF4FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#2B6CB0]">
                7 Days
              </span>
            </div>
            <div className="mt-2">
              <ForecastChart />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-[8px] border border-[#E6E8EB] bg-[#FAFBFC] px-3 py-2.5">
                <p className="text-[11px] text-[#8F8F8F]">Best Case (T+7)</p>
                <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#1A1A1A]">{inrLakh(DEMO.bestCase)}</p>
              </div>
              <div className="rounded-[8px] border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5">
                <p className="text-[11px] text-[#2B6CB0]">Base Case (T+7)</p>
                <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#1A1A1A]">{inrLakh(DEMO.baseCase)}</p>
              </div>
              <div className="rounded-[8px] border border-[#E6E8EB] bg-[#FAFBFC] px-3 py-2.5">
                <p className="text-[11px] text-[#8F8F8F]">Worst Case (T+7)</p>
                <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#1A1A1A]">{inrLakh(DEMO.worstCase)}</p>
              </div>
              <div className="rounded-[8px] border border-[#E6E8EB] bg-[#FAFBFC] px-3 py-2.5">
                <p className="text-[11px] text-[#8F8F8F]">Confidence</p>
                <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#1A1A1A]">{DEMO.confidence}%</p>
              </div>
            </div>
          </section>

          <section className={`${RZ_CARD} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F3] px-5 py-4">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Tax-Line Matcher</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F8EE] px-2.5 py-0.5 text-[11px] font-semibold text-[#147A3F]">
                ✓ All Matched
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[12px]">
                <thead className="bg-[#FAFBFC] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
                  <tr>
                    <th className="px-4 py-2.5">Tax Component</th>
                    <th className="px-3 py-2.5 text-right">Expected (₹)</th>
                    <th className="px-3 py-2.5 text-right">Settled (₹)</th>
                    <th className="px-3 py-2.5 text-right">Ledger (₹)</th>
                    <th className="px-3 py-2.5 text-right">Variance</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO.taxRows.map((row) => (
                    <tr key={row.component} className="border-t border-[#F3F4F6]">
                      <td className="px-4 py-2.5 font-medium text-[#1A1A1A]">{row.component}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#334155]">
                        {row.expected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#334155]">
                        {row.settled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#334155]">
                        {row.ledger.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#8F8F8F]">0.00</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#147A3F]">
                          ✓ Match
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#E6E8EB] bg-[#FAFBFC]">
                    <td className="px-4 py-3 font-semibold text-[#1A1A1A]">Total</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#1A1A1A]">
                      {taxTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#1A1A1A]">
                      {taxTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#1A1A1A]">
                      {taxTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#8F8F8F]">0.00</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#147A3F]">
                        ✓ All Matched
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Bottom table */}
        <section className={`${RZ_CARD} mt-4 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F3] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Expected Inflows &amp; Committed Outflows</h2>
            <button
              type="button"
              onClick={() => router.push('/settlements')}
              className="text-[13px] font-medium text-[#2563EB] hover:underline"
            >
              View All →
            </button>
          </div>
          <div className="flex gap-5 overflow-x-auto border-b border-[#EEF0F3] px-5">
            {BOTTOM_TABS.map((t) => {
              const on = t.id === bottomTab
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setBottomTab(t.id)}
                  className={`-mb-px whitespace-nowrap border-b-2 pb-3 pt-3 text-[13px] ${
                    on
                      ? 'border-[#1A1A1A] font-semibold text-[#1A1A1A]'
                      : 'border-transparent font-medium text-[#6B6B6B] hover:text-[#1A1A1A]'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8F8F8F]">
                <tr>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Count</th>
                  <th className="px-4 py-3 text-right">Amount (₹)</th>
                  <th className="px-4 py-3">Expected Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={`${row.source}-${row.date}`} className="border-t border-[#F3F4F6] hover:bg-[#FAFBFC]">
                    <td className="px-5 py-3">{typeBadge(row.typeTone, row.type)}</td>
                    <td className="px-4 py-3 font-medium text-[#1A1A1A]">{row.source}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#334155]">
                      {row.count.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-[#1A1A1A]">{inr(row.amount)}</td>
                    <td className="px-4 py-3 text-[#6B6B6B]">{row.date}</td>
                    <td className="px-4 py-3 text-[#6B6B6B]">{row.description}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex h-6 items-center rounded-[4px] bg-[#EEF4FF] px-2 text-[11px] font-semibold text-[#2B6CB0]">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
