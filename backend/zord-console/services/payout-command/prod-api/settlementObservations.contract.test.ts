/**
 * CON-P1-28 sourceRowRef vs displayRowIndex
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/prod-api/settlementObservations.contract.test.ts
 */
import assert from 'node:assert/strict'
import { mapObservationToTableRow, resolveSourceRowRef } from './settlementObservations'

assert.equal(resolveSourceRowRef(undefined), null)
assert.equal(resolveSourceRowRef(''), null)
assert.equal(resolveSourceRowRef('0'), null)
assert.equal(resolveSourceRowRef('-1'), null)
assert.equal(resolveSourceRowRef('12'), '12')
assert.equal(resolveSourceRowRef('ROW-A'), 'ROW-A')

{
  const missing = mapObservationToTableRow(
    {
      settlement_observation_id: 'obs_1',
      settlement_batch_id: 'sb_1',
      client_reference_candidate: 'C1',
      amount: '10',
    } as never,
    { rowIndex: 11 },
  )
  assert.equal(missing.sourceRowRef, null)
  assert.equal(missing.displayRowIndex, 12)
}

{
  const present = mapObservationToTableRow(
    {
      settlement_observation_id: 'obs_2',
      settlement_batch_id: 'sb_1',
      source_row_ref: '4',
      client_reference_candidate: 'C2',
      amount: '10',
    } as never,
    { rowIndex: 11 },
  )
  assert.equal(present.sourceRowRef, '4')
  assert.equal(present.displayRowIndex, 12)
}

console.log('settlementObservations.contract.test.ts: OK')
