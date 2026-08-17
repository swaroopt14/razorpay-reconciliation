#!/usr/bin/env node
/**
 * Fails if live /api/prod or live payout surfaces import the synthetic analytics package.
 * Run: node scripts/verify-no-synthetic-analytics-in-prod.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_ROOTS = [
  path.join(root, 'app/api/prod'),
  path.join(root, 'app/payout-command-view'),
  path.join(root, 'src/features/payout-command'),
  path.join(root, 'services/payout-command'),
]

/** Sandbox-only / landing-only trees that may still use seeded analytics. */
const ALLOWLIST_PATH_FRAGMENTS = [
  '/verification/',
  '/monitoring/',
  '/create-payment/',
]

const FORBIDDEN = [
  { id: '@/services/analytics', re: /from\s+['"]@\/services\/analytics(?:\/[^'"]+)?['"]/ },
  { id: 'services/analytics', re: /from\s+['"][^'"]*services\/analytics(?:\/[^'"]+)?['"]/ },
  { id: 'require analytics', re: /require\(\s*['"]@\/services\/analytics/ },
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
    for (const { id, re } of FORBIDDEN) {
      if (re.test(content)) {
        violations.push({ file: rel, pattern: id })
      }
    }
  }
}

if (violations.length > 0) {
  console.error('verify-no-synthetic-analytics-in-prod: FAILED\n')
  for (const v of violations) {
    console.error(`  ${v.file}: forbidden ${v.pattern}`)
  }
  console.error(
    `\n${violations.length} violation(s). Live /api/prod and live payout surfaces must not import services/analytics.`,
  )
  process.exit(1)
}

const LIVE_HOME_FILES = [
  'src/features/payout-command/hooks/useLiveHomeState.ts',
  'services/payout-command/liveHomeCalendar.ts',
]
const LIVE_HOME_FORBIDDEN = /homeSimulationScenarios|buildSimulatedHomeOverviewSnapshot|buildStaticHomeOverviewSnapshot/
for (const rel of LIVE_HOME_FILES) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) {
    console.error(`verify-no-synthetic-analytics-in-prod: missing ${rel}`)
    process.exit(1)
  }
  const content = fs.readFileSync(full, 'utf8')
  if (LIVE_HOME_FORBIDDEN.test(content)) {
    console.error(`verify-no-synthetic-analytics-in-prod: ${rel} references simulation snapshots`)
    process.exit(1)
  }
}

console.log('verify-no-synthetic-analytics-in-prod: OK (no synthetic analytics imports on live paths)')
