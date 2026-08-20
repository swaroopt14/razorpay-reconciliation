/**
 * CON-P0-24 / CON-P1-22 — bank-confirmed must not stand in leakage observed settled;
 * money cards expose source/as-of.
 * Run: npx tsx --tsconfig tsconfig.json src/features/payout-command/batch-command-center/mappers/mapBatchReviewKpis.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BatchSummary } from '@/services/payout-command/batch-model'
import type { BatchDetailResponse, LeakageKpiResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import { BATCH_REVIEW_LIVE_KPI_SOURCES, mapBatchReviewKpis } from './mapBatchReviewKpis'

const emptySummary = {
  totalRows: 10,
  processed: 8,
  success: 7,
  failed: 1,
  pending: 1,
} as BatchSummary

{
  const leakage = {
    data_available: true,
    total_observed_settled_amount_minor: 9_999_999,
    unmatched_amount_minor: 100,
  } as unknown as LeakageKpiResponse

  const cards = mapBatchReviewKpis({
    summary: emptySummary,
    intelBatchDetail: null,
    leakageKpi: leakage,
    ambiguityKpi: null,
    defensibilityKpi: null,
    patternsKpi: null,
    engineIntentCount: 0,
    engineFailureCount: 0,
  })
  const bank = cards.find((c) => c.id === 'bank-confirmed')
  assert.ok(bank)
  assert.equal(bank!.value, 'Unavailable')
  assert.equal(bank!.empty, true)
}

{
  const detail = {
    batch_health: {
      total_confirmed_amount_minor: 52_653.42,
      total_intended_amount_minor: 53_041.74,
      updated_at: '2026-08-11T09:00:00Z',
    },
  } as unknown as BatchDetailResponse
  const cards = mapBatchReviewKpis({
    summary: emptySummary,
    intelBatchDetail: detail,
    leakageKpi: null,
    ambiguityKpi: null,
    defensibilityKpi: null,
    patternsKpi: null,
    engineIntentCount: 0,
    engineFailureCount: 0,
  })
  const bank = cards.find((c) => c.id === 'bank-confirmed')
  assert.ok(bank)
  assert.equal(bank!.empty, false)
  assert.notEqual(bank!.value, 'Unavailable')
  assert.equal(bank!.source, BATCH_REVIEW_LIVE_KPI_SOURCES.bankConfirmed)
  assert.equal(bank!.asOf, '2026-08-11T09:00:00Z')
  assert.doesNotMatch(bank!.subtitle, /Source:/)
  assert.doesNotMatch(bank!.subtitle, /batch_health/)
}

{
  const src = readFileSync(join(__dirname, 'mapBatchReviewKpis.ts'), 'utf8')
  assert.doesNotMatch(
    src,
    /confirmedMinor[\s\S]{0,200}total_observed_settled_amount_minor/,
    'must not fall back bank-confirmed to leakage observed settled',
  )
}

console.log('mapBatchReviewKpis.contract.test.ts: OK')
