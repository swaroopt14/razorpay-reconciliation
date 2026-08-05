import type { GlyphName } from '@/services/payout-command/model'

/**
 * Shared types for the Merkle evidence graph UI and API→graph builders.
 * Kept in a leaf module so `evidencePackGraphFromApi` never imports `MerkleGraphSurface` (avoids circular bundles).
 */

export type LeafStatus = 'valid' | 'missing' | 'invalid'

export type EvidenceItemType =
  | 'RAW_INGRESS_ENVELOPE'
  | 'CANONICAL_INTENT'
  | 'GOVERNANCE_DECISION_AT_CANONICAL'
  | 'RAW_SETTLEMENT_ENVELOPE'
  | 'CANONICAL_SETTLEMENT_OBSERVATION'
  | 'ATTACHMENT_DECISION'
  | 'VARIANCE_DECISION'
  | 'DISPATCH_ATTEMPT'
  | 'PROVIDER_ACK'
  | 'OUTCOME_SIGNAL'
  | 'FUSED_OUTCOME'
  | 'FINALITY_CERT'
  | 'FINAL_CONTRACT'
  | 'FINAL_EVIDENCE_VIEW'
  | 'PREPARED_PAYOUT_CONTRACT'
  | 'ZORD_SIGNATURE_CARRIER'

export type EvidencePackMode =
  | 'INTELLIGENCE_ATTACH'
  | 'SECONDARY_DISPATCH'
  | 'FULL_CONTROL'
  | 'BATCH_ATTACH'

export type LeafNode = {
  id: string
  name: string
  artifact: string
  itemType: EvidenceItemType
  stableRef: string
  version: string
  sourceService: string
  hashFull: string
  hashShort: string
  leafHash: string
  source: string
  receivedAt: string
  status: LeafStatus
  impact: string
  iconName: GlyphName
}

export type IntermediateNode = {
  id: string
  hashFull: string
  hashShort: string
  derivedFrom: string[]
}

export type RootNode = {
  id: 'root'
  hashFull: string
  hashShort: string
  status: 'verified' | 'partial' | 'invalid'
  tamper: 'no-changes' | 'changes-detected'
}

export type EvidencePackGraph = {
  packId: string
  intentId: string
  contractId: string
  batchId: string
  tenantId: string
  mode: EvidencePackMode
  rulesetVersion: string
  schemaVersions: { intent: string; outcome: string; contract: string; attachment?: string }
  createdAt: string
  defensibilityScore: number
  proofScore: number
  leaves: LeafNode[]
  intermediates: IntermediateNode[]
  root: RootNode
}

export type BatchMeta = {
  batchId: string
  totalIntents: number
  totalTransactions: number
  receivedAt: string
}
