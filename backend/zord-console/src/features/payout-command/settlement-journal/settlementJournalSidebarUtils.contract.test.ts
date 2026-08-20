/**
 * CON-P0-13 — settlement outcome must not be driven by match confidence.
 * Run: npx tsx --tsconfig tsconfig.json src/features/payout-command/settlement-journal/settlementJournalSidebarUtils.contract.test.ts
 */
import assert from 'node:assert/strict'
import {
  formatAttachmentConfidencePct,
  outcomeFromFinalityAndCoverage,
  outcomeFromMatchConfidence,
} from './settlementJournalSidebarUtils'

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`fail - ${name}`)
    throw err
  }
}

check('99% attachment confidence alone never labels Settled/Failed', () => {
  const deprecated = outcomeFromMatchConfidence(0.99)
  assert.equal(deprecated.label, 'Open')
  assert.notEqual(deprecated.label, 'Fully Settled')
  assert.notEqual(deprecated.label as string, 'Settled')
  assert.notEqual(deprecated.label as string, 'Failed')
})

check('99% confidence + 10% unresolved value → Partially Reconciled (not Fully Settled)', () => {
  const outcome = outcomeFromFinalityAndCoverage({
    finalityStatus: 'OPEN',
    totalIntendedMinor: 1_000_000,
    unresolvedIntendedMinor: 100_000, // 10%
    totalConfirmedMinor: 900_000,
    totalCount: 100,
    successCount: 90,
    unresolvedCount: 10,
    pendingCount: 10,
  })
  assert.ok(
    outcome.label === 'Open' || outcome.label === 'Partially Reconciled',
    `expected Open/Partially Reconciled, got ${outcome.label}`,
  )
  assert.notEqual(outcome.label, 'Fully Settled')
  assert.equal(formatAttachmentConfidencePct(0.99), '99%')
})

check('FULLY_SETTLED with complete coverage → Fully Settled and preserves finality', () => {
  const outcome = outcomeFromFinalityAndCoverage({
    finalityStatus: 'FULLY_SETTLED',
    totalIntendedMinor: 1_000_000,
    unresolvedIntendedMinor: 0,
    totalConfirmedMinor: 1_000_000,
    totalCount: 50,
    successCount: 50,
    unresolvedCount: 0,
    pendingCount: 0,
    failedCount: 0,
  })
  assert.equal(outcome.label, 'Fully Settled')
  assert.equal(outcome.finalityStatus, 'FULLY_SETTLED')
  assert.equal(outcome.progressPct, 100)
})

check('FULLY_SETTLED with 10% unresolved value downgrades to Partially Reconciled', () => {
  const outcome = outcomeFromFinalityAndCoverage({
    finalityStatus: 'FULLY_SETTLED',
    totalIntendedMinor: 1_000_000,
    unresolvedIntendedMinor: 100_000,
    totalConfirmedMinor: 900_000,
  })
  assert.equal(outcome.label, 'Partially Reconciled')
})

check('FAILED finality → Failed regardless of high confidence display helper', () => {
  const outcome = outcomeFromFinalityAndCoverage({
    finalityStatus: 'FAILED',
    totalIntendedMinor: 500_000,
    unresolvedIntendedMinor: 500_000,
  })
  assert.equal(outcome.label, 'Failed')
  assert.equal(formatAttachmentConfidencePct(0.99), '99%')
})

check('PARTIALLY_SETTLED → Partially Reconciled', () => {
  assert.equal(
    outcomeFromFinalityAndCoverage({ finalityStatus: 'PARTIALLY_SETTLED' }).label,
    'Partially Reconciled',
  )
})

check('REQUIRES_REVIEW at 98% coverage → Partially Reconciled (not Requires Review)', () => {
  const outcome = outcomeFromFinalityAndCoverage({
    finalityStatus: 'REQUIRES_REVIEW',
    totalIntendedMinor: 44_000,
    totalConfirmedMinor: 43_117.46,
    totalCount: 20,
    successCount: 19,
    unresolvedCount: 1,
  })
  assert.equal(outcome.label, 'Partially Reconciled')
  assert.ok(outcome.progressPct >= 90, `expected high coverage, got ${outcome.progressPct}`)
  assert.match(outcome.toneText, /emerald/)
  assert.doesNotMatch(outcome.toneText, /rose/)
  // Raw Service 5 finality is retained for ops, not shown as the customer label.
  assert.equal(outcome.finalityStatus, 'REQUIRES_REVIEW')
})

check('REQUIRES_REVIEW at low coverage stays Requires Review', () => {
  const outcome = outcomeFromFinalityAndCoverage({
    finalityStatus: 'REQUIRES_REVIEW',
    totalIntendedMinor: 100_000,
    totalConfirmedMinor: 40_000,
    totalCount: 10,
    successCount: 4,
    unresolvedCount: 6,
  })
  assert.equal(outcome.label, 'Requires Review')
  assert.ok(outcome.progressPct < 75)
  assert.match(outcome.toneText, /rose/)
})

console.log('All CON-P0-13 settlement outcome contract tests passed.')
