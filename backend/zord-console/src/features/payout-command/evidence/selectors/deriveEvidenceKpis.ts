import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'
import type {
  DefensibilityKpiResolved,
  BatchHealth,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { isExportReadyStatus, mapProofStatusFromPack } from '../mappers/mapProofStatus'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { formatPercentLabel, normalizePercentRatio } from '../utils/evidencePercent'

type PackRowInput = { summary: EvidencePackSummaryRow; itemCount?: number }

const EVIDENCE_INDEX_MAX_POINTS = 65

function buildEvidenceIndexTooltip(score: number, defensibility: DefensibilityKpiResolved): string {
  const evidencePct = formatPercentLabel(defensibility.evidence_pack_rate)
  const govPct = formatPercentLabel(defensibility.governance_coverage_pct)
  const replayPct = formatPercentLabel(defensibility.replayability_pct)
  return `${score.toFixed(1)} of ${EVIDENCE_INDEX_MAX_POINTS} points on the Evidence Completeness Index — composite score from evidence pack coverage (${evidencePct}), governance checks (${govPct}), replay readiness (${replayPct}), and artifact completeness (amount processing excluded).`
}

export function deriveEvidenceKpis(input: {
  defensibility: DefensibilityKpiResolved | null
  packRows: PackRowInput[]
  batchHealth?: BatchHealth | null
  batchId?: string
}): EvidenceKpiCard[] {
  const { defensibility, packRows } = input
  const packCount = packRows.length

  let readyCount = 0
  let incompleteCount = 0
  let reviewCount = 0

  for (const row of packRows) {
    const st = mapProofStatusFromPack(row.summary, row.itemCount)
    if (isExportReadyStatus(st.key)) readyCount += 1
    else if (st.key === 'needsReview') reviewCount += 1
    else incompleteCount += 1
  }

  const defScoreRaw = defensibility ? defensibility.defensibility_score : null
  const defScore = defScoreRaw != null ? defScoreRaw.toFixed(1) : '—'
  const evidencePct = defensibility ? formatPercentLabel(defensibility.evidence_pack_rate) : '—'
  const govPct = defensibility ? formatPercentLabel(defensibility.governance_coverage_pct) : '—'
  const packCompletenessPct = defensibility
    ? formatPercentLabel(defensibility.avg_pack_completeness_score, { digits: 2 })
    : '—'
  const replayPct = defensibility ? formatPercentLabel(defensibility.replayability_pct) : '—'
  const disputePct = defensibility ? formatPercentLabel(defensibility.dispute_ready_pct, { digits: 2 }) : '—'

  const readinessSub = ''

  let readinessExplanation: string | undefined
  if (
    defensibility &&
    (normalizePercentRatio(defensibility.evidence_pack_rate) ?? 0) >= 0.99 &&
    defensibility.defensibility_score < 50
  ) {
    readinessExplanation = evidenceCopy.scoreLowExplanation
  }

  const readinessTooltip =
    defScoreRaw != null && defensibility
      ? buildEvidenceIndexTooltip(defScoreRaw, defensibility)
      : undefined

  const packsSub =
    packCount > 0
      ? `${packCount} packs loaded for this batch`
      : 'Select a batch with evidence packs'

  const disputeSub =
    packCount > 0
      ? `${readyCount} ready to export · ${incompleteCount} incomplete · ${reviewCount} need review`
      : '—'

  return [
    {
      id: 'readiness',
      label: evidenceCopy.kpi.proofReadinessScore,
      value: defScore,
      sub: readinessSub,
      accent: true,
      explanation: readinessExplanation,
      tooltip: readinessTooltip,
    },
    {
      id: 'packs',
      label: evidenceCopy.kpi.evidencePacksGenerated,
      value: packCount > 0 ? String(packCount) : '—',
      sub: packsSub,
    },
    {
      id: 'packCompleteness',
      label: evidenceCopy.kpi.packCompletenessScore,
      value: packCompletenessPct,
      sub: defensibility
        ? `Average completeness score across all evidence packs in this batch`
        : '—',
    },
    {
      id: 'dispute',
      label:
        readyCount > 0 || incompleteCount > 0
          ? evidenceCopy.kpi.disputePacksReady
          : evidenceCopy.kpi.exportReadiness,
      value:
        readyCount > 0 || defensibility
          ? defensibility
            ? disputePct
            : String(readyCount)
          : packCount > 0
            ? '0'
            : '—',
      sub: '',
    },
  ]
}
