#!/usr/bin/env node
/**
 * CON-P1-37 — Recursively collect /api/prod paths from live entrypoints, hooks, and
 * prod-api clients. Every referenced BFF route file must exist and enforce session auth.
 *
 * Acceptance: delete a required BFF route used through a hook => this script fails.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_ROOTS = [
  path.join(root, 'app/payout-command-view'),
  path.join(root, 'src/features/payout-command'),
  path.join(root, 'services/payout-command'),
]

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

const AUTH_MARKERS = [
  'requireSessionTenantForProdProxy',
  'assertCookieMutationProtection',
  'forwardIntelligence',
  'forwardEvidence',
  'proxyIntentEngine',
  'requireSessionTenant',
  'resolveSettlementUploadContext',
  'resolveBulkIngestForwardAuthorization',
]

const API_PATH_RE = /['"`](\/api\/prod\/[A-Za-z0-9_./${}-]+)['"`]/g
const TEMPLATE_API_RE = /`(\/api\/prod\/[^`]+)`/g

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

function normalizeApiPath(raw) {
  let p = raw.split('?')[0]
  p = p.replace(/\/\$\{[^}]+\}/g, '/:param')
  p = p.replace(/\$\{[^}]+\}/g, '')
  p = p.replace(/\/{2,}/g, '/')
  p = p.replace(/\/+$/, '')
  return p
}

function isPrefixOrWildcard(apiPath) {
  if (apiPath.includes('*')) return true
  if (!apiPath.startsWith('/api/prod/')) return true
  const rel = apiPath.replace(/^\/api\/prod\/?/, '')
  if (!rel) return true
  if (rel.includes(':param')) return false
  const dir = path.join(root, 'app/api/prod', ...rel.split('/').filter(Boolean))
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    const routeFile = path.join(dir, 'route.ts')
    if (!fs.existsSync(routeFile)) return true
  }
  return false
}

function findMatchingRoute(apiPath) {
  const rel = apiPath.replace(/^\/api\/prod\/?/, '')
  const parts = rel.split('/').filter(Boolean)
  let dir = path.join(root, 'app/api/prod')
  for (const part of parts) {
    if (!fs.existsSync(dir)) return null
    const dynamic = part === ':param' || part.startsWith(':')
    if (!dynamic) {
      const next = path.join(dir, part)
      if (fs.existsSync(next)) {
        dir = next
        continue
      }
      return null
    }
    const dyn = fs.readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && /^\[[^\]]+\]$/.test(e.name))
    if (!dyn) return null
    dir = path.join(dir, dyn.name)
  }
  const routeFile = path.join(dir, 'route.ts')
  return fs.existsSync(routeFile) ? routeFile : null
}

function fileHasAuth(routeFile) {
  const text = fs.readFileSync(routeFile, 'utf8')
  if (AUTH_MARKERS.some((m) => text.includes(m))) return true
  const importRe = /from\s+['"]([^'"]+)['"]/g
  let match
  const dir = path.dirname(routeFile)
  while ((match = importRe.exec(text))) {
    const spec = match[1]
    if (!spec.startsWith('.')) continue
    const resolved = path.join(dir, spec.endsWith('.ts') || spec.endsWith('.tsx') ? spec : `${spec}.ts`)
    const candidates = [resolved, resolved.replace(/\.ts$/, '.tsx'), path.join(dir, spec, 'index.ts')]
    for (const cand of candidates) {
      if (!fs.existsSync(cand)) continue
      const nested = fs.readFileSync(cand, 'utf8')
      if (AUTH_MARKERS.some((m) => nested.includes(m))) return true
    }
  }
  return false
}

const referenced = new Map()

for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    const content = fs.readFileSync(file, 'utf8')
    const rel = path.relative(root, file)
    for (const re of [API_PATH_RE, TEMPLATE_API_RE]) {
      re.lastIndex = 0
      let match
      while ((match = re.exec(content))) {
        const apiPath = normalizeApiPath(match[1])
        if (!apiPath.startsWith('/api/prod/')) continue
        if (isPrefixOrWildcard(apiPath)) continue
        if (!referenced.has(apiPath)) referenced.set(apiPath, [])
        referenced.get(apiPath).push(rel)
      }
    }
  }
}

if (referenced.size === 0) {
  console.error('verify-console-page-routes: FAILED — no /api/prod paths found from live entrypoints/hooks.')
  process.exit(1)
}

let missing = 0
let unauth = 0

for (const [apiPath, files] of [...referenced.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const routeFile = findMatchingRoute(apiPath)
  if (!routeFile) {
    console.error(`MISSING BFF for ${apiPath} (from ${files[0]})`)
    missing += 1
    continue
  }
  if (!fileHasAuth(routeFile)) {
    console.error(`NO SESSION AUTH on ${path.relative(root, routeFile)} (used by ${apiPath})`)
    unauth += 1
    continue
  }
  console.log(`OK  ${apiPath} → ${path.relative(root, routeFile)}`)
}

console.log(`\nLive surfaces/hooks reference ${referenced.size} /api/prod path(s).`)

if (missing > 0 || unauth > 0) {
  console.error(`\n${missing} missing route(s), ${unauth} missing auth gate(s).`)
  process.exit(1)
}
console.log('Page→BFF recursive expectations OK.')
