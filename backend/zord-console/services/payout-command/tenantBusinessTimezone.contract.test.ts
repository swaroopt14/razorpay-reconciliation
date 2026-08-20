/**
 * CON-P1-29 contract tests
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/tenantBusinessTimezone.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  businessDateYmd,
  businessPresetStartYmd,
  businessTrendWindowYmd,
  formatInTenantBusinessTimezone,
  isInstantInBusinessDatePreset,
  resolveTenantBusinessTimezone,
} from './tenantBusinessTimezone'

const __dirname = dirname(fileURLToPath(import.meta.url))

assert.equal(resolveTenantBusinessTimezone('Asia/Kolkata'), 'Asia/Kolkata')
assert.equal(resolveTenantBusinessTimezone('Not/AZone'), 'Asia/Kolkata')

// Acceptance: 23:30 UTC → Asia/Kolkata business date is next civil day
{
  const instant = new Date('2026-08-12T23:30:00.000Z')
  assert.equal(businessDateYmd(instant, 'Asia/Kolkata'), '2026-08-13')
  assert.equal(businessDateYmd(instant, 'UTC'), '2026-08-12')

  // "today" in Kolkata is 2026-08-13 → instant is included; browser-US "Aug 12" would disagree
  const nowKolkataAfternoon = new Date('2026-08-13T10:00:00.000Z') // 15:30 IST
  assert.equal(
    isInstantInBusinessDatePreset(instant, '7d', 'Asia/Kolkata', nowKolkataAfternoon),
    true,
  )
  assert.equal(businessPresetStartYmd('7d', 'Asia/Kolkata', nowKolkataAfternoon), '2026-08-07')
}

// Display uses tenant TZ (05:00 IST on Aug 13 for 23:30 UTC Aug 12)
{
  const label = formatInTenantBusinessTimezone('2026-08-12T23:30:00.000Z', 'Asia/Kolkata')
  assert.match(label, /13/)
  assert.match(label, /Aug/i)
}

// Trend window uses business TZ civil month, not browser local
{
  const now = new Date('2026-08-13T01:00:00.000Z') // still Aug 12 in US Pacific, Aug 13 in IST
  const win = businessTrendWindowYmd('week', 'Asia/Kolkata', now)
  assert.equal(win.to_date, '2026-08-13')
  assert.equal(win.from_date, '2026-08-07')
}

// Settlement filter helper must not use setHours (browser-local)
{
  const utilsSrc = readFileSync(
    join(__dirname, '../../src/features/payout-command/settlement-journal/settlementJournalSidebarUtils.ts'),
    'utf8',
  )
  assert.match(utilsSrc, /isInstantInBusinessDatePreset|businessDateYmd/)
  assert.doesNotMatch(
    utilsSrc,
    /observationInDateRange[\s\S]*setHours\(0,\s*0,\s*0,\s*0\)/,
    'must not use browser-local setHours for financial windows',
  )
}

console.log('tenantBusinessTimezone.contract.test.ts: OK')
