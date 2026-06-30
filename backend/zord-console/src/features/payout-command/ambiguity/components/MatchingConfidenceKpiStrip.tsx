'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'
import { ambiguityCopy } from '../copy/ambiguityCopy'
import { formatDeltaPct, getKpiDeltas } from '../utils/ambiguityApiMappers'
import {
  displayApiField,
  formatApiCount,
  formatKpiMoneyMinor,
} from '../../shared/formatApiKpiFields'
import { KPI_UNAVAILABLE } from '../../shared/formatKpiDisplay'

type Props = { amb: AmbiguityKpiResolved | null; loading?: boolean; scopeHint?: string }

export function MatchingConfidenceKpiStrip({ amb, loading, scopeHint }: Props) {
  const pathname = usePathname()
  const isSandbox = pathname?.startsWith('/sandbox')
  const basePath = isSandbox ? '/sandbox' : '/payout-command-view/today'

  if (loading) {
    return (
      <div className="h-[286px] animate-pulse rounded-[20px] bg-slate-200/60" />
    )
  }

  const deltas = getKpiDeltas(amb)
  const ambiguityRateLabel = amb?.ambiguity_rate != null ? `${amb.ambiguity_rate}%` : '—'
  const ambiguityRateDelta = formatDeltaPct(amb?.ambiguity_rate_delta_pct) ?? KPI_UNAVAILABLE

  const buckets = [
    {
      label: 'Unclear signal',
      value: formatApiCount(amb?.ambiguous_intent_count),
      sub: deltas.ambiguousIntents ?? 'Payments needing match review',
    },
    {
      label: 'Missing ref rate',
      value: amb?.provider_ref_missing_rate != null ? `${amb.provider_ref_missing_rate}%` : '—',
      sub: deltas.missingRefRate ?? 'Missing bank or PSP references',
    },
    {
      label: 'Value at risk',
      value: formatKpiMoneyMinor(amb?.value_at_risk_minor),
      sub: deltas.valueAtRisk ?? 'Exposure at risk from uncertain matches',
    },
    {
      label: 'Settlement certainty',
      value: displayApiField(amb?.avg_score_margin),
      sub: '',
    },
  ] as const

  return (
    <JournalIntelligenceKpiHero
      eyebrow={ambiguityCopy.kpi.reviewRate}
      value={ambiguityRateLabel}
      deltaPill={ambiguityRateDelta}
      subcopy={scopeHint ?? 'Tenant-wide snapshot'}
      buckets={buckets}
      testId="ambiguity-kpi-hero"
      footer={
        <>
          <Link
            href={`${basePath}?dock=leakage`}
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/15"
          >
            Open Payment Gaps
          </Link>
          <Link
            href={`${basePath}?dock=grid`}
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/15"
          >
            Open Intent Journal
          </Link>
        </>
      }
    />
  )
}
