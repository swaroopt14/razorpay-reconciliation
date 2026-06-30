'use client'

import { useEffect, useState } from 'react'
import { PaymentValueTrendChart } from './PaymentValueTrendChart'
import { PAYMENT_COMMAND_CENTER } from './paymentCommandCopy'
import {
  PAYMENT_TREND_GRAN_ORDER,
  PAYMENT_TREND_GRANULARITY,
  trendPointHasData,
  type PaymentTrendGranularity,
} from './paymentTrendChartConfig'
import type { PaymentTrendChartPoint } from './PaymentValueTrendChart'
import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'

type Props = {
  /** One point per calendar bucket from API — no resampling or value duplication. */
  series: PaymentTrendChartPoint[]
  loading?: boolean
  period: DisbursementTrendRange
  onPeriodChange: (period: DisbursementTrendRange) => void
  className?: string
}

export function PaymentTrendPanel({
  series,
  loading = false,
  period,
  onPeriodChange,
  className,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const chartReady = series.length > 0
  const hasAnyValue = series.some(trendPointHasData)

  useEffect(() => {
    setActiveIndex(null)
  }, [period, series])

  return (
    <div
      className={className}
      style={{
        width: '100%',
        background: 'transparent',
        padding: '0 0 8px',
        boxSizing: 'border-box',
        color: '#111',
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: '#9aa0a6', fontWeight: 600 }}>
          PAYMENT VALUE · INTENDED VS CONFIRMED
        </div>
        <nav style={{ display: 'flex', gap: 16 }}>
          {PAYMENT_TREND_GRAN_ORDER.map((key) => {
            const tab = PAYMENT_TREND_GRANULARITY[key]
            const active = period === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPeriodChange(key)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '0 0 3px',
                  fontSize: 15,
                  color: active ? '#111' : '#9aa0a6',
                  fontWeight: active ? 600 : 400,
                  borderBottom: active ? '2px solid #111' : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </header>

      <p
        style={{
          margin: '12px 0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px 20px',
          fontSize: 13,
          color: '#6f716d',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#171717' }} />
          {PAYMENT_COMMAND_CENTER.legendIntended}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C7C7C' }} />
          {PAYMENT_COMMAND_CENTER.legendConfirmed}
        </span>
      </p>

      <div onMouseLeave={() => setActiveIndex(null)}>
        {loading ? (
          <div className="h-[22rem] w-full animate-pulse rounded-lg bg-slate-100/80" aria-busy="true" />
        ) : chartReady && hasAnyValue ? (
          <PaymentValueTrendChart
            key={period}
            period={period}
            points={series}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
          />
        ) : (
          <div className="flex h-[22rem] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center text-[14px] text-slate-600">
            No trend data in this range yet.
          </div>
        )}
      </div>
    </div>
  )
}
