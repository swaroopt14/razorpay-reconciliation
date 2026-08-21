/**
 * CON-P0-19, CON-P1-16…18, CON-P1-26…27, CON-P1-34, CON-P2-01 — commercial truth locks.
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/commercial-truth/commercialScopeFollowups.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatIntentIdUnavailable,
  journalIntentRowKey,
} from '../prod-api/mapIntentEngineBatch'
import {
  isLiveBlockedDock,
  LIVE_CONSOLE_DOCK_IDS,
  LIVE_BLOCKED_DOCK_IDS,
} from '../model'
import { workspaceApiKeysPath } from '../workspaceApiKeysPath'
import { resolveInitialDock } from '../../../app/payout-command-view/today/_lib/resolveInitialDock'

const __dirname = dirname(fileURLToPath(import.meta.url))
const consoleRoot = join(__dirname, '../../..')

function read(rel: string): string {
  return readFileSync(join(consoleRoot, rel), 'utf8')
}

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`fail - ${name}`)
    throw err
  }
}

/** CON-P0-19 — orphan increases observed, not matched. */
export function matchedAllocatedFromObserved(
  observedMinor: number | null,
  orphanMinor: number | null,
): number | null {
  if (observedMinor == null || orphanMinor == null) return null
  return Math.max(0, observedMinor - orphanMinor)
}

check('CON-P0-19 orphan raises observed but not matched', () => {
  const observed = 10_000
  const orphan = 2_500
  const matched = matchedAllocatedFromObserved(observed, orphan)
  assert.equal(matched, 7_500)
  assert.ok(observed > (matched ?? 0))
  const home = read('src/features/payout-command/surfaces/HomeSurface.tsx')
  const copy = read('src/features/payout-command/command-center/paymentCommandCopy.ts')
  assert.doesNotMatch(home, /bankConfirmedMinor/)
  assert.doesNotMatch(copy, /Bank-Confirmed|Fully Matched/)
  assert.match(home, /Observed Outcome Value|observedMinor/)
  assert.match(home, /orphan_amount_minor/)
  assert.match(copy, /Observed Outcome Value/)
})

check('CON-P1-16 live dock deep-links blocked', () => {
  assert.equal(resolveInitialDock('billing', LIVE_CONSOLE_DOCK_IDS), 'home')
  assert.equal(resolveInitialDock('verification', LIVE_CONSOLE_DOCK_IDS), 'home')
  assert.equal(resolveInitialDock('monitoring', LIVE_CONSOLE_DOCK_IDS), 'home')
  assert.equal(resolveInitialDock('connectors', LIVE_CONSOLE_DOCK_IDS), 'home')
  assert.equal(resolveInitialDock('grid', LIVE_CONSOLE_DOCK_IDS), 'grid')
  assert.ok(isLiveBlockedDock('billing'))
  for (const id of LIVE_BLOCKED_DOCK_IDS) {
    assert.ok(!LIVE_CONSOLE_DOCK_IDS.includes(id as (typeof LIVE_CONSOLE_DOCK_IDS)[number]))
  }
  const shell = read('src/features/payout-command/shell/PayoutCommandViewClient.tsx')
  assert.match(shell, /resolveDockFromSearchParam/)
  assert.match(shell, /isLiveBlockedDock/)
  assert.match(shell, /LIVE_CONSOLE_DOCK_IDS|allowedDocksForMode/)
})

check('CON-P1-17 live Home has no simulation scaffold import', () => {
  const liveHome = read('src/features/payout-command/hooks/useLiveHomeState.ts')
  const shell = read('src/features/payout-command/shell/PayoutCommandViewClient.tsx')
  assert.doesNotMatch(liveHome, /homeSimulationScenarios/)
  assert.match(shell, /useLiveHomeState\(!isSandbox/)
  assert.match(shell, /useHomeState\(isSandbox/)
})

check('CON-P1-18 live API keys never call sandbox endpoint', () => {
  assert.equal(workspaceApiKeysPath('live'), '/api/prod/workspace-api-keys')
  assert.equal(workspaceApiKeysPath('sandbox'), '/api/sandbox/workspace-api-keys')
  const settings = read('app/payout-command-view/settings/api-keys/_components/ApiKeysClient.tsx')
  assert.match(settings, /workspaceApiKeysPath\(mode\)/)
  assert.doesNotMatch(settings, /fetch\(\s*['\"]\/api\/sandbox\/workspace-api-keys['\"]/)
})

check('CON-P1-26 bank statement not inferred from defensibility', () => {
  const ingest = read('app/api/prod/ingest-status/route.ts')
  assert.doesNotMatch(ingest, /bank_confirmed_rate/)
  assert.doesNotMatch(ingest, /ENDPOINTS\.DEFENSIBILITY/)
  assert.match(ingest, /bank_statement/)
  assert.match(ingest, /status:\s*'missing'/)
  assert.match(ingest, /artifact\/source registry|Not connected/)
})

check('CON-P1-27 missing intent_id never fabricates ZRD-*', () => {
  const label = formatIntentIdUnavailable(12, 0)
  assert.equal(label, 'Intent ID unavailable · Source row 12')
  assert.doesNotMatch(label, /ZRD-/)
  const key = journalIntentRowKey('batch-a', 3, null, null)
  assert.doesNotMatch(key, /ZRD-/)
  const mapper = read('src/features/payout-command/intent-journal/mappers/mapIntentTableRow.ts')
  assert.doesNotMatch(mapper, /syntheticRequestId|buildZordId|`ZRD-/)
  assert.match(mapper, /formatIntentIdUnavailable/)
})

check('CON-P1-34 overview invents no 60ms/99.9 SLO', () => {
  const overview = read('services/backend/overview.ts')
  assert.doesNotMatch(overview, /latency_ms:\s*60\b/)
  assert.doesNotMatch(overview, /success_rate_pct:\s*99\.9\b/)
  assert.match(overview, /slo:\s*null/)
  assert.match(overview, /latencyMs == null && successRatePct == null/)
})

check('CON-P2-01 live V1 dock list is the allow-list only', () => {
  assert.ok(LIVE_CONSOLE_DOCK_IDS.includes('home'))
  assert.ok(LIVE_CONSOLE_DOCK_IDS.includes('grid'))
  assert.ok(LIVE_CONSOLE_DOCK_IDS.includes('settlement'))
  assert.ok(LIVE_CONSOLE_DOCK_IDS.includes('proof'))
  assert.ok(LIVE_CONSOLE_DOCK_IDS.includes('support'))
  assert.ok(!LIVE_CONSOLE_DOCK_IDS.includes('billing'))
  assert.ok(!LIVE_CONSOLE_DOCK_IDS.includes('verification'))
  assert.ok(!LIVE_CONSOLE_DOCK_IDS.includes('monitoring'))
})

console.log('commercialScopeFollowups.contract.test.ts: OK')
