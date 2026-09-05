#!/usr/bin/env node
/**
 * Fails when non-allowlisted mock/fallback imports appear in active payout-command paths.
 * Run: node scripts/verify-payout-mock-allowlist.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_ROOTS = [
  path.join(root, 'src/features/payout-command'),
  path.join(root, 'app/payout-command-view'),
]

const ALLOWLIST_PATH_FRAGMENTS = [
  '/verification/borrowerVerificationMock',
  '/verification/borrowerProfileMock',
  '/monitoring/postDisbursalMonitoringMock',
  '/monitoring/loanProfileMock',
  '/support/',
]

const FORBIDDEN_PATTERNS = [
  { id: 'leakageComparisonMock', re: /leakageComparisonMock/ },
  { id: 'watchlistMock', re: /watchlistMock/ },
  { id: 'buildAmbiguityVelocityMock', re: /buildAmbiguityVelocityMock/ },
  { id: 'SAMPLE_PACK', re: /\bSAMPLE_PACK\b/ },
  { id: 'SANDBOX_API_KEYS', re: /\bSANDBOX_API_KEYS\b/ },
  { id: 'SANDBOX_RECENT_REQUESTS', re: /\bSANDBOX_RECENT_REQUESTS\b/ },
  { id: 'intent-journal-mocks', re: /intent-journal-mocks/ },
  { id: 'seeded-batches-store', re: /seeded-batches-store/ },
  { id: 'getIntentJournalBatches', re: /\bgetIntentJournalBatches\b/ },
  { id: 'seededRoutingData', re: /seededRoutingData/ },
  { id: 'buildDefaultBatchRows', re: /\bbuildDefaultBatchRows\b/ },
  { id: 'buildSeedSummary', re: /\bbuildSeedSummary\b/ },
]

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

function isAllowlisted(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  return ALLOWLIST_PATH_FRAGMENTS.some((frag) => normalized.includes(frag))
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

const violations = []

for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    if (isAllowlisted(file)) continue
    const content = fs.readFileSync(file, 'utf8')
    const rel = path.relative(root, file)
    for (const { id, re } of FORBIDDEN_PATTERNS) {
      if (re.test(content)) {
        violations.push({ file: rel, pattern: id })
      }
    }
  }
}

if (violations.length > 0) {
  console.error('verify-payout-mock-allowlist: FAILED\n')
  for (const v of violations) {
    console.error(`  ${v.file}: forbidden ${v.pattern}`)
  }
  console.error(`\n${violations.length} violation(s). Only borrower verification, post-disbursal monitoring, and support/ may import mock data.`)
  process.exit(1)
}

console.log('verify-payout-mock-allowlist: OK (no forbidden mock imports in active payout-command paths)')
