'use client'

import type { ReactNode } from 'react'

export type NavyHeroBucket = {
  label: string
  value: string
  sub: string
  /** Optional 7-point mini sparkline rendered under the value (Stripe-style). */
  spark?: readonly number[]
  /** Sparkline stroke tone. Defaults to neutral white. */
  sparkTone?: 'good' | 'warn' | 'bad' | 'neutral'
}

type BucketCols = 3 | 4 | 5 | 6

type NavyMetricHeroProps = {
  eyebrow: string
  value: string
  /** Shown smaller after value, e.g. `/mo` */
  valueSuffix?: string
  /** Native hover tooltip on eyebrow + value (e.g. score scale explanation). */
  tooltip?: string
  deltaPill?: string
  subcopy: string
  buckets?: readonly NavyHeroBucket[]
  bucketCols?: BucketCols
  footer?: ReactNode
  className?: string
  testId?: string
  bucketTestIdPrefix?: string
}

const BUCKET_GRID_CLASS_BY_COLS: Record<BucketCols, string> = {
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 xl:grid-cols-4',
  5: 'grid-cols-2 xl:grid-cols-5',
  6: 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
}

function normalizeBucketTestIdLabel(label: string) {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return normalized || 'bucket'
}

function resolveBucketCols(explicit: BucketCols | undefined, bucketCount: number): BucketCols {
  if (explicit) return explicit
  if (bucketCount >= 6) return 6
  if (bucketCount === 5) return 5
  if (bucketCount === 4) return 4
  return 3
}

/**
 * Shared dark navy hero — matches Ambiguity & Leakage “Total ambiguity cost” card.
 * Use across Connector Intelligence and related finance surfaces.
 */
export function NavyMetricHero({
  eyebrow,
  value,
  valueSuffix,
  tooltip,
  deltaPill,
  subcopy,
  buckets,
  bucketCols,
  footer,
  className = '',
  testId,
  bucketTestIdPrefix,
}: NavyMetricHeroProps) {
  const bucketCount = buckets?.length ?? 0
  const resolvedCols = resolveBucketCols(bucketCols, bucketCount)
  const gridClass = BUCKET_GRID_CLASS_BY_COLS[resolvedCols]
  const resolvedBucketPrefix = bucketTestIdPrefix ?? (testId ? `${testId}-bucket` : undefined)

  return (
    <section
      className={`overflow-hidden rounded-[20px] bg-[#0f172a] p-6 text-white shadow-[0_16px_48px_-12px_rgba(15,23,42,0.45)] ring-1 ring-white/[0.08] ${className}`}
      data-testid={testId}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55"
        title={tooltip}
      >
        {eyebrow}
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <p
          className="text-[53px] font-light leading-none tracking-[-0.03em] tabular-nums"
          title={tooltip}
        >
          {value}
          {valueSuffix ? (
            <span className="ml-1.5 text-[27px] font-light tracking-[-0.02em] text-white/45">{valueSuffix}</span>
          ) : null}
        </p>
        {deltaPill ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[12px] font-medium text-white/75">
            {deltaPill}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-white/65">{subcopy}</p>
      {footer ? <div className="mt-4 flex flex-wrap gap-2">{footer}</div> : null}
      {buckets && buckets.length > 0 ? (
        <div className={`mt-5 grid gap-2.5 ${gridClass}`}>
          {buckets.map((b, index) => (
            <NavyHeroBucketCard
              key={`${b.label}-${index}`}
              {...b}
              testId={
                resolvedBucketPrefix
                  ? `${resolvedBucketPrefix}-${index}-${normalizeBucketTestIdLabel(b.label)}`
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

const SPARK_STROKE: Record<NonNullable<NavyHeroBucket['sparkTone']>, string> = {
  good: '#000000',
  warn: '#fbbf24',
  bad: '#f87171',
  neutral: 'rgba(255,255,255,0.65)',
}

function BucketSparkline({ points, tone = 'neutral' }: { points: readonly number[]; tone?: NavyHeroBucket['sparkTone'] }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * 100
    const y = 26 - ((p - min) / span) * 22
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const stroke = SPARK_STROKE[tone ?? 'neutral']
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-1.5 h-[26px] w-full" aria-hidden>
      <polygon points={`0,30 ${coords.join(' ')} 100,30`} fill={stroke} opacity={0.14} />
      <polyline points={coords.join(' ')} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function NavyHeroBucketCard({
  label,
  value,
  sub,
  spark,
  sparkTone,
  testId,
}: NavyHeroBucket & { testId?: string }) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.06] p-4" data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">{label}</p>
      <p className="mt-1.5 text-[25px] font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
      {spark ? <BucketSparkline points={spark} tone={sparkTone} /> : null}
      <p className="mt-1 text-[12px] leading-relaxed text-white/60">{sub}</p>
    </div>
  )
}
