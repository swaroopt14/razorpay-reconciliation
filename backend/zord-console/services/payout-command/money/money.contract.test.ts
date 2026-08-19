/**
 * CON-P0-23 currency-safety contract tests.
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/money/money.contract.test.ts
 */
import assert from 'node:assert/strict'
import {
  UNKNOWN_CURRENCY,
  aggregateMoney,
  formatMoney,
  formatMoneyBuckets,
  groupAmountsByCurrency,
  matchesCurrencyAwareAmountRange,
  normalizeCurrency,
} from './money'

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`fail - ${name}`)
    throw err
  }
}

check('missing currency → UNKNOWN, never INR', () => {
  assert.equal(normalizeCurrency(undefined), UNKNOWN_CURRENCY)
  assert.equal(normalizeCurrency(null), UNKNOWN_CURRENCY)
  assert.equal(normalizeCurrency(''), UNKNOWN_CURRENCY)
  assert.equal(normalizeCurrency('inr'), 'INR')
  assert.equal(normalizeCurrency('usd'), 'USD')
  assert.notEqual(normalizeCurrency(undefined), 'INR')
})

check('USD and INR rows render in their own currencies', () => {
  const usd = formatMoney(1234.56, 'USD')
  const inr = formatMoney(1234.56, 'INR')
  assert.match(usd, /\$1,234\.56|USD/)
  assert.match(inr, /₹1,234\.56|INR/)
  assert.notEqual(usd, inr)
  assert.ok(!usd.includes('₹'))
  assert.ok(!inr.includes('$'))
})

check('UNKNOWN currency never formats as INR/₹', () => {
  const label = formatMoney(99.5, undefined)
  assert.match(label, /UNKNOWN/)
  assert.ok(!label.includes('₹'))
  assert.ok(!label.includes('INR'))
})

check('USD + INR never sum into one portfolio total', () => {
  const result = aggregateMoney([
    { amount: 100, currency: 'USD' },
    { amount: 200, currency: 'INR' },
  ])
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, 'mixed_currency')
  const buckets = groupAmountsByCurrency([
    { amount: 100, currency: 'USD' },
    { amount: 200, currency: 'INR' },
  ])
  assert.equal(buckets.USD, 100)
  assert.equal(buckets.INR, 200)
  const display = formatMoneyBuckets(buckets)
  assert.ok(display.includes('100'))
  assert.ok(display.includes('200'))
})

check('missing currency blocks money aggregation', () => {
  const result = aggregateMoney([
    { amount: 50, currency: 'USD' },
    { amount: 25, currency: null },
  ])
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, 'unknown_currency')
})

check('same-currency aggregation is allowed', () => {
  const result = aggregateMoney([
    { amount: 10.5, currency: 'USD' },
    { amount: 20.25, currency: 'usd' },
  ])
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.total.currency, 'USD')
    assert.equal(result.total.amount, 30.75)
  }
})

check('amount filter is currency-aware (UNKNOWN excluded from ranges)', () => {
  assert.equal(matchesCurrencyAwareAmountRange(5000, 'USD', 'Under 10,000'), true)
  assert.equal(matchesCurrencyAwareAmountRange(5000, undefined, 'Under 10,000'), false)
  assert.equal(matchesCurrencyAwareAmountRange(5000, 'USD', 'Under 10,000', 'INR'), false)
  assert.equal(matchesCurrencyAwareAmountRange(5000, 'INR', 'Under 10,000', 'INR'), true)
})

console.log('All CON-P0-23 money contract tests passed.')
