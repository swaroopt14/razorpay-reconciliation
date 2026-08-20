#!/usr/bin/env node
/**
 * Pure-function checks for journal API-first metrics helpers.
 * Run: node scripts/verify-journal-api-metrics.mjs
 */

function batchStatusFromAggregateScore(score) {
  const pct = score <= 1 ? score * 100 : score
  if (pct < 50) return 'Critical'
  if (pct < 75) return 'At Risk'
  return 'Stable'
}

/** CON-P0-13 — match confidence must never map to Settled/Failed. */
function outcomeFromMatchConfidence(matchConfidence) {
  void matchConfidence
  return { label: 'Open', progressPct: 0 }
}

function outcomeFromFinalityAndCoverage({
  finalityStatus,
  totalIntendedMinor,
  unresolvedIntendedMinor,
}) {
  const finality = String(finalityStatus ?? '').toUpperCase()
  const unresolvedRatio =
    totalIntendedMinor > 0 && unresolvedIntendedMinor != null
      ? unresolvedIntendedMinor / totalIntendedMinor
      : null
  const hasMaterialUnresolved = unresolvedRatio != null && unresolvedRatio >= 0.01

  if (finality === 'FAILED') return { label: 'Failed', finalityStatus: finalityStatus ?? null }
  if (finality === 'FULLY_SETTLED' || finality === 'SETTLED') {
    return {
      label: hasMaterialUnresolved ? 'Partially Reconciled' : 'Fully Settled',
      finalityStatus: finalityStatus ?? null,
    }
  }
  if (finality === 'PARTIALLY_SETTLED') {
    return { label: 'Partially Reconciled', finalityStatus: finalityStatus ?? null }
  }
  if (hasMaterialUnresolved) {
    return { label: 'Partially Reconciled', finalityStatus: finalityStatus ?? null }
  }
  return { label: 'Open', finalityStatus: finalityStatus ?? null }
}

function settlementObservationPageRange({ page, pageSize, total }) {
  const safeTotal = total ?? 0
  if (safeTotal <= 0) return { start: 0, end: 0, total: 0, totalPages: 1 }
  const size = Math.max(1, pageSize)
  const totalPages = Math.max(1, Math.ceil(safeTotal / size))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * size + 1
  const end = Math.min(safePage * size, safeTotal)
  return { start, end, total: safeTotal, totalPages }
}

const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(batchStatusFromAggregateScore(0.81) === 'Stable', '81% aggregate → Stable')
assert(batchStatusFromAggregateScore(0.49) === 'Critical', '49% aggregate → Critical')
assert(batchStatusFromAggregateScore(0.6) === 'At Risk', '60% aggregate → At Risk')

assert(outcomeFromMatchConfidence(null).progressPct === 0, 'null match_confidence → 0% progress')
assert(outcomeFromMatchConfidence(0.8).label === 'Open', '80% match alone must NOT be Settled')
assert(outcomeFromMatchConfidence(0.4).label === 'Open', '40% match alone must NOT be Failed')

assert(
  outcomeFromFinalityAndCoverage({
    finalityStatus: 'OPEN',
    totalIntendedMinor: 1_000_000,
    unresolvedIntendedMinor: 100_000,
  }).label === 'Partially Reconciled',
  '10% unresolved value → Partially Reconciled',
)

assert(
  outcomeFromFinalityAndCoverage({
    finalityStatus: 'FULLY_SETTLED',
    totalIntendedMinor: 1_000_000,
    unresolvedIntendedMinor: 0,
  }).label === 'Fully Settled',
  'FULLY_SETTLED with full coverage → Fully Settled',
)

assert(
  outcomeFromFinalityAndCoverage({
    finalityStatus: 'FULLY_SETTLED',
    totalIntendedMinor: 1_000_000,
    unresolvedIntendedMinor: 0,
  }).finalityStatus === 'FULLY_SETTLED',
  'FULLY_SETTLED finality appears on outcome',
)

const page11 = settlementObservationPageRange({ page: 1, pageSize: 20, total: 11 })
assert(page11.start === 1 && page11.end === 11 && page11.total === 11, '11 total on page 1 → 1-11 of 11')

const page33 = settlementObservationPageRange({ page: 2, pageSize: 20, total: 33 })
assert(page33.start === 21 && page33.end === 33, '33 total page 2 → 21-33')

if (failures.length > 0) {
  console.error('verify-journal-api-metrics FAILED:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log('verify-journal-api-metrics OK')
