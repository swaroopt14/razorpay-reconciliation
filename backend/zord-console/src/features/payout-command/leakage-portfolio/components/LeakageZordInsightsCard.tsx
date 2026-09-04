'use client'

import type {
  AmbiguityKpiResolved,
  LeakageKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { buildLeakagePageInsightItems } from '../../insights/buildPageZordInsightItems'
import { ZordInsightsPanel } from '../../shared/ZordInsightsPanel'

type LeakageZordInsightsCardProps = {
  leakage: LeakageKpiResolved | null
  ambiguity: AmbiguityKpiResolved | null
}

export function LeakageZordInsightsCard({ leakage, ambiguity }: LeakageZordInsightsCardProps) {
  const insights = buildLeakagePageInsightItems({ leakage, ambiguity })
    return (
    <ZordInsightsPanel
      insights={insights}
      className="h-full"
      sourcePage="payment-gaps"
      sectionTitle="Payment gap insights"
    />
  )
}
