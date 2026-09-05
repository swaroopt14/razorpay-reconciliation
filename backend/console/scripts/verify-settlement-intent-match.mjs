#!/usr/bin/env node
/**
 * Console-only settlement ↔ payment-intent match check.
 * Usage: node scripts/verify-settlement-intent-match.mjs [batch_id] [base_url]
 */

const batchId = process.argv[2]?.trim() || '1234'
const base = (process.argv[3]?.trim() || 'http://localhost:3000').replace(/\/$/, '')

function norm(v) {
  return String(v ?? '').trim()
}

function resolveMatch(obs, intents) {
  const observationId = norm(obs.settlement_observation_id)
  const byObs = intents.find((i) => norm(i.intent_id) === observationId)
  if (byObs?.intent_id) return { intentId: byObs.intent_id, via: 'intent_id=settlement_observation_id' }

  const clientRef = norm(obs.client_reference_candidate)
  const byRef = intents.find((i) => norm(i.client_payout_ref) === clientRef)
  if (byRef?.intent_id) return { intentId: byRef.intent_id, via: 'client_payout_ref=client_reference_candidate' }

  return null
}

async function fetchJson(path) {
  const url = `${base}${path}`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 200) }
  }
  return { ok: res.ok, status: res.status, url, data }
}

const settlementPath = `/api/prod/settlement/observations/batches?client_batch_id=${encodeURIComponent(batchId)}`
const intentsPath = `/api/prod/intents/payment-intents?batch_id=${encodeURIComponent(batchId)}`

const [settlement, intents] = await Promise.all([fetchJson(settlementPath), fetchJson(intentsPath)])

console.log('Batch:', batchId)
console.log('Settlement:', settlement.status, settlement.url)
console.log('Payment intents:', intents.status, intents.url)

const obsItems = settlement.data?.items ?? []
const intentItems = intents.data?.items ?? []

console.log(`Rows: ${obsItems.length} settlement · ${intentItems.length} payment intents\n`)

let matched = 0
for (const obs of obsItems) {
  const hit = resolveMatch(obs, intentItems)
  if (hit) {
    matched += 1
    console.log('MATCH', obs.settlement_observation_id, '→', hit.intentId, `(${hit.via})`)
  } else {
    console.log('MISS ', obs.settlement_observation_id, 'client_ref=', obs.client_reference_candidate)
  }
}

console.log(`\nMatched ${matched}/${obsItems.length}`)
process.exit(matched > 0 || obsItems.length === 0 ? 0 : 1)
