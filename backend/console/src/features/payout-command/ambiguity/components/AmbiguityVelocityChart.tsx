'use client'

import { useState } from 'react'
import { Flame, LineChart, Link2, TrendingUp } from 'lucide-react'
import type {
  AmbiguityKpiResolved,
  AmbiguityVelocityPoint,
  BatchContractKpiResponse,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import {
  displayApiField,
  formatApiCount,
  formatApiMinorField,
  formatKpiMoneyMinor,
  toDisplayPercent,
} from '../../shared/formatApiKpiFields'

function pctLabel(value: number | null | undefined): string {
  const pct = toDisplayPercent(value)
  return pct == null ? '-' : `${Math.round(pct * 10) / 10}%`
}

type Timeframe = 'day' | 'week' | 'month' | 'year'
type MetricKey = 'review_count' | 'low_confidence_count' | 'missing_ref_count'

type Props = {
  amb: AmbiguityKpiResolved | null
  batchContract?: BatchContractKpiResponse | null
  batchContractLoading?: boolean
  selectedBatchId?: string
}

const TIMEFRAMES: Timeframe[] = ['day', 'week', 'month', 'year']

const METRICS: Array<{
  key: MetricKey
  label: string
  shortLabel: string
  color: string
  soft: string
  text: string
}> = [
  {
    key: 'review_count',
    label: 'Reviews',
    shortLabel: 'Review',
    color: '#111827',
    soft: 'bg-slate-100',
    text: 'text-slate-950',
  },
  {
    key: 'low_confidence_count',
    label: 'Low confidence',
    shortLabel: 'Low',
    color: '#0B1324',
    soft: 'bg-[#F1F5F9]',
    text: 'text-[#0B1324]',
  },
  {
    key: 'missing_ref_count',
    label: 'Missing refs',
    shortLabel: 'Missing',
    color: '#0B1324',
    soft: 'bg-[#F1F5F9]',
    text: 'text-[#0B1324]',
  },
]

function formatPeriod(value: string | number) {
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(8)
  if (raw.length <= 8) return raw
  return raw.slice(5)
}

function metricValue(point: AmbiguityVelocityPoint | undefined, key: MetricKey): number | null {
  const value = point?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function metricMax(series: AmbiguityVelocityPoint[], key: MetricKey) {
  return Math.max(1, ...series.map((point) => metricValue(point, key) ?? 0))
}

function cellStyle(value: number | null, max: number, color: string) {
  if (value == null) {
    return {
      backgroundColor: '#f8fafc',
      borderColor: '#e2e8f0',
      color: '#94a3b8',
    }
  }

  const ratio = Math.max(0.18, Math.min(1, value / max))
  return {
    backgroundColor: color,
    borderColor: color,
    color: ratio > 0.58 ? '#ffffff' : '#0f172a',
    opacity: 0.18 + ratio * 0.72,
  }
}

function ContractStat({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string
  value: string
  helper?: string
  tone?: 'neutral' | 'dark' | 'orange' | 'red'
}) {
  const toneClass =
    tone === 'dark'
      ? 'border-slate-800 bg-slate-950 text-white'
      : tone === 'orange'
        ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
        : tone === 'red'
          ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
          : 'border-slate-200 bg-white text-slate-950'

  return (
    <article className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className={`text-[10px] font-bold uppercase ${tone === 'dark' ? 'text-white/45' : 'text-slate-400'}`}>
        {label}
      </p>
      <p className="mt-2 text-[1.25rem] font-semibold leading-none tabular-nums">{value}</p>
      {helper ? (
        <p className={`mt-2 text-[11px] font-semibold ${tone === 'dark' ? 'text-white/50' : 'text-slate-500'}`}>
          {helper}
        </p>
      ) : null}
    </article>
  )
}

function ContractSignalPanel({
  amb,
  batchContract,
  batchContractLoading,
  selectedBatchId,
}: {
  amb: AmbiguityKpiResolved | null
  batchContract?: BatchContractKpiResponse | null
  batchContractLoading?: boolean
  selectedBatchId?: string
}) {
  const hasBatch = Boolean(selectedBatchId)

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
            <Link2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Contract signal</p>
            <h4 className="mt-1 text-[1rem] font-semibold leading-tight text-slate-950">
              {hasBatch ? 'Selected batch reference coverage' : 'Tenant ambiguity context'}
            </h4>
            <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-500">
              {hasBatch
                ? 'Batch contract fields returned by the intelligence API.'
                : 'Select a batch to load batch_contract coverage and variance fields.'}
            </p>
          </div>
        </div>
        {hasBatch ? (
          <span className="max-w-[18rem] truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">
            {selectedBatchId}
          </span>
        ) : null}
      </div>

      {hasBatch ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ContractStat
            label="Bank ref coverage"
            value={displayApiField(batchContract?.bank_reference_coverage, batchContractLoading)}
            helper={`${formatApiCount(batchContract?.bank_ref_present_count, batchContractLoading)} refs present`}
            tone="dark"
          />
          <ContractStat
            label="Client ref coverage"
            value={displayApiField(batchContract?.client_reference_coverage, batchContractLoading)}
            helper={`${formatApiCount(batchContract?.client_ref_present_count, batchContractLoading)} refs present`}
          />
          <ContractStat
            label="Missing ref rate"
            value={displayApiField(batchContract?.missing_reference_rate, batchContractLoading)}
            helper={`${formatApiCount(batchContract?.settlement_ref_count, batchContractLoading)} settlement refs`}
            tone="orange"
          />
          <ContractStat
            label="Match confidence"
            value={displayApiField(batchContract?.match_confidence, batchContractLoading)}
            helper="batch_contract field"
          />
          <ContractStat
            label="Variance"
            value={formatApiMinorField(batchContract?.variance_amount, batchContractLoading)}
            helper="contract variance amount"
            tone="red"
          />
          <ContractStat
            label="Unmatched"
            value={formatApiMinorField(batchContract?.unmatch_amount, batchContractLoading)}
            helper="unmatched amount"
          />
          <ContractStat
            label="Orphan"
            value={formatApiMinorField(batchContract?.orphan_amount, batchContractLoading)}
            helper="orphan amount"
          />
          <ContractStat
            label="Confirmed"
            value={formatApiMinorField(batchContract?.total_confirmed_amount, batchContractLoading)}
            helper="confirmed amount"
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ContractStat
            label="Review cases"
            value={formatApiCount(amb?.ambiguous_intent_count)}
            helper="ambiguity API"
            tone="dark"
          />
          <ContractStat
            label="At risk"
            value={formatKpiMoneyMinor(amb?.value_at_risk_minor)}
            helper="tenant match exposure"
          />
          <ContractStat
            label="Provider refs missing"
            value={pctLabel(amb?.provider_ref_missing_rate)}
            helper="ambiguity API"
            tone="orange"
          />
          <ContractStat
            label="Attachment confidence"
            value={pctLabel(amb?.avg_attachment_confidence)}
            helper="average score"
          />
        </div>
      )}
    </div>
  )
}

