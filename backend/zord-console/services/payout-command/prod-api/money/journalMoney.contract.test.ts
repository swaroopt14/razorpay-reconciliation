/**
 * CON-P0-11 money-unit contract tests.
 * Run from zord-console:
 *   npx tsx --tsconfig tsconfig.json services/payout-command/prod-api/money/journalMoney.contract.test.ts
 */
import assert from 'node:assert/strict'
import {
  formatJournalMoneyFromMinor,
  journalMoney,
  majorAmountToMinor,
  parseMinorAmountField,
  resolveBatchTotalAmountMinor,
} from './journalMoney'
import { mapBatchIdItemToBatchRecord } from '../../../../src/features/payout-command/intent-journal/mappers/mapIntentBatchSidebar'
import { mapIntelligenceRowToBatchRecord } from '../mapIntentEngineBatch'
import type { IntelligenceBatchRow } from '../intelligenceTypes'

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`fail - ${name}`)
    throw err
  }
}

check('Service 2 major 1234.56 → 123456 minor', () => {
  assert.equal(majorAmountToMinor(1234.56), 123456)
  assert.equal(resolveBatchTotalAmountMinor({ total_amount: 1234.56 }), 123456)
})

check('Service 7 minor 123456 stays 123456', () => {
  assert.equal(parseMinorAmountField(123456), 123456)
  assert.equal(resolveBatchTotalAmountMinor({ total_amount_minor: 123456 }), 123456)
})

check('prefer total_amount_minor over major total_amount', () => {
  assert.equal(
    resolveBatchTotalAmountMinor({ total_amount: 12.34, total_amount_minor: 123456 }),
    123456,
  )
})

check('both adapters render exactly ₹1,234.56', () => {
  const fromService2 = formatJournalMoneyFromMinor(majorAmountToMinor(1234.56), 'INR')
  const fromService7 = formatJournalMoneyFromMinor(parseMinorAmountField(123456), 'INR')
  assert.equal(fromService2, '₹1,234.56')
  assert.equal(fromService7, '₹1,234.56')
  assert.equal(fromService2, fromService7)
})

check('batch-ids + intelligence adapters agree on amountMinor and hero display', () => {
  const fromBatchIds = mapBatchIdItemToBatchRecord({
    batch_id: 'B-S2',
    total_amount: 1234.56,
  })
  const fromIntelligence = mapIntelligenceRowToBatchRecord({
    batch_id: 'B-S7',
    tenant_id: 't1',
    finality_status: 'PENDING',
    total_count: 1,
    success_count: 0,
    failed_count: 0,
    pending_count: 1,
    total_intended_amount_minor: 123456,
  } as IntelligenceBatchRow)

  assert.equal(fromBatchIds.amountMinor, 123456)
  assert.equal(fromIntelligence.amountMinor, 123456)
  assert.equal(fromBatchIds.currency, 'INR')
  assert.equal(fromIntelligence.currency, 'INR')

  const displayS2 = formatJournalMoneyFromMinor(fromBatchIds.amountMinor, fromBatchIds.currency)
  const displayS7 = formatJournalMoneyFromMinor(
    fromIntelligence.amountMinor,
    fromIntelligence.currency,
  )
  assert.equal(displayS2, '₹1,234.56')
  assert.equal(displayS7, '₹1,234.56')
})

check('100× regression is caught (major mistaken as minor)', () => {
  const correct = formatJournalMoneyFromMinor(majorAmountToMinor(1234.56), 'INR')
  const wrongIfMajorPassedAsMinor = formatJournalMoneyFromMinor(1234.56, 'INR')
  assert.notEqual(correct, wrongIfMajorPassedAsMinor)
  assert.equal(wrongIfMajorPassedAsMinor, '₹12.35')
})

check('journalMoney truncates to integer minor', () => {
  assert.deepEqual(journalMoney(123456.9, 'inr'), { amountMinor: 123456, currency: 'INR' })
})

console.log('All CON-P0-11 money contract tests passed.')
