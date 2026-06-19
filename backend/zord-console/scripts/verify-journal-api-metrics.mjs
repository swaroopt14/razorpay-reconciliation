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

function outcomeFromMatchConfidence(matchConfidence) {
  if (matchConfidence == null || !Number.isFinite(matchConfidence)) {
    return { label: 'Partial', progressPct: 0 }
  }
  const score = matchConfidence <= 1 ? matchConfidence : matchConfidence / 100
  const progressPct = Math.round(Math.min(100, Math.max(0, score * 100)))
  let label = 'Partial'
  if (score >= 0.75) label = 'Settled'
  else if (score < 0.5) label = 'Failed'
  return { label, progressPct }
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
assert(outcomeFromMatchConfidence(0.8).label === 'Settled', '80% match → Settled')
assert(outcomeFromMatchConfidence(0.64).label === 'Partial', '64% match → Partial')
assert(outcomeFromMatchConfidence(0.4).label === 'Failed', '40% match → Failed')

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
