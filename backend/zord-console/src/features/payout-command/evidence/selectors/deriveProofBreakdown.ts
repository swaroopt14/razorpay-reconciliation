import { evidenceCopy } from '../copy/evidenceCopy'
import type { ProofBreakdownRow } from '../types/evidenceViewModels'
import type { DefensibilityKpiResolved, PatternsKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { normalizePercentRatio } from '../utils/evidencePercent'

function clampCompleted(completed: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(total, completed))
}

export function deriveProofBreakdown(input: {
  defensibility: DefensibilityKpiResolved | null
  patterns: PatternsKpiResolved | null
  packCount: number
}): ProofBreakdownRow[] {
  const { defensibility, patterns, packCount } = input

  const patternScope = typeof patterns?.total_count === 'number' ? Math.max(0, patterns.total_count) : null
  const inScope = patternScope != null ? Math.max(patternScope, packCount) : Math.max(0, packCount)
  const useModelled = patternScope == null && defensibility != null && inScope > 0

  if (!defensibility && packCount === 0) {
    return [
      {
        id: 'scope',
        label: evidenceCopy.breakdown.inScope,
        completed: 0,
        total: 0,
        note: 'Select a batch with intelligence or evidence data',
      },
    ]
  }

  if (defensibility) {
    const evidenceRate = normalizePercentRatio(defensibility.evidence_pack_rate) ?? 0
    const governanceRate = normalizePercentRatio(defensibility.governance_coverage_pct) ?? 0
    const replayRate = normalizePercentRatio(defensibility.replayability_pct) ?? 0
    const auditRate = normalizePercentRatio(defensibility.audit_ready_pct) ?? 0
    const disputeRate = normalizePercentRatio(defensibility.dispute_ready_pct) ?? 0

    const evidenced = clampCompleted(Math.round(inScope * evidenceRate), inScope)
    const governanceDone = clampCompleted(Math.round(inScope * governanceRate), inScope)
    const replayDone = clampCompleted(Math.round(inScope * replayRate), inScope)
    const missingItems = Math.max(0, inScope - replayDone)

    const replayNote =
      replayRate === 0
        ? evidenceCopy.breakdown.replayNotEnabled
        : undefined

    return [
      {
        id: 'scope',
        label: evidenceCopy.breakdown.inScope,
        completed: inScope,
        total: inScope,
        note: useModelled ? 'Estimated from defensibility KPIs' : undefined,
      },
      {
        id: 'packs',
        label: evidenceCopy.breakdown.packsGenerated,
        completed: clampCompleted(packCount > 0 ? Math.max(evidenced, packCount) : evidenced, inScope),
        total: inScope,
      },
      {
        id: 'audit',
        label: 'Audit-ready',
        completed: clampCompleted(Math.round(inScope * auditRate), inScope),
        total: inScope,
      },
      {
        id: 'dispute',
        label: 'Dispute-ready',
        completed: clampCompleted(Math.round(inScope * disputeRate), inScope),
        total: inScope,
      },
      {
        id: 'governance',
        label: evidenceCopy.breakdown.governanceCompleted,
        completed: governanceDone,
        total: inScope,
      },
      {
        id: 'replay',
        label: evidenceCopy.breakdown.replayPassed,
        completed: replayDone,
        total: inScope,
        note: replayNote,
      },
      {
        id: 'missing',
        label: evidenceCopy.breakdown.missingItems,
        completed: missingItems,
        total: inScope,
      },
    ]
  }

  return [
    {
      id: 'scope',
      label: evidenceCopy.breakdown.inScope,
      completed: inScope,
      total: inScope,
    },
    {
      id: 'packs',
      label: evidenceCopy.breakdown.packsGenerated,
      completed: packCount,
      total: inScope,
    },
    {
      id: 'governance',
      label: evidenceCopy.breakdown.governanceCompleted,
      completed: 0,
      total: inScope,
    },
    {
      id: 'replay',
      label: evidenceCopy.breakdown.replayPassed,
      completed: 0,
      total: inScope,
      note: evidenceCopy.breakdown.replayNotEnabled,
    },
    {
      id: 'missing',
      label: evidenceCopy.breakdown.missingItems,
      completed: Math.max(0, inScope - packCount),
      total: inScope,
    },
  ]
}
