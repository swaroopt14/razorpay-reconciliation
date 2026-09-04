'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, LineChart } from 'lucide-react'
import {
  DEFAULT_GAPS_FILTERS,
  DEMO_GAP_ROWS,
  DEMO_GAP_TREND,
  DEMO_RISK_ADJUSTED,
  GAPS_FILTER_OPTIONS,
  PAYMENT_GAPS_HEADER,
  categoriesFromRows,
  filterGapRows,
  formatGapsInr,
  gapDestinationHref,
  loadStoredGapsFilters,
  outcomeReviewHref,
  storeGapsFilters,
  valueRequiringReview,
  type GapCategoryId,
  type GapsFilterState,
} from '@/services/payout-command/demo/paymentGapsDemo'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { INDIA_CASE } from '@/services/payout-command/demo/indiaBulkCaseStudy'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { LifecycleSummaryStrip } from '../shared/LifecycleSummaryStrip'
import { PaymentGapsGetStartedCard } from './PaymentGapsGetStartedCard'

function TrendChart({ points }: { points: { date: string; valueRupees: number }[] }) {
  if (points.length < 2) return null
  const w = 560
  const h = 160
  const padX = 12
  const padY = 16
  const max = Math.max(...points.map((p) => p.valueRupees), 1)
  const min = 0
  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * (w - padX * 2)
    const y = padY + (1 - (p.valueRupees - min) / (max - min)) * (h - padY * 2)
    return { x, y, ...p }
  })
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[160px] w-full" role="img" aria-label="Potential exposure trend">
      <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="#E5E7EB" strokeWidth="1" />
      <path d={path} fill="none" stroke="#2E5BFF" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c) => (
        <circle key={c.date} cx={c.x} cy={c.y} r="3" fill="#FFFFFF" stroke="#2E5BFF" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

/**
  * Spec 7.13 - Payment Gaps & Value at Risk.
  * Razorpay-like: white surfaces, hairline borders, one hero metric, quiet accent blue.
  */
export function PaymentGapsSurface() {
  const router = useRouter()
  const { ready, readiness, require } = useDemoBatchReady(undefined, { require: 'both' })
  const [filters, setFilters] = useState<GapsFilterState>(() => ({ ...DEFAULT_GAPS_FILTERS }))
  const [hydrated, setHydrated] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setFilters(loadStoredGapsFilters())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    storeGapsFilters(filters)
  }, [filters, hydrated])

  const filteredRows = useMemo(() => filterGapRows(DEMO_GAP_ROWS, filters), [filters])
  const categories = useMemo(() => categoriesFromRows(filteredRows), [filteredRows])
  const heroValue = useMemo(() => valueRequiringReview(filteredRows), [filteredRows])
  const hasRows = filteredRows.length > 0

  function updateFilter<K extends keyof GapsFilterState>(key: K, value: GapsFilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function openCategory(id: GapCategoryId) {
    router.push(gapDestinationHref(id, filters))
  }

  function exportReport() {
    const header =
      'payment_ref,contract_id,category,potential_exposure,batch,legal_entity,country,rail,provider,policy,value_date\n'
    const body = filteredRows
      .map(
        (r) =>
          `${r.paymentRef},${r.contractId},${r.categoryLabel},${r.potentialExposureRupees},${r.batchId},${r.legalEntity},${r.country},${r.rail},${r.provider},${r.policy},${r.valueDate}`,
      )
      .join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'payment-gaps-exposure.csv'
    a.click()
    URL.revokeObjectURL(url)
    setToast('Exported exposure report (potential exposure - not classified as loss)')
    window.setTimeout(() => setToast(null), 2800)
  }

  const selectClass =
    'h-9 rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] text-[#1A1A1A] outline-none focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]/20'

  if (!ready) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
        <div className="mx-auto w-full max-w-[1280px] space-y-5">
          <PageExplainerBanner page="gaps" />
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
              {PAYMENT_GAPS_HEADER.title}
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6B6B6B]">
              {PAYMENT_GAPS_HEADER.subtitle}
            </p>
          </div>
          <AwaitingUploadsEmptyState
            title="No potential exposure data yet"
            readiness={readiness}
            require={require}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
      <div className="mx-auto w-full max-w-[1280px]">
        <PageExplainerBanner page="gaps" />
        {/* Header - Razorpay-style: title + one-line + primary CTA row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
              {PAYMENT_GAPS_HEADER.title}
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6B6B6B]">
              {PAYMENT_GAPS_HEADER.subtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportReport}
              disabled={!hasRows}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#1A1A1A] transition hover:bg-[#FAFAFA] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Export exposure report
            </button>
            <a
              href="#gaps-trend"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#1A1A1A] transition hover:bg-[#FAFAFA]"
            >
              <LineChart className="h-3.5 w-3.5" strokeWidth={2} />
              Open trend details
            </a>
            <Link
              href={outcomeReviewHref('', filters)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#2E5BFF] px-3.5 text-[13px] font-semibold text-white transition hover:bg-[#2448D4]"
            >
              Review affected payouts
            </Link>
          </div>
        </div>

        <div className="mt-5">
          <PaymentGapsGetStartedCard reviewHref={outcomeReviewHref('', filters)} />
        </div>

        {/* Filters */}
        <div className="mt-5 rounded-lg border border-[#E5E7EB] bg-white p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#6B6B6B]">Filters</p>
            <button
              type="button"
              className="text-[12px] font-medium text-[#2E5BFF] hover:underline"
              onClick={() =>
                setFilters({
                  dateFrom: '',
                  dateTo: '',
                  legalEntity: '',
                  batch: '',
                  rail: '',
                  country: '',
                  policy: '',
                })
              }
            >
              Clear
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#6B6B6B]">Date from</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className={selectClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#6B6B6B]">Date to</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
                className={selectClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#6B6B6B]">Legal entity</span>
              <select
                value={filters.legalEntity}
                onChange={(e) => updateFilter('legalEntity', e.target.value)}
                className={selectClass}
              >
                <option value="">All</option>
                {GAPS_FILTER_OPTIONS.legalEntities.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#6B6B6B]">Batch</span>
              <select
                value={filters.batch}
                onChange={(e) => updateFilter('batch', e.target.value)}
                className={selectClass}
              >
                <option value="">All</option>
                {GAPS_FILTER_OPTIONS.batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#6B6B6B]">Rail / provider</span>
              <select
                value={filters.rail}
                onChange={(e) => updateFilter('rail', e.target.value)}
                className={selectClass}
              >
                <option value="">All</option>
                {GAPS_FILTER_OPTIONS.rails.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#6B6B6B]">Country</span>
              <select
                value={filters.country}
                onChange={(e) => updateFilter('country', e.target.value)}
                className={selectClass}
              >
                <option value="">All</option>
                {GAPS_FILTER_OPTIONS.countries.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#6B6B6B]">Policy</span>
              <select
                value={filters.policy}
                onChange={(e) => updateFilter('policy', e.target.value)}
                className={selectClass}
              >
                <option value="">All</option>
                {GAPS_FILTER_OPTIONS.policies.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2.5 text-[11px] text-[#8C8C8C]">
            Filters persist to Outcome Review. Amounts are potential exposure until classified - never labelled loss.
          </p>
        </div>

        {/* Hero metric + category cells (Intent-style; primary metric = Value requiring review) */}
        <div className="mt-4">
          <LifecycleSummaryStrip
            heroLabel="Value requiring review"
            heroValue={formatGapsInr(heroValue)}
            heroHint={`${INDIA_CASE.exceptionCount} exceptions vs sealed contracts · same as Settlement / Outcome Review. Waiting is unmatched intent, not loss.`}
            cells={[
              {
                label: 'Waiting for settlement',
                value: formatGapsInr(INDIA_CASE.waitingValue),
                hint: 'Ack received · final settlement not yet observed',
              },
              {
                label: 'Returned value',
                value: formatGapsInr(INDIA_CASE.returnedValue),
                hint: 'Provider return / reject after dispatch',
              },
              {
                label: 'Reversal exposure',
                value: formatGapsInr(INDIA_CASE.reversalValue),
                hint: 'Reversal signals against sealed contracts',
              },
              {
                label: 'Missing references',
                value: String(INDIA_CASE.missingRefCount),
                hint: 'Rows missing provider / bank reference',
              },
            ]}
          />
        </div>

        {/* Categories */}
        <div
          id="gaps-categories"
          className="mt-4 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white"
        >
          <div className="border-b border-[#E5E7EB] px-5 py-3.5">
            <p className="text-[14px] font-semibold text-[#1A1A1A]">Potential exposure by category</p>
            <p className="mt-0.5 text-[12px] text-[#6B6B6B]">
              Unmatched intent opens Settlement Journal. Short, return, and unresolved open Outcome Review.
            </p>
          </div>
          <ul className="divide-y divide-[#F0F0F0]">
            {categories.map((cat) => {
              const empty = cat.payoutCount === 0
              return (
                <li key={cat.id}>
                  <button
                    type="button"
                    disabled={empty}
                    onClick={() => openCategory(cat.id)}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-[#FAFBFC] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#1A1A1A]">{cat.label}</p>
                      <p className="mt-0.5 truncate text-[12px] text-[#6B6B6B]">{cat.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-semibold tabular-nums text-[#1A1A1A]">
                        {formatGapsInr(cat.valueRupees)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#8C8C8C]">
                        {cat.payoutCount} payout{cat.payoutCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    {!empty ? (
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#2E5BFF]" strokeWidth={2} />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Trend + risk-adjusted */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div id="gaps-trend" className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[14px] font-semibold text-[#1A1A1A]">Potential exposure trend</p>
                <p className="mt-0.5 text-[12px] text-[#6B6B6B]">
                  From historical settlement observations in this workspace
                </p>
              </div>
            </div>
            <div className="mt-3">
              <TrendChart points={DEMO_GAP_TREND} />
              <div className="mt-1 flex justify-between text-[10px] text-[#8C8C8C]">
                {DEMO_GAP_TREND.filter((_, i) => i % 2 === 0).map((p) => (
                  <span key={p.date}>{p.date}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
            <p className="text-[14px] font-semibold text-[#1A1A1A]">Risk-adjusted payment exposure</p>
            {!DEMO_RISK_ADJUSTED.available ? (
              <div className="mt-3 rounded-md border border-dashed border-[#E5E7EB] bg-[#FAFBFC] px-3 py-4">
                <p className="text-[12px] font-semibold text-[#1A1A1A]">Not available yet</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#6B6B6B]">
                  {DEMO_RISK_ADJUSTED.reason}
                </p>
                <p className="mt-2 text-[11px] text-[#8C8C8C]">
                  Predicted leakage is hidden until history and model quality meet production bar.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Affected payouts table */}
        <div className="mt-4 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-5 py-3.5">
            <div>
              <p className="text-[14px] font-semibold text-[#1A1A1A]">Affected payouts</p>
              <p className="mt-0.5 text-[12px] text-[#6B6B6B]">
                Unmatched waiting opens Settlement Journal. Exceptions open Outcome Review.
              </p>
            </div>
            <Link
              href={outcomeReviewHref('', filters)}
              className="text-[13px] font-semibold text-[#2E5BFF] hover:underline"
            >
              Review affected payouts
            </Link>
          </div>

          {!hasRows ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[14px] font-semibold text-[#1A1A1A]">No potential exposure in this filter</p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#6B6B6B]">
                Widen date range, clear legal entity / rail / policy filters, or collect settlement signals in
                Settlement Journal. Zero here means no unmatched, short-settled, reversed, or unresolved value
                under the current scope - not that all payouts are proven exact.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                    {['Payment', 'Category', 'Potential exposure', 'Rail', 'Entity', 'Policy', ''].map((h) => (
                      <th
                        key={h || 'act'}
                        className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6B6B6B]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="border-b border-[#F0F0F0] last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold tabular-nums text-[#1A1A1A]">{r.paymentRef}</p>
                        <p className="text-[11px] text-[#6B6B6B]">
                          {r.payeeLabel} · {r.contractId}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[#1A1A1A]">{r.categoryLabel}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={gapDestinationHref(r.categoryId, filters, r.paymentRef)}
                          className="font-semibold tabular-nums text-[#2E5BFF] hover:underline"
                        >
                          {formatGapsInr(r.potentialExposureRupees)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#6B6B6B]">
                        {r.rail} · {r.provider}
                      </td>
                      <td className="px-4 py-3 text-[#6B6B6B]">
                        {r.legalEntity}
                        <span className="text-[#8C8C8C]"> · {r.country}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#6B6B6B]">{r.policy}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={gapDestinationHref(r.categoryId, filters, r.paymentRef)}
                          className="text-[12px] font-semibold text-[#2E5BFF] hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1A1A1A] px-4 py-2 text-[13px] font-medium text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}
