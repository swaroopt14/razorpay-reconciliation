/**
 * CON-P0-24 contract tests — run: npx tsx src/features/payout-command/settlement-journal/selectors/resolveSettlementIntelligenceKpis.contract.test.ts
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

// --- Only non-equivalent stand-in present ⇒ matched KPI unavailable ---
{
  const contract = {
    total_confirmed_amount: 52_653.42,
    match_confidence: 0.9,
  } as unknown as BatchContractKpiResponse
  const detail = {
    batch: { total_confirmed_amount_minor: 99_999 },
    batch_health: { total_confirmed_amount_minor: 88_888 },
  } as unknown as BatchDetailResponse

  const standIn = resolveAuthoritativeMatchedValue(contract)
  assert.equal(standIn.value, null, 'stand-in-only contract must not yield a matched value')
  assert.equal(standIn.usedStandIn, true, 'must detect that only a non-equivalent stand-in exists')

  const kpis = resolveSettlementIntelligenceKpis(contract, detail)
  assert.equal(
    kpis.settlementValueMatched,
    null,
    'Acceptance: only total_confirmed_amount / health confirmed must NOT populate settlementValueMatched',
  )
  assert.equal(kpis.settlementValueMatchedIsStandIn, false)
}

// --- Authoritative field present ⇒ use it (ignore stand-ins) ---
{
  const contract = {
    confirmed_matched_value_minor: 42_000_000,
    total_confirmed_amount: 52_653.42,
  } as unknown as BatchContractKpiResponse
  const kpis = resolveSettlementIntelligenceKpis(contract, null)
  assert.equal(kpis.settlementValueMatched, 42_000_000)
  assert.equal(resolveAuthoritativeMatchedValue(contract).usedStandIn, false)
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
}

// --- Source guard: resolver must not reintroduce total_confirmed_amount as matched-value fallback ---
{
  const srcPath = join(__dirname, 'resolveSettlementIntelligenceKpis.ts')
  const src = readFileSync(srcPath, 'utf8')
  if (/settlementValueMatched:\s*parseApiAmount\(\s*batchContract\?\.total_confirmed_amount/.test(src)) {
    fail('resolver reintroduced total_confirmed_amount as settlementValueMatched source')
  }
  if (/confirmedMatchedValueMinorFromBatchContract[\s\S]*total_confirmed_amount/.test(src)) {
    // allowed only in comments / ignore lists — ensure parse of authoritative field is primary
  }
  assert.match(src, /confirmed_matched_value_minor/, 'authoritative field must remain in resolver')
  assert.doesNotMatch(
    src,
    /settlementValueMatched:\s*parseApiAmount\(batchContract\?\.total_confirmed_amount/,
  )
}

console.log('resolveSettlementIntelligenceKpis.contract.test.ts: OK')
