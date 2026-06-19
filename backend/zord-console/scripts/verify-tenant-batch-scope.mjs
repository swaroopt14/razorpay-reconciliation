#!/usr/bin/env node
/**
 * Static checks: batch-scoped BFF routes forward batch_id / client_batch_id;
 * intelligence/evidence/intent proxies inject session tenant (ignore client tenant_id).
 *
 * Run: node scripts/verify-tenant-batch-scope.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const checks = [
  {
    file: 'app/api/prod/evidence/_shared.ts',
    mustInclude: ["params.delete('tenant_id')", "params.set('tenant_id', tenantId)"],
    label: 'evidence BFF injects session tenant',
  },
  {
    file: 'app/api/prod/intelligence/_shared.ts',
    mustInclude: ["params.delete('tenant_id')", "params.set('tenant_id', tenantId)"],
    label: 'intelligence BFF injects session tenant',
  },
  {
    file: 'app/api/prod/intents/_proxyIntentEngineGet.ts',
    mustInclude: ['requireSessionTenantForProdProxy', 'upstreamParams.set'],
    label: 'intent-engine proxy injects tenant',
  },
  {
    file: 'app/api/prod/intents/payment-intents/route.ts',
    mustInclude: ['batch_id'],
    label: 'payment-intents requires batch_id',
  },
  {
    file: 'app/api/prod/settlement/observations/batches/route.ts',
    mustInclude: ['client_batch_id', 'tenant_id: tenantId'],
    label: 'settlement observations forwards client_batch_id + session tenant',
  },
  {
    file: 'services/payout-command/prod-api/getEvidencePacks.ts',
    mustInclude: ['batch_id', 'BFF injects session tenant'],
    mustNotInclude: ['tenant_id'],
    label: 'evidence client does not send tenant_id',
  },
  {
    file: 'services/payout-command/prod-api/intentJournalApi.ts',
    mustInclude: ['batch_id'],
    mustNotInclude: ['tenant_id'],
    label: 'intent journal client sends batch_id only',
  },
  {
    file: 'services/payout-command/prod-api/settlementObservations.ts',
    mustInclude: ['client_batch_id', 'observationsUrl(bid'],
    label: 'settlement client uses client_batch_id query only',
  },
  {
    file: 'services/payout-command/prod-api/getIntelligenceKpis.ts',
    mustInclude: ['BFF injects tenant from session', 'batch_id: bid'],
    label: 'intelligence KPI client is session-scoped',
  },
  {
    file: 'app/api/prod/intelligence/leakage/route.ts',
    mustInclude: ['forwardIntelligence'],
    label: 'leakage BFF forwards query params (batch_id)',
  },
  {
    file: 'app/api/prod/intelligence/ambiguity/route.ts',
    mustInclude: ['forwardIntelligence'],
    label: 'ambiguity BFF forwards query params (batch_id)',
  },
  {
    file: 'app/api/prod/intelligence/timeseries/leakage/route.ts',
    mustInclude: ['forwardIntelligence'],
    label: 'leakage timeseries BFF forwards query params (batch_id)',
  },
  {
    file: 'src/features/payout-command/hooks/useIntelligenceBatchUrlSync.ts',
    mustInclude: ["params.set('batch_id'", "params.delete('batch_id')"],
    label: 'leakage/ambiguity URL sync for batch_id',
  },
  {
    file: 'src/features/payout-command/intent-journal/intentJournalSidebarUtils.ts',
    mustInclude: [
      'export function resolveBatchHealthStatus(batch: BatchRecord): BatchStatus | null',
      'return batchStatusFromConfidencePct(confPct)',
    ],
    label: 'sidebar health tier from aggregate score when present',
  },
]

let failed = 0

for (const check of checks) {
  const full = path.join(root, check.file)
  if (!fs.existsSync(full)) {
    console.error(`MISSING ${check.file}`)
    failed += 1
    continue
  }
  const text = fs.readFileSync(full, 'utf8')
  for (const snippet of check.mustInclude ?? []) {
    if (!text.includes(snippet)) {
      console.error(`FAIL [${check.label}] ${check.file} missing: ${snippet}`)
      failed += 1
    }
  }
  for (const snippet of check.mustNotInclude ?? []) {
    if (text.includes(snippet)) {
      console.error(`FAIL [${check.label}] ${check.file} must not include: ${snippet}`)
      failed += 1
    }
  }
}

const batchPages = [
  ['intent journal', 'src/features/payout-command/intent-journal/journalBatchCache.ts', 'getIntentJournalPaymentIntentsForSession'],
  ['evidence', 'src/features/payout-command/evidence/EvidenceSurface.tsx', 'listEvidencePacksForBatch'],
  ['settlement', 'services/payout-command/prod-api/settlementObservations.ts', 'getSettlementObservationsForClientBatch'],
]

for (const [name, file, needle] of batchPages) {
  const full = path.join(root, file)
  const text = fs.readFileSync(full, 'utf8')
  if (!text.includes(needle)) {
    console.error(`FAIL ${name} wiring: ${file} missing ${needle}`)
    failed += 1
  } else {
    console.log(`OK  ${name} → ${needle}`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} tenant/batch scope check(s) failed.`)
  process.exit(1)
}

console.log('\nAll tenant/batch scope static checks passed.')
