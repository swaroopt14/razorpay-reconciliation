/** Query param for `GET /api/prod/home/disbursement-trend` (BFF over intelligence leakage windows). */
export type DisbursementTrendRange = 'week' | 'month' | 'quarter' | 'year'

export type DisbursementTrendBucket = {
  /** Stable ordering key (ISO date or period id). */
  key: string
  /** Short label for X axis (e.g. "Mon 5", "Jan"). */
  label: string
  /** Sum of intent amounts in window — minor units (paise). */
  total_amount: number
  /** Sum of amounts for intents considered bank-confirmed / settled — minor units (paise). */
  confirmed_amount: number
  /** Payment value needing review in this bucket — minor units (paise). */
  review_amount: number
  intent_count: number
  confirmed_count: number
}

/** Response from Next route today; swap `source` when a dedicated analytics service exists. */
export type DisbursementTrendResponse = {
  data_available: boolean
  range: DisbursementTrendRange
  currency: string
  buckets: DisbursementTrendBucket[]
  /** How this payload was produced — for debugging / migration. */
  source: 'intelligence_leakage_windows' | 'intent_engine_aggregate' | 'analytics_service'
  /** When aggregating from paginated intents, caps applied. */
  note?: string
}
