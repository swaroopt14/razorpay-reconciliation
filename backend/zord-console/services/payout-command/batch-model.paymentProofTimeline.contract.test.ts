/**
 * CON-P0-14 — Matching completed must not be inferred from processed-row counts.
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/batch-model.paymentProofTimeline.contract.test.ts
 */
import assert from 'node:assert/strict'
import {
  derivePaymentProofTimeline,
  isMatchingCompletedFromService5,
  type BatchSummary,
  type ZordPipelineIntake,
} from './batch-model'

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`fail - ${name}`)
    throw err
  }
}

const intakeConfirmed: ZordPipelineIntake = {
  intakeStep: 'closed',
  intentFileName: 'payments.csv',
  intentIngestOk: true,
  settlementFileName: 'settlement.csv',
  settlementIngestOk: true,
  uploadedFileName: 'payments.csv',
  uploadState: 'ready',
}

const allProcessed: BatchSummary = {
  totalRows: 100,
  processed: 100,
  success: 100,
  failed: 0,
  pending: 0,
}

check('all rows processed alone does NOT complete matching', () => {
  const steps = derivePaymentProofTimeline(allProcessed, intakeConfirmed)
  const matching = steps[4]
  assert.notEqual(matching.state, 'done')
  assert.equal(matching.label, 'Matching / Review required')
  assert.equal(matching.state, 'warning')
})

check('processed + unresolved attachment stays Matching / Review required', () => {
  const steps = derivePaymentProofTimeline(allProcessed, intakeConfirmed, {
    finalityStatus: 'OPEN',
    unresolvedCount: 12,
    ambiguousCount: 3,
    settlementArtifactReceived: true,
    totalIntendedMinor: 1_000_000,
    unresolvedIntendedMinor: 100_000,
  })
  const matching = steps[4]
  assert.equal(matching.label, 'Matching / Review required')
  assert.equal(matching.state, 'warning')
  assert.equal(isMatchingCompletedFromService5({
    finalityStatus: 'OPEN',
    unresolvedCount: 12,
  }), false)
})

check('only Service 5 FULLY_SETTLED without unresolved completes matching', () => {
  const steps = derivePaymentProofTimeline(allProcessed, intakeConfirmed, {
    finalityStatus: 'FULLY_SETTLED',
    unresolvedCount: 0,
    ambiguousCount: 0,
    conflictedCount: 0,
    unresolvedIntendedMinor: 0,
    totalIntendedMinor: 1_000_000,
    settlementArtifactReceived: true,
    evidencePackRate: 0.95,
  })
  const matching = steps[4]
  assert.equal(matching.label, 'Matching completed')
  assert.equal(matching.state, 'done')
  assert.equal(steps[5].state, 'done')
})

check('FULLY_SETTLED with unresolved attachment does not complete matching', () => {
  assert.equal(
    isMatchingCompletedFromService5({
      finalityStatus: 'FULLY_SETTLED',
      unresolvedCount: 5,
    }),
    false,
  )
  const steps = derivePaymentProofTimeline(allProcessed, intakeConfirmed, {
    finalityStatus: 'FULLY_SETTLED',
    unresolvedCount: 5,
    settlementArtifactReceived: true,
  })
  assert.equal(steps[4].label, 'Matching / Review required')
  assert.equal(steps[4].state, 'warning')
})

check('settlement artifact without finality stays in progress or review, never done from counts', () => {
  const partial: BatchSummary = {
    totalRows: 100,
    processed: 40,
    success: 30,
    failed: 0,
    pending: 10,
  }
  const steps = derivePaymentProofTimeline(partial, intakeConfirmed, {
    finalityStatus: 'PROCESSING',
    settlementArtifactReceived: true,
    unresolvedCount: 0,
  })
  assert.notEqual(steps[4].state, 'done')
  assert.ok(steps[4].state === 'active' || steps[4].state === 'warning')
})

console.log('All CON-P0-14 payment-proof timeline contract tests passed.')
