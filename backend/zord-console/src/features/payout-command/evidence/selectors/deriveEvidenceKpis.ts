import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'
import { EXPECTED_PROOF_ITEMS } from '../types/evidenceViewModels'
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
  let missingItems = 0

  for (const row of packRows) {
    const st = mapProofStatusFromPack(row.summary, row.itemCount)
    if (isExportReadyStatus(st.key)) readyCount += 1
    else if (st.key === 'needsReview') reviewCount += 1
    else incompleteCount += 1
    const missing = row.summary.missing_artifact_count
    if (typeof missing === 'number') missingItems += missing
    else if (row.itemCount !== undefined) {
      missingItems += Math.max(0, EXPECTED_PROOF_ITEMS - row.itemCount)
    }
  }

  const defScoreRaw = defensibility ? defensibility.defensibility_score : null
  const defScore = defScoreRaw != null ? defScoreRaw.toFixed(1) : '—'
  const evidencePct = defensibility ? formatPercentLabel(defensibility.evidence_pack_rate) : '—'
  const govPct = defensibility ? formatPercentLabel(defensibility.governance_coverage_pct) : '—'
  const replayPct = defensibility ? formatPercentLabel(defensibility.replayability_pct) : '—'
  const disputePct = defensibility ? formatPercentLabel(defensibility.dispute_ready_pct) : '—'

  let readinessSub = defensibility
    ? `Evidence packs: ${evidencePct} · Replay-ready: ${replayPct} · Dispute-ready: ${disputePct}`
    : '—'

  if (defensibility && defensibility.weak_evidence_count != null && defensibility.weak_evidence_count > 0) {
    readinessSub += ` · ${defensibility.weak_evidence_count} weak evidence items`
  }

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

  const missingValue = packCount > 0 ? missingItems.toLocaleString('en-IN') : '—'
  const missingSub =
    packCount > 0 ? 'Critical proof artifacts still missing across loaded packs' : '—'

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
      id: 'governance',
      label: evidenceCopy.kpi.governanceChecks,
      value: govPct,
      sub: defensibility
        ? `Settlement coverage ${formatPercentLabel(defensibility.settlement_evidence_coverage)} · Attachment ${formatPercentLabel(defensibility.attachment_evidence_coverage)}`
        : '—',
    },
    {
      id: 'missing',
      label: evidenceCopy.kpi.missingProofItems,
      value: missingValue,
      sub: missingSub,
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
      sub:
        defensibility && packCount > 0
          ? `${readyCount} export-ready · ${disputePct} dispute-ready per defensibility KPI`
          : disputeSub,
    },
  ]
}
