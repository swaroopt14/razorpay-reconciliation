import { DEMO_DISPATCH_ROWS } from './dispatchRelayDemo'
import { DEMO_SETTLEMENT_ROWS } from './settlementJournalDemo'
import { DEMO_PROOF_PACKS } from './proofCenterDemo'
import { demoIntendedPaymentValue } from './demoPayoutAmounts'

/**
 * One India bulk-payout case study (100 instructions).
 * Overview ribbon, Dispatch, Settlement, Proof, Gaps, and Outcome Review all read this.
 *
 * 100 received → 99 sealed & dispatched (PAY-0020 blocked) → 88 settled → 83 proof-ready.
 */
function sum(ns: number[]): number {
  return Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100
}

function money(n: number): number {
  return Math.round(n * 100) / 100
}

const sealedRows = DEMO_DISPATCH_ROWS.filter((r) => r.sealed)
const blockedRows = DEMO_DISPATCH_ROWS.filter((r) => !r.sealed)
const waitingRows = DEMO_SETTLEMENT_ROWS.filter(
  (r, i) => r.outcome === 'Waiting' && DEMO_DISPATCH_ROWS[i]?.sealed,
)
const settledRows = DEMO_SETTLEMENT_ROWS.filter(
  (r, i) => DEMO_DISPATCH_ROWS[i]?.sealed && r.outcome !== 'Waiting',
)
const shortRows = DEMO_SETTLEMENT_ROWS.filter((r) => r.outcome === 'Short')
const returnedRows = DEMO_SETTLEMENT_ROWS.filter((r) => r.outcome === 'Returned')
const reversalRows = DEMO_SETTLEMENT_ROWS.filter((r) => r.outcome === 'Reversal')
const missingRows = DEMO_SETTLEMENT_ROWS.filter((r) => r.outcome === 'Missing reference')
const p5Packs = DEMO_PROOF_PACKS.filter((p) => p.coverageRank === 5)

const shortDelta = money(
  shortRows.reduce((s, r) => {
    if (r.observedRupees == null) return s
    return s + (r.expectedRupees - r.observedRupees)
  }, 0),
)

const reviewValue = money(
  shortDelta +
    sum(returnedRows.map((r) => r.expectedRupees)) +
    sum(reversalRows.map((r) => r.expectedRupees)) +
    sum(missingRows.map((r) => r.expectedRupees)),
)

export const INDIA_CASE = {
  receivedCount: DEMO_DISPATCH_ROWS.length,
  receivedValue: money(demoIntendedPaymentValue()),
  blockedCount: blockedRows.length,
  blockedValue: sum(blockedRows.map((r) => r.amountRupees)),
  governedCount: sealedRows.length,
  governedValue: sum(sealedRows.map((r) => r.amountRupees)),
  sealedCount: sealedRows.length,
  sealedValue: sum(sealedRows.map((r) => r.amountRupees)),
  dispatchedCount: sealedRows.length,
  dispatchedValue: sum(sealedRows.map((r) => r.amountRupees)),
  settledCount: settledRows.length,
  settledObservedValue: money(settledRows.reduce((s, r) => s + (r.observedRupees ?? 0), 0)),
  waitingCount: waitingRows.length,
  waitingValue: sum(waitingRows.map((r) => r.expectedRupees)),
  provenCount: p5Packs.length,
  provenValue: money(
    p5Packs.reduce((s, p) => {
      const row = DEMO_DISPATCH_ROWS.find((d) => d.humanRef === p.paymentRef)
      return s + (row?.amountRupees ?? 0)
    }, 0),
  ),
  shortCount: shortRows.length,
  shortDelta,
  returnedCount: returnedRows.length,
  returnedValue: sum(returnedRows.map((r) => r.expectedRupees)),
  reversalCount: reversalRows.length,
  reversalValue: sum(reversalRows.map((r) => r.expectedRupees)),
  missingRefCount: missingRows.length,
  missingRefValue: sum(missingRows.map((r) => r.expectedRupees)),
  reviewValue,
  exceptionCount: shortRows.length + returnedRows.length + reversalRows.length + missingRows.length,
} as const