export function AmbiguityVelocityChart({
  amb,
  batchContract,
  batchContractLoading,
  selectedBatchId,
}: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('day')
  const series = amb?.velocity_series?.[timeframe] ?? []
  const hasSeries = series.length > 0
  const maxByMetric = Object.fromEntries(
    METRICS.map((metric) => [metric.key, metricMax(series, metric.key)]),
  ) as Record<MetricKey, number>

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
      data-testid="ambiguity-velocity-chart"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef3ff] text-[#4169e1]">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Velocity</p>
            <h3 className="mt-1 text-[1.2rem] font-semibold leading-tight text-slate-950">
              Ambiguity review flow
            </h3>
            <p className="mt-1 text-[13px] font-medium text-slate-500">
              Review, low-confidence, and missing-reference counts from the ambiguity API.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTimeframe(item)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize transition ${
                timeframe === item ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:text-slate-950'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[340px] min-w-0 p-4 sm:p-5">
        {hasSeries ? (
          <div className="h-full rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `4.6rem repeat(${series.length}, minmax(0, 1fr))`,
              }}
            >
              <span aria-hidden />
              {series.map((point) => (
                <span
                  key={point.period}
                  className="truncate text-center text-[10px] font-bold uppercase text-slate-400"
                  title={String(point.period)}
                >
                  {formatPeriod(point.period)}
                </span>
              ))}

              {METRICS.map((metric) => (
                <div key={metric.key} className="contents">
                  <div className={`flex min-h-12 items-center rounded-xl px-3 ${metric.soft}`}>
                    <span className={`truncate text-[12px] font-bold ${metric.text}`}>{metric.shortLabel}</span>
                  </div>
                  {series.map((point) => {
                    const value = metricValue(point, metric.key)
                    return (
                      <div
                        key={`${metric.key}-${point.period}`}
                        className="flex min-h-12 items-center justify-center rounded-xl border text-[12px] font-bold tabular-nums shadow-sm transition hover:scale-[1.02]"
                        style={cellStyle(value, maxByMetric[metric.key] ?? 1, metric.color)}
                        title={`${metric.label} · ${point.period}: ${displayApiField(value)}`}
                      >
                        {displayApiField(value)}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <div className="flex flex-wrap items-center gap-3">
                {METRICS.map((metric) => (
                  <span key={metric.key} className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: metric.color }} />
                    {metric.label}
                  </span>
                ))}
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-500 shadow-sm">
                <Flame className="h-3.5 w-3.5 text-[#0B1324]" aria-hidden="true" />
                API heatmap
              </span>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[300px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
            <div>
              <LineChart className="mx-auto h-5 w-5 text-slate-300" aria-hidden="true" />
              <p className="mt-2 text-[13px] font-semibold text-slate-600">
                No {timeframe} velocity series returned by the API.
              </p>
            </div>
          </div>
        )}
        <ContractSignalPanel
          amb={amb}
          batchContract={batchContract}
          batchContractLoading={batchContractLoading}
          selectedBatchId={selectedBatchId}
        />
      </div>
    </section>
  )
}
