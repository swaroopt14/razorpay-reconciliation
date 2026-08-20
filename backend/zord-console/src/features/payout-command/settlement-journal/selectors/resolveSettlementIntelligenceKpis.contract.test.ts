/**
 * CON-P0-24 / CON-P1-22 contract tests
 * Run: npx tsx --tsconfig tsconfig.json src/features/payout-command/settlement-journal/selectors/resolveSettlementIntelligenceKpis.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BatchContractKpiResponse, BatchDetailResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import {
  LIVE_KPI_UNAVAILABLE,
  resolveAuthoritativeMatchedValue,
  resolveSettlementIntelligenceKpis,
  SETTLEMENT_LIVE_KPI_FIELDS,
} from './resolveSettlementIntelligenceKpis'

function fail(msg: string): never {
  throw new Error(msg)
}

// --- Authoritative field map ---
assert.equal(SETTLEMENT_LIVE_KPI_FIELDS.settlementValueMatched, 'confirmed_matched_value_minor')
assert.equal(LIVE_KPI_UNAVAILABLE, 'Unavailable')

// --- Contract-only total_confirmed_amount ⇒ still unavailable (wrong field) ---
{
  const contract = {
    total_confirmed_amount: 52_653.42,
    match_confidence: 0.9,
  } as unknown as BatchContractKpiResponse

  const standIn = resolveAuthoritativeMatchedValue(contract, null)
  assert.equal(standIn.value, null, 'contract total_confirmed_amount alone must not populate matched KPI')
  assert.equal(standIn.usedStandIn, true)
}

// --- batches/batch_health total_confirmed_amount_minor fills Settlement value matched ---
{
  const contract = {
    total_confirmed_amount: 52_653.42,
    match_confidence: 0.9,
  } as unknown as BatchContractKpiResponse
  const detail = {
    batch: { total_confirmed_amount_minor: 43_117.46 },
    batch_health: { total_confirmed_amount_minor: 88_888, total_variance_minor: 12 },
  } as unknown as BatchDetailResponse

  const kpis = resolveSettlementIntelligenceKpis(contract, detail)
  assert.equal(kpis.settlementValueMatched, 43_117.46)
  assert.equal(kpis.settlementValueMatchedIsStandIn, true)
  assert.equal(kpis.sources.settlementValueMatched, 'batches.total_confirmed_amount_minor')
  assert.equal(kpis.varianceAmount, null, 'must not fall back variance to batch/health total_variance_minor')
}

// --- Authoritative field present ⇒ use it (ignore stand-ins) ---
{
  const contract = {
    confirmed_matched_value_minor: 42_000_000,
    total_confirmed_amount: 52_653.42,
    variance_amount: -100,
    original_settled_amount: 50_000_000,
    computed_at: '2026-08-11T10:00:00Z',
  } as unknown as BatchContractKpiResponse
  const detail = {
    batch: { total_confirmed_amount_minor: 43_117.46 },
  } as unknown as BatchDetailResponse
  const kpis = resolveSettlementIntelligenceKpis(contract, detail)
  assert.equal(kpis.settlementValueMatched, 42_000_000)
  assert.equal(kpis.varianceAmount, -100)
  assert.equal(kpis.observedSettlementValue, 50_000_000)
  assert.equal(resolveAuthoritativeMatchedValue(contract, detail).usedStandIn, false)
  assert.equal(kpis.asOf, '2026-08-11T10:00:00Z')
  assert.equal(kpis.asOfField, 'computed_at')
  assert.equal(kpis.sources.varianceAmount, 'batch_contract.variance_amount')
  assert.equal(kpis.sources.settlementValueMatched, 'batch_contract.confirmed_matched_value_minor')
}

// --- as-of falls back to batch_health.updated_at (timestamp only, not metric) ---
{
  const contract = {
    confirmed_matched_value_minor: 1,
  } as unknown as BatchContractKpiResponse
  const detail = {
    batch_health: { updated_at: '2026-08-01T00:00:00Z' },
  } as unknown as BatchDetailResponse
  const kpis = resolveSettlementIntelligenceKpis(contract, detail)
  assert.equal(kpis.asOf, '2026-08-01T00:00:00Z')
  assert.equal(kpis.asOfField, 'batch_health.updated_at')
}

// --- missing_reference_rate: no derivation from counts ---
{
  const contract = {
    missing_ref_count: 5,
    settlement_ref_count: 20,
  } as unknown as BatchContractKpiResponse
  const kpis = resolveSettlementIntelligenceKpis(contract, null)
  assert.equal(
    kpis.missingReferenceRate,
    null,
    'must not derive missing_reference_rate from count fields',
  )
  assert.equal(kpis.observedSettlementValue, null, 'observed value must not invent from other fields')
}

// --- Source guard: resolver must not use contract total_confirmed_amount as matched value ---
{
  const srcPath = join(__dirname, 'resolveSettlementIntelligenceKpis.ts')
  const src = readFileSync(srcPath, 'utf8')
  if (/settlementValueMatched:\s*parseApiAmount\(\s*batchContract\?\.total_confirmed_amount/.test(src)) {
    fail('resolver reintroduced total_confirmed_amount as settlementValueMatched source')
  }
  assert.match(src, /confirmed_matched_value_minor/, 'authoritative field must remain in resolver')
  assert.match(src, /total_confirmed_amount_minor/, 'batches confirmed fallback must remain')
  assert.match(src, /sources:/, 'CON-P1-22 source contract must remain')
  assert.doesNotMatch(
    src,
    /settlementValueMatched:\s*parseApiAmount\(batchContract\?\.total_confirmed_amount/,
  )
}

console.log('resolveSettlementIntelligenceKpis.contract.test.ts: OK')
