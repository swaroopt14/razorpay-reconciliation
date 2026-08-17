#!/usr/bin/env node
/**
 * Static release gate for CON-P0-21, CON-P0-22, and CON-P1-32.
 * Run: node scripts/verify-production-truthfulness.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function requireMatch(rel, re, message) {
  if (!re.test(read(rel))) failures.push(`${rel}: ${message}`)
}

function forbidMatch(rel, re, message) {
  if (re.test(read(rel))) failures.push(`${rel}: ${message}`)
}

const overviewService = 'services/backend/overview.ts'
const overviewRoute = 'app/api/prod/overview/route.ts'
const intelligenceBff = 'app/api/prod/intelligence/_shared.ts'
const homeSurface = 'src/features/payout-command/surfaces/HomeSurface.tsx'
const supportModel = 'services/payout-command/support/supportTickets.ts'
const supportSurface = 'src/features/payout-command/support/SupportSurface.tsx'
const supportRoute = 'app/api/support/tickets/[ticketId]/messages/route.ts'

requireMatch(overviewService, /availability:\s*'UNAVAILABLE'/, 'overview outage must be UNAVAILABLE')
requireMatch(overviewService, /hash_chain:\s*'UNKNOWN'/, 'unknown evidence must default to UNKNOWN')
requireMatch(overviewRoute, /status:\s*503/, 'unavailable overview must return HTTP 503')
forbidMatch(overviewService, /latency_ms:\s*60\b/, 'must not invent a 60ms SLO')
forbidMatch(overviewService, /success_rate_pct:\s*99\.9\b/, 'must not invent a 99.9% SLO')

requireMatch(intelligenceBff, /availability:\s*'UNAVAILABLE'/, 'intelligence outage must be UNAVAILABLE')
requireMatch(intelligenceBff, /status:\s*503/, 'intelligence outage must return HTTP 503')
requireMatch(intelligenceBff, /availability:\s*'EMPTY'/, 'valid no-data response must be EMPTY')
requireMatch(homeSurface, /data-testid="intelligence-unavailable"/, 'live UI needs an unavailable warning')

forbidMatch(supportModel, /\bEmail sent\b/, 'stored support messages must not claim email delivery')
forbidMatch(supportSurface, /\bEmail sent\b|\bSend Email\b/, 'support UI must not claim email delivery')
requireMatch(supportSurface, /It does not send an email\./, 'support UI must disclose that no email is sent')
requireMatch(supportRoute, /email_sent:\s*false/, 'support API must report that email was not sent')

if (failures.length > 0) {
  console.error('verify-production-truthfulness: FAILED\n')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log('verify-production-truthfulness: OK (outages and support delivery are represented truthfully)')
