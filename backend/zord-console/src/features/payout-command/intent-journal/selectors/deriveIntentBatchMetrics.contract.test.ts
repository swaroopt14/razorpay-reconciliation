/**
 * CON-P1-23 contract tests
 * Run: npx tsx --tsconfig tsconfig.json src/features/payout-command/intent-journal/selectors/deriveIntentBatchMetrics.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  IntentJournalDlqItem,
  IntentJournalPaymentIntentItem,
} from '@/services/payout-command/prod-api/intentJournalTypes'
import {
  deriveIntentBatchHealth,
  deriveIntentBatchMetrics,
  DLQ_STATUS_MANUAL_REVIEW,
  intentOrSourceRowIdentity,
} from './deriveIntentBatchMetrics'

// Same source_row in manual-review DLQ + low quality ⇒ review counts once; quality separate
{
  const intents = [
    {
      intent_id: 'intent-1',
      source_row_num: 7,
      amount: 100,
      intent_quality_score: 0.2, // below readiness threshold
    },
  ] as IntentJournalPaymentIntentItem[]

  const dlq = [
    {
      dlq_id: 'dlq-a',
      source_row_num: 7,
      dlq_status: DLQ_STATUS_MANUAL_REVIEW,
      intent_context: { intent_id: 'intent-1' },
    },
  ] as IntentJournalDlqItem[]

  const metrics = deriveIntentBatchMetrics(intents, dlq, {
    paymentIntentTotal: 1,
    manualReviewApiTotal: 1,
  })

  assert.equal(metrics.needsReviewCount, 1, 'review queue counts once')
  assert.equal(metrics.manualReviewCount, 1)
  assert.equal(metrics.lowReadinessCount, 1, 'quality KPI still shows low quality')
  assert.notEqual(
    metrics.needsReviewCount,
    metrics.manualReviewCount + metrics.lowReadinessCount,
    'must not sum review + quality',
  )
  assert.equal(metrics.processingFailedCount, 0)
  assert.equal(metrics.needsReviewSource, 'dlq.manual-review.pagination.total')

  const health = deriveIntentBatchHealth(metrics)
  assert.equal(health.status, 'Needs Review', 'manual-review must not become Failed Validation')
}

// Duplicate DLQ rows for same identity collapse
{
  const dlq = [
    { dlq_id: 'd1', source_row_num: 3, dlq_status: DLQ_STATUS_MANUAL_REVIEW },
    { dlq_id: 'd2', source_row_num: 3, dlq_status: DLQ_STATUS_MANUAL_REVIEW },
  ] as IntentJournalDlqItem[]
  const metrics = deriveIntentBatchMetrics([], dlq)
  assert.equal(metrics.needsReviewCount, 1)
  assert.equal(metrics.dlqCount, 1)
}

// Processing-failed DLQ (non manual-review) ⇒ Failed Validation
{
  const dlq = [
    { dlq_id: 'd-fail', source_row_num: 9, dlq_status: 'INGEST_FAILED' },
  ] as IntentJournalDlqItem[]
  const metrics = deriveIntentBatchMetrics([], dlq, { paymentIntentTotal: 5 })
  assert.equal(metrics.needsReviewCount, 0)
  assert.equal(metrics.processingFailedCount, 1)
  assert.equal(deriveIntentBatchHealth(metrics).status, 'Failed Validation')
}

// Low quality alone does not inflate needsReviewCount
{
  const intents = [
    { intent_id: 'i1', intent_quality_score: 0.1, amount: 10 },
    { intent_id: 'i2', intent_quality_score: 0.9, amount: 10 },
  ] as IntentJournalPaymentIntentItem[]
  const metrics = deriveIntentBatchMetrics(intents, [], {
    paymentIntentTotal: 2,
    manualReviewApiTotal: 0,
  })
  assert.equal(metrics.needsReviewCount, 0)
  assert.equal(metrics.lowReadinessCount, 1)
  assert.equal(deriveIntentBatchHealth(metrics).status, 'Ready')
}

// Identity helper prefers intent_id
{
  assert.equal(
    intentOrSourceRowIdentity({ intentId: 'abc', sourceRowNum: 1, dlqId: 'd' }),
    'intent:abc',
  )
}

// Source guard: no dlqCount + lowReadinessCount sum
{
  const src = readFileSync(join(__dirname, 'deriveIntentBatchMetrics.ts'), 'utf8')
  assert.doesNotMatch(
    src,
    /needsReviewCount\s*=\s*dlqCount\s*\+\s*lowReadinessCount/,
    'must not reintroduce double-count sum',
  )
}

console.log('deriveIntentBatchMetrics.contract.test.ts: OK')
