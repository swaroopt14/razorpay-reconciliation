import type { ProofStatusKey } from '../copy/evidenceCopy'

export type ProofCoverageStatus = 'available' | 'missing' | 'generated' | 'not_generated' | 'unknown'

export type ProofCoverageTile = {
  id: string
  label: string
  status: ProofCoverageStatus
  isBatchEstimate?: boolean
}

export type EvidenceKpiCard = {
  id: string
  label: string
  value: string
  sub: string
  accent?: boolean
  explanation?: string
  /** Hover-only context (e.g. Evidence Completeness Index X of 65 points). */
  tooltip?: string
}

export type ProofBreakdownRow = {
  id: string
  label: string
  completed: number
  total: number
  note?: string
}

export type PackScope = 'batch' | 'intent' | 'other'

export type PackTableRowVm = {
  packId: string
  batchId: string
  paymentRef: string
  intentId: string
  proofRoot: string
  proofScore: number | null
  proofScoreIsEstimate: boolean
  itemCount: number | null
  totalItems: number
  proofStatus: string
  proofStatusKey: ProofStatusKey | 'partialProof'
  generatedAt: string
  modeLabel: string
  summaryLine: string
  scope: PackScope
  contractId: string
  governanceDecision: string
  attachmentDecision: string
  matchConfidence: number | null
  bankReference: string
  amountMatch: boolean | null
  valueDateCheck: boolean | null
  settlementPresent: boolean | null
  packCompleteness: number | null
}

export type TimelineEventVm = {
  time: string
  label: string
  detail?: string
}

export type MissingProofItem = {
  id: string
  label: string
  done: boolean
}

export type EvidencePageTab = 'workspace'

export const EXPECTED_PROOF_ITEMS = 9
