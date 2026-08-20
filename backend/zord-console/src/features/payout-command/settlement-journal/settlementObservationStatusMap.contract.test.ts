/**
 * CON-P1-24 contract tests
 * Run: npx tsx --tsconfig tsconfig.json src/features/payout-command/settlement-journal/settlementObservationStatusMap.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isFailedObservationStatus,
  isSettledObservationStatus,
  mapSettlementObservationStatus,
  SETTLEMENT_OBSERVATION_STATUS_MAP_VERSION,
} from './settlementObservationStatusMap'
import { outcomeFromObservationRows, settlementStatusBadgeClass } from './settlementJournalSidebarUtils'
import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'

const __dirname = dirname(fileURLToPath(import.meta.url))

assert.equal(SETTLEMENT_OBSERVATION_STATUS_MAP_VERSION, 1)

// Acceptance: fake status NOT_SETTLED_YET must not classify as Settled
{
  const mapped = mapSettlementObservationStatus('NOT_SETTLED_YET')
  assert.equal(mapped.bucket, 'unknown')
  assert.equal(mapped.known, false)
  assert.equal(mapped.label, 'Needs mapping')
  assert.equal(isSettledObservationStatus('NOT_SETTLED_YET'), false)
  assert.equal(isFailedObservationStatus('NOT_SETTLED_YET'), false)
}

// Substring traps that used to misclassify
{
  assert.equal(isSettledObservationStatus('PARTIALLY_SETTLED'), false, 'partial must not be settled')
  assert.equal(mapSettlementObservationStatus('PARTIALLY_SETTLED').bucket, 'pending')
  assert.equal(isSettledObservationStatus('UNSUCCESSFUL'), false)
  assert.equal(mapSettlementObservationStatus('UNSUCCESSFUL').bucket, 'unknown')
}

// Known settled / failed
{
  assert.equal(isSettledObservationStatus('SETTLED'), true)
  assert.equal(isSettledObservationStatus('SUCCESS'), true)
  assert.equal(isFailedObservationStatus('FAILED'), true)
  assert.equal(isFailedObservationStatus('REJECTED'), true)
}

// Outcome rollup: unknown does not upgrade batch to Settled
{
  const rows = [
    { statusRaw: 'NOT_SETTLED_YET', amount: 10, settledAmount: 0, feeAmount: 0 },
    { statusRaw: 'NOT_SETTLED_YET', amount: 10, settledAmount: 0, feeAmount: 0 },
  ] as SettlementObservationTableRow[]
  const outcome = outcomeFromObservationRows(rows)
  assert.equal(outcome.settled, 0)
  assert.equal(outcome.failed, 0)
  assert.notEqual(outcome.label, 'Settled')
}

// Badge for unknown uses muted styling (not settled black pill)
{
  const unknownClass = settlementStatusBadgeClass('NOT_SETTLED_YET')
  const settledClass = settlementStatusBadgeClass('SETTLED')
  assert.notEqual(unknownClass, settledClass)
  assert.match(unknownClass, /slate/)
  assert.doesNotMatch(unknownClass, /bg-black/)
}

// All-unknown batch outcome label is Unknown, not Settled
{
  const rows = [
    { statusRaw: 'NOT_SETTLED_YET', amount: 1, settledAmount: 0, feeAmount: 0 },
  ] as SettlementObservationTableRow[]
  assert.equal(outcomeFromObservationRows(rows).label, 'Unknown')
}

// Source guard: no substring includes() classification in helpers / map
{
  const mapSrc = readFileSync(join(__dirname, 'settlementObservationStatusMap.ts'), 'utf8')
  const utilsSrc = readFileSync(join(__dirname, 'settlementJournalSidebarUtils.ts'), 'utf8')
  assert.doesNotMatch(mapSrc, /\.includes\(\s*['\"]SETTLED['\"]\s*\)/)
  assert.doesNotMatch(mapSrc, /\.includes\(\s*['\"]SUCCESS['\"]\s*\)/)
  assert.doesNotMatch(mapSrc, /\.includes\(\s*['\"]FAIL['\"]\s*\)/)
  assert.doesNotMatch(utilsSrc, /\.includes\(\s*['\"]SETTLED['\"]\s*\)/)
  assert.doesNotMatch(utilsSrc, /\.includes\(\s*['\"]SUCCESS['\"]\s*\)/)
  assert.doesNotMatch(utilsSrc, /\.includes\(\s*['\"]FAIL['\"]\s*\)/)
}

console.log('settlementObservationStatusMap.contract.test.ts: OK')
