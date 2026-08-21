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
  formatMoneyFromMinor,
  groupAmountsByCurrency,
  majorToMinor,
  matchesCurrencyAwareAmountRange,
  minorToMajor,
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

check('CON-P1-40 major→minor USD/INR and reverse', () => {
  assert.equal(majorToMinor(12.34, 'USD'), 1234)
  assert.equal(minorToMajor(1234, 'USD'), 12.34)
  assert.equal(majorToMinor(12.34, 'INR'), 1234)
  assert.equal(formatMoneyFromMinor(1234, 'USD'), formatMoney(12.34, 'USD'))
})

check('CON-P1-40 100x unit bug is rejected', () => {
  const minor = majorToMinor(12.34, 'USD')
  assert.notEqual(minor, 12.34)
  assert.notEqual(minorToMajor(1234, 'USD'), 1234)
  assert.equal(minorToMajor(123400, 'USD'), 1234)
})

check('CON-P1-40 zero-decimal JPY does not divide by 100', () => {
  assert.equal(majorToMinor(1234, 'JPY'), 1234)
  assert.equal(minorToMajor(1234, 'JPY'), 1234)
  assert.notEqual(minorToMajor(1234, 'JPY'), 12.34)
})

check('CON-P1-40 three-decimal KWD', () => {
  assert.equal(majorToMinor(1.234, 'KWD'), 1234)
  assert.equal(minorToMajor(1234, 'KWD'), 1.234)
})

check('CON-P1-40 large values stay exact in minor units', () => {
  assert.equal(majorToMinor(9999999.99, 'USD'), 999999999)
  assert.equal(minorToMajor(999999999, 'USD'), 9999999.99)
})

check('CON-P1-40 decimals and mixed-currency still blocked', () => {
  assert.equal(majorToMinor(0.01, 'USD'), 1)
  const mixed = aggregateMoney([
    { amount: 10, currency: 'USD' },
    { amount: 10, currency: 'JPY' },
  ])
  assert.equal(mixed.ok, false)
  if (!mixed.ok) assert.equal(mixed.reason, 'mixed_currency')
})

console.log('All CON-P0-23 / CON-P1-40 money contract tests passed.')
