export const LIVE_JOURNAL_POLL_MS = 8_000
export const JOURNAL_BATCH_IDS_BFF_PATH = '/api/prod/intents/batch-ids'
export const JOURNAL_PAYMENT_INTENTS_BFF_PATH = '/api/prod/intents/payment-intents'
export const JOURNAL_DLQ_ITEMS_BFF_PATH = '/api/prod/intents/dlq-items'
export const PROD_DLQ_MANUAL_REVIEW_BFF_PATH = '/api/prod/dlq/manual-review'
export const PROD_DLQ_TERMINAL_COUNT_BFF_PATH = '/api/prod/dlq/terminal/count'

/** @deprecated Use JOURNAL_BATCH_IDS_BFF_PATH — journal no longer uses monolithic batches list. */
export const JOURNAL_BATCHES_BFF_PATH = '/api/prod/intents/batches'
