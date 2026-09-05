import type { JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

export type Spec76Lifecycle =
  | 'Draft'
  | 'Needs review'
  | 'Ready to seal'
  | 'Sealed'
  | 'Dispatched'
  | 'Blocked'

export type Spec76PolicyStatus = 'Allow' | 'Warn' | 'Block' | 'Require approval' | 'Pending'
export type Spec76SourceIntegrity = 'Verified' | 'Changed' | 'Missing authority' | 'Pending'
export type Spec76RiskState = 'Clear' | 'Pre-dispatch risk' | 'Beneficiary change' | 'Amount change'
export type Spec76ActionContract = 'None' | 'Ready' | 'Sealed' | 'Blocked'
export type Spec76ChangeSignal =
  | 'No material change'
  | 'Beneficiary changed'
  | 'Amount changed'
  | 'Source version changed'

export type Spec76Fields = {
  lifecycleStage: Spec76Lifecycle
  policyStatus: Spec76PolicyStatus
  sourceIntegrity: Spec76SourceIntegrity
  riskState: Spec76RiskState
  actionContract: Spec76ActionContract
  changeSignal: Spec76ChangeSignal
  sealEligible: boolean
  readinessReason: string
}

/**
  * Spec 7.6 enrichment for journal rows.
  * Deterministic demo: one blocked beneficiary-change case (index 6 or name match).
  */
export function enrichIntentSpec76(row: JournalIntentRow, index: number): Spec76Fields {
  const name = (row.beneficiaryName || '').toLowerCase()
  const isBeneficiaryBlock =
    index === 6 ||
    name.includes('blocked') ||
    (name.includes('rahul') && index % 11 === 6)

  const lowScore =
    row.confidenceScore != null &&
    (row.confidenceScore <= 1 ? row.confidenceScore < 0.7 : row.confidenceScore < 70)

  const missingSource = index === 11 || row.infoSummary?.includes('semantic-invalid')

  if (isBeneficiaryBlock) {
    return {
      lifecycleStage: 'Blocked',
      policyStatus: 'Block',
      sourceIntegrity: 'Changed',
      riskState: 'Beneficiary change',
      actionContract: 'Blocked',
      changeSignal: 'Beneficiary changed',
      sealEligible: false,
      readinessReason:
        'Not ready - beneficiary changed after approval. Policy blocks seal until review.',
    }
  }

  if (missingSource) {
    return {
      lifecycleStage: 'Needs review',
      policyStatus: 'Require approval',
      sourceIntegrity: 'Missing authority',
      riskState: 'Pre-dispatch risk',
      actionContract: 'None',
      changeSignal: 'Source version changed',
      sealEligible: false,
      readinessReason: 'Not ready - missing source authority. Cannot seal.',
    }
  }

  if (lowScore || row.status === 'Needs Review') {
    return {
      lifecycleStage: 'Needs review',
      policyStatus: 'Warn',
      sourceIntegrity: 'Pending',
      riskState: 'Pre-dispatch risk',
      actionContract: 'None',
      changeSignal: index % 5 === 0 ? 'Amount changed' : 'No material change',
      sealEligible: false,
      readinessReason: 'Not ready - needs review before seal.',
    }
  }

  if (row.status === 'Confirmed' || row.status === 'Pending') {
    return {
      lifecycleStage: 'Dispatched',
      policyStatus: 'Allow',
      sourceIntegrity: 'Verified',
      riskState: 'Clear',
      actionContract: 'Sealed',
      changeSignal: 'No material change',
      sealEligible: false,
      readinessReason: 'Already dispatched - seal complete for this instruction.',
    }
  }

  if (row.status === 'In Progress') {
    return {
      lifecycleStage: 'Sealed',
      policyStatus: 'Allow',
      sourceIntegrity: 'Verified',
      riskState: 'Clear',
      actionContract: 'Sealed',
      changeSignal: 'No material change',
      sealEligible: false,
      readinessReason: 'Sealed - waiting on dispatch rails.',
    }
  }

  // Ready to Process → Ready to seal
  return {
    lifecycleStage: 'Ready to seal',
    policyStatus: 'Allow',
    sourceIntegrity: 'Verified',
    riskState: 'Clear',
    actionContract: 'Ready',
    changeSignal: 'No material change',
    sealEligible: true,
    readinessReason: 'Ready - policy allow, source verified, no pre-dispatch block.',
  }
}

export function withSpec76Fields(row: JournalIntentRow, index: number): JournalIntentRow {
  const e = enrichIntentSpec76(row, index)
  return {
    ...row,
    lifecycleStage: e.lifecycleStage,
    policyStatus: e.policyStatus,
    sourceIntegrity: e.sourceIntegrity,
    riskState: e.riskState,
    actionContract: e.actionContract,
    changeSignal: e.changeSignal,
    sealEligible: e.sealEligible,
    readinessReason: e.readinessReason,
    infoSummary: e.readinessReason,
  }
}

export function sumBlockedValue(rows: JournalIntentRow[]): number {
  return rows
    .filter((r) => r.lifecycleStage === 'Blocked' || r.policyStatus === 'Block')
    .reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0)
}

export function countSealEligible(rows: JournalIntentRow[]): number {
  return rows.filter((r) => r.sealEligible).length
}
