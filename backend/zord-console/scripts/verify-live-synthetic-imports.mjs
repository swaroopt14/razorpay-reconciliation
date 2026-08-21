#!/usr/bin/env node
/**
 * CON-P1-42 — Block synthetic/live demo imports under live roots and /api/prod.
 * Permit mock/synthetic/sandbox only under explicit demo/landing/sandbox paths.
 *
 * Acceptance: importing @/services/analytics (or mocks) from app/api/prod fails CI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_ROOTS = [
  path.join(root, 'app/api/prod'),
  path.join(root, 'app/payout-command-view'),
  path.join(root, 'src/features/payout-command'),
]

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

const FORBIDDEN = [
  { id: 'analytics-synthetic', re: /from\s+['"]@\/services\/analytics['"]/ },
  { id: 'sandbox-data', re: /from\s+['"][^'"]*sandbox-data[^'"]*['"]/ },
  { id: 'mock-import', re: /from\s+['"][^'"]*Mock[^'"]*['"]/ },
  { id: 'SAMPLE_PACK', re: /\bSAMPLE_PACK\b/ },
  { id: 'seededRoutingData', re: /\bseededRoutingData\b/ },
]

const ALLOWED_PATH_FRAGMENTS = [
  '/sandbox/',
  '/landing-final/',
  '/demo/',
  'Mock.ts',
]

function isAllowed(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  return ALLOWED_PATH_FRAGMENTS.some((frag) => normalized.includes(frag))
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
    if (isAllowed(file)) continue
    const content = fs.readFileSync(file, 'utf8')
    const rel = path.relative(root, file)
    for (const { id, re } of FORBIDDEN) {
      if (re.test(content)) violations.push({ file: rel, pattern: id })
    }
  }
}

if (violations.length > 0) {
  console.error('verify-live-synthetic-imports: FAILED\n')
  for (const v of violations) {
    console.error(`  ${v.file}: forbidden ${v.pattern}`)
  }
  console.error(`\n${violations.length} violation(s). Synthetic/demo modules cannot enter live or /api/prod.`)
  process.exit(1)
}

console.log('verify-live-synthetic-imports: OK')
