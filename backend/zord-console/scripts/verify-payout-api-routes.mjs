#!/usr/bin/env node
/**
 * Verifies BFF route files exist for payout-command + customer + console wiring.
 * Run: node scripts/verify-payout-api-routes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** BFF path → expected route.ts relative to app/api/prod */
const WIRED_ROUTES = [
  ['Home · intelligence', 'intelligence/leakage/route.ts'],
  ['Home · intelligence', 'intelligence/ambiguity/route.ts'],
  ['Home · intelligence', 'intelligence/defensibility/route.ts'],
  ['Home · intelligence', 'intelligence/patterns/route.ts'],
  ['Connectors · pattern detail', 'intelligence/pattern/route.ts'],
  ['Connectors · pattern history', 'intelligence/pattern/history/route.ts'],
  ['Home · intelligence', 'intelligence/recommendations/route.ts'],
  ['Home · trend', 'home/disbursement-trend/route.ts'],
  ['Payment Gaps', 'intelligence/leakage/route.ts'],
  ['Payment Gaps · batches', 'intelligence/batches/route.ts'],
  ['Match Review', 'intelligence/ambiguity/route.ts'],
  ['Ambiguity · velocity scatter', 'ambiguity/velocity/route.ts'],
  ['Intent Journal · batch-ids', 'intents/batch-ids/route.ts'],
  ['Intent Journal · payment-intents', 'intents/payment-intents/route.ts'],
  ['Intent Journal · dlq-items', 'intents/dlq-items/route.ts'],
  ['Intent Journal · intent detail', 'intents/[intent_id]/route.ts'],
  ['Intent Journal · intel batch', 'intelligence/batches/[batch_id]/route.ts'],
  ['Settlement', 'settlement/observations/batches/route.ts'],
  ['Evidence · packs', 'evidence/packs/route.ts'],
  ['Evidence · pack detail', 'evidence/packs/[packId]/route.ts'],
  ['BCC · intent batches', 'intents/batches/route.ts'],
  ['Home · ingest status', 'ingest-status/route.ts'],
  ['Leakage · timeseries', 'intelligence/timeseries/leakage/route.ts'],
  ['Systems · sync status', 'systems/sync-status/route.ts'],
  ['Exports · gap report', 'exports/gap-report/route.ts'],
  ['Exports · review list', 'exports/review-list/route.ts'],
  ['Evidence · verify', 'evidence/packs/[packId]/verify/route.ts'],
  ['Customer · intents', 'intents/route.ts'],
  ['Customer · dlq', 'dlq/route.ts'],
  ['Console · overview', 'overview/route.ts'],
  ['Zord · metrics overview', 'zord/metrics/overview/route.ts'],
]

let missing = 0
const seen = new Set()

for (const [label, rel] of WIRED_ROUTES) {
  const key = rel
  if (seen.has(key)) continue
  seen.add(key)
  const full = path.join(root, 'app/api/prod', rel)
  if (!fs.existsSync(full)) {
    console.error(`MISSING [${label}]: app/api/prod/${rel}`)
    missing += 1
  } else {
    console.log(`OK  app/api/prod/${rel}`)
  }
}

if (missing > 0) {
  console.error(`\n${missing} route file(s) missing.`)
  process.exit(1)
}
console.log(`\nAll ${seen.size} unique BFF route files exist.`)
