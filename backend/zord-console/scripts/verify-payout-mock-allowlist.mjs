#!/usr/bin/env node
/**
 * CON-P1-36 — Live roots may not import mocks. Sandbox has a separate allowlist.
 *
 * Live scan: app/payout-command-view, src/features/payout-command (except sandbox/),
 *            services/payout-command (except sandbox-data / sandbox-setup).
 * Sandbox scan: app/sandbox and payout-command/sandbox may import mocks.
 *
 * Acceptance: importing a mock into a live surface exits non-zero.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const LIVE_SCAN_ROOTS = [
  path.join(root, 'app/payout-command-view'),
  path.join(root, 'src/features/payout-command'),
  path.join(root, 'services/payout-command'),
]

const SANDBOX_SCAN_ROOTS = [
  path.join(root, 'app/sandbox'),
  path.join(root, 'src/features/payout-command/sandbox'),
]

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

const MOCK_MODULE_RE =
  /(Mock|mock-data|sandbox-data|seeded-batches-store|intent-journal-mocks|seededRoutingData)/

const LIVE_FORBIDDEN = [
  { id: 'mock-module-import', re: /from\s+['"][^'"]*(Mock|sandbox-data|intent-journal-mocks|seeded-batches-store|seededRoutingData)[^'"]*['"]/ },
  { id: 'leakageComparisonMock', re: /leakageComparisonMock/ },
  { id: 'watchlistMock', re: /watchlistMock/ },
  { id: 'buildAmbiguityVelocityMock', re: /buildAmbiguityVelocityMock/ },
  { id: 'SAMPLE_PACK', re: /\bSAMPLE_PACK\b/ },
  { id: 'SANDBOX_API_KEYS', re: /\bSANDBOX_API_KEYS\b/ },
  { id: 'SANDBOX_RECENT_REQUESTS', re: /\bSANDBOX_RECENT_REQUESTS\b/ },
  { id: 'getIntentJournalBatches', re: /\bgetIntentJournalBatches\b/ },
  { id: 'buildDefaultBatchRows', re: /\bbuildDefaultBatchRows\b/ },
  { id: 'buildSeedSummary', re: /\bbuildSeedSummary\b/ },
  { id: 'BORROWER_VERIFICATION_MOCK', re: /\bBORROWER_VERIFICATION_MOCK\b/ },
  { id: 'POST_DISBURSAL_MONITORING_MOCK', re: /\bPOST_DISBURSAL_MONITORING_MOCK\b/ },
]

function isSandboxPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  const base = normalized.split('/').pop() || ''
  return (
    normalized.includes('/sandbox/') ||
    normalized.endsWith('/sandbox-data.ts') ||
    /Mock\.ts$/.test(normalized) ||
    /mocks\.ts$/.test(normalized) ||
    base === 'intent-journal-mocks.ts' ||
    base === 'seeded-batches-store.ts' ||
    /mocks?\//i.test(normalized)
  )
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (SOURCE_EXT.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

const liveViolations = []

for (const scanRoot of LIVE_SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    if (isSandboxPath(file)) continue
    const content = fs.readFileSync(file, 'utf8')
    const rel = path.relative(root, file)
    for (const { id, re } of LIVE_FORBIDDEN) {
      if (re.test(content)) {
        liveViolations.push({ file: rel, pattern: id })
      }
    }
  }
}

if (liveViolations.length > 0) {
  console.error('verify-payout-mock-allowlist: FAILED (live roots)\n')
  for (const v of liveViolations) {
    console.error(`  ${v.file}: forbidden ${v.pattern}`)
  }
  console.error(`\n${liveViolations.length} live violation(s). Live surfaces may not import mocks.`)
  process.exit(1)
}

let sandboxMockFiles = 0
for (const scanRoot of SANDBOX_SCAN_ROOTS) {
  sandboxMockFiles += walk(scanRoot).filter((file) => MOCK_MODULE_RE.test(file)).length
}

console.log('verify-payout-mock-allowlist: OK (zero mock imports in live roots)')
console.log(`sandbox allowlist roots preserved (${sandboxMockFiles} mock-named files under sandbox paths)`)
