/**
 * CON-P1-39 layered verification contract tests.
 * Run: npx tsx --tsconfig tsconfig.json src/features/payout-command/evidence/mappers/mapLayeredVerification.contract.test.ts
 */
import assert from 'node:assert/strict'
import { exportPolicyLabel, mapLayeredVerification } from './mapLayeredVerification'

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`fail - ${name}`)
    throw err
  }
}

check('CERTIFIED + proof_score 100 is not Verified', () => {
  const view = mapLayeredVerification({
    proof_status: 'CERTIFIED',
    proof_score: 100,
    pack_status: 'READY',
  })
  assert.equal(view.verified, false)
  assert.equal(view.overall, 'NOT_RUN')
  assert.equal(view.exportAllowed, false)
})

check('all-pass layers => Verified and export allowed', () => {
  const view = mapLayeredVerification({
    status: 'VERIFIED',
    db_merkle_status: 'PASS',
    archive_status: 'PASS',
    signature_status: 'PASS',
    replay_status: 'PASS',
  })
  assert.equal(view.verified, true)
  assert.equal(view.overall, 'VERIFIED')
  assert.equal(view.exportAllowed, true)
  assert.equal(exportPolicyLabel(view), 'Export allowed')
})

check('DB tamper only => failed DB, other layers can still pass', () => {
  const view = mapLayeredVerification({
    status: 'CORRUPTED',
    db_merkle_status: 'FAIL',
    archive_status: 'PASS',
    signature_status: 'PASS',
    replay_status: 'PASS',
  })
  assert.equal(view.verified, false)
  assert.equal(view.overall, 'FAILED')
  assert.equal(view.layers.find((l) => l.key === 'db_merkle')?.status, 'FAIL')
  assert.equal(view.layers.find((l) => l.key === 'archive')?.status, 'PASS')
  assert.equal(view.exportAllowed, false)
})

check('archive-key failure blocks export', () => {
  const view = mapLayeredVerification({
    status: 'FAILED',
    db_merkle_status: 'PASS',
    archive_status: 'FAIL',
    signature_status: 'PASS',
  })
  assert.equal(view.layers.find((l) => l.key === 'archive')?.status, 'FAIL')
  assert.equal(view.exportAllowed, false)
})

check('signature failure blocks export', () => {
  const view = mapLayeredVerification({
    status: 'FAILED',
    db_merkle_status: 'PASS',
    archive_status: 'PASS',
    signature_status: 'FAIL',
  })
  assert.equal(view.layers.find((l) => l.key === 'signature')?.status, 'FAIL')
  assert.equal(view.verified, false)
})

check('unverified/partial is not Verified', () => {
  const view = mapLayeredVerification({
    status: 'PARTIAL',
    db_merkle_status: 'PASS',
    archive_status: 'NOT_RUN',
    signature_status: 'UNKNOWN',
  })
  assert.equal(view.verified, false)
  assert.notEqual(view.overall, 'VERIFIED')
})

check('superseded pack blocks export', () => {
  const view = mapLayeredVerification({
    pack_status: 'SUPERSEDED',
    db_merkle_status: 'PASS',
    archive_status: 'PASS',
    signature_status: 'PASS',
  })
  assert.equal(view.overall, 'SUPERSEDED')
  assert.equal(view.verified, false)
  assert.equal(view.exportAllowed, false)
})

console.log('All CON-P1-39 layered verification tests passed.')
