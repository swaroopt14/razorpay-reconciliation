import type { PortfolioLeakageViewModel } from '../../leakage-portfolio/normalizeLeakagePayload'
import { formatMinorInr } from '../../leakage-portfolio/utils/formatMinorInr'
import { mapReviewPriorityLabel } from '../copy/leakageCopy'

export type WhatZordFoundResult = {
  paragraph: string
  criticalNote?: string
}

export function deriveWhatZordFound(data: PortfolioLeakageViewModel): WhatZordFoundResult {
  const parts: string[] = []
  const tierLabel = mapReviewPriorityLabel(data.riskTier)

  if (data.unmatchedMinor > 0) {
    parts.push(`Zord found ${formatMinorInr(data.unmatchedMinor)} in unmatched payment value for this period.`)
  } else {
    parts.push('No unmatched payment value was detected for this period.')
  }

  if (data.underSettlementMinor > 0) {
    parts.push(`${formatMinorInr(data.underSettlementMinor)} in short-settlement value was detected.`)
  } else {
    parts.push('No short-settlement value was detected.')
  }

  if (data.orphanMinor > 0) {
    parts.push(`${formatMinorInr(data.orphanMinor)} in unlinked settlement value was detected.`)
  } else {
    parts.push('No orphan settlement value was detected.')
  }

  if (data.reversalMinor > 0) {
    parts.push(`${formatMinorInr(data.reversalMinor)} in reversal exposure was recorded.`)
  }

  parts.push(`Review priority for this period: ${tierLabel}.`)

  let criticalNote: string | undefined
  if ((data.riskTier || '').toUpperCase() === 'CRITICAL') {
    criticalNote =
      'This period is marked Critical because value needing review crossed the configured threshold.'
  }

  return {
    paragraph: parts.join(' '),
    criticalNote,
  }
}
