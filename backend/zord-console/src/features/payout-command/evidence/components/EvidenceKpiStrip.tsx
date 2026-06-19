'use client'

import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'
import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'

type EvidenceKpiStripProps = {
  cards: EvidenceKpiCard[]
  loading?: boolean
  defensibilityTier?: string
}

export function EvidenceKpiStrip({ cards, loading, defensibilityTier }: EvidenceKpiStripProps) {
  if (loading) {
    return <div className="h-[286px] animate-pulse rounded-[20px] bg-slate-200/60" />
  }

  const readiness = cards.find((c) => c.id === 'readiness')
  const primaryValue = readiness?.value ?? '—'
  const primarySubcopy =
    [readiness?.sub, readiness?.explanation].filter(Boolean).join(' · ') ||
    evidenceCopy.proofReadinessHelper
  const tierPill = defensibilityTier ? `Tier ${defensibilityTier}` : evidenceCopy.proofTierLabel

  const buckets = cards.map((card) => ({
    label: card.label,
    value: card.value,
    sub: card.sub,
  }))

  return (
    <JournalIntelligenceKpiHero
      eyebrow={evidenceCopy.kpi.proofReadinessScore}
      value={primaryValue}
      tooltip={readiness?.tooltip}
      deltaPill={tierPill}
      subcopy={primarySubcopy}
      buckets={buckets}
      testId="evidence-kpi-hero"
    />
  )
}
