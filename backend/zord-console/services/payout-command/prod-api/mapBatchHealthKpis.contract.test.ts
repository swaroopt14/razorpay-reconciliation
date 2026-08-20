/**
 * CON-P1-22 — batch_health adapters must not invent stand-in KPIs.
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/prod-api/mapBatchHealthKpis.contract.test.ts
 */
import assert from 'node:assert/strict'
import type { BatchHealth } from './intelligenceTypes'
import {
  batchHealthToAmbiguityKpis,
  batchHealthToLeakageViewModel,
} from './mapBatchHealthKpis'

const health = {
  total_count: 100,
  ambiguous_count: 10,
  unresolved_count: 25,
  ambiguity_score: 0.99,
  total_intended_amount_minor: 1000,
  total_confirmed_amount_minor: 900,
  total_variance_minor: 5000,
  finality_status: 'PARTIAL',
  updated_at: '2026-08-11T12:00:00Z',
} as unknown as BatchHealth

{
  const amb = batchHealthToAmbiguityKpis(health)
  assert.equal(amb.ambiguity_rate, 0.1)
  assert.equal(
    amb.provider_ref_missing_rate,
    null,
    'must not substitute unresolved_count/total as provider_ref_missing_rate',
  )
  assert.notEqual(amb.ambiguity_rate, health.ambiguity_score, 'must not use ambiguity_score as rate stand-in')
  assert.equal(amb.asOf, '2026-08-11T12:00:00Z')
}

{
  const onlyScore = {
    ambiguity_score: 0.75,
    total_intended_amount_minor: 0,
    total_confirmed_amount_minor: 0,
    total_variance_minor: 0,
    finality_status: 'UNKNOWN',
  } as unknown as BatchHealth
  const amb = batchHealthToAmbiguityKpis(onlyScore)
  assert.equal(amb.ambiguity_rate, null, 'missing counts ⇒ Unavailable rate, not score stand-in')
}

{
  const vm = batchHealthToLeakageViewModel(health, 'batch_1')
  assert.equal(vm.unmatchedMinor, null, 'variance must not stand in for unmatched')
  assert.equal(vm.exposureAmountMinor, null, 'variance must not stand in for exposure')
  assert.equal(vm.valueNeedingReviewMinor, null)
  assert.equal(vm.computedAt, '2026-08-11T12:00:00Z')
}

console.log('mapBatchHealthKpis.contract.test.ts: OK')
