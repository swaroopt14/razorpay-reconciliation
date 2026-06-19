'use client'

import type { ReactNode } from 'react'
import { NavyMetricHero, type NavyHeroBucket } from './NavyMetricHero'

type JournalIntelligenceKpiHeroProps = {
  eyebrow: string
  value: string
  valueSuffix?: string
  tooltip?: string
  deltaPill?: string
  subcopy: string
  buckets: readonly NavyHeroBucket[]
  footer?: ReactNode
  className?: string
  testId: string
}

export function JournalIntelligenceKpiHero({
  eyebrow,
  value,
  valueSuffix,
  tooltip,
  deltaPill,
  subcopy,
  buckets,
  footer,
  className,
  testId,
}: JournalIntelligenceKpiHeroProps) {
  const bucketCount = Math.max(3, Math.min(6, buckets.length)) as 3 | 4 | 5 | 6

  return (
    <NavyMetricHero
      eyebrow={eyebrow}
      value={value}
      valueSuffix={valueSuffix}
      tooltip={tooltip}
      deltaPill={deltaPill}
      subcopy={subcopy}
      buckets={buckets}
      bucketCols={bucketCount}
      footer={footer}
      className={className}
      testId={testId}
      bucketTestIdPrefix={`${testId}-bucket`}
    />
  )
}
