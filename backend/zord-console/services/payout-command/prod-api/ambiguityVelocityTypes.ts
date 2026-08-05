import type { EmptyKpiResponse, MinorAmountField, Resolved } from './intelligenceTypes'

/** Legacy timeseries row — GET /v1/intelligence/timeseries/ambiguity-velocity */
export type AmbiguityVelocityScatterRow = {
  /** Calendar date YYYY-MM-DD. */
  date: string
  /** When the batch was observed (ISO-8601). Drives X-axis time position. */
  observed_at?: string
  batch_id: string
  total_amount_minor: MinorAmountField
  ambiguous_amount_minor: MinorAmountField
  /** Optional 0–100; if omitted, UI derives from ambiguous ÷ total. */
  ambiguity_level_pct?: number
}

export type AmbiguityVelocityScatterResolved = Resolved<{
  window_days: number
  window_start?: string
  window_end?: string
  batch_id?: string
  points: AmbiguityVelocityScatterRow[]
}>

/** Live bubble-map batch — GET /v1/intelligence/dashboard/bubble-map */
export type AmbiguityBubbleMapBatch = {
  batch_id: string
  /** Total batch value in minor units (paise). */
  amount_value: MinorAmountField
  /** Ambiguous / at-risk value in minor units (paise). */
  amount_at_risk: MinorAmountField
  /** Optional ISO timestamp for X-axis placement when provided. */
  observed_at?: string
}

export type AmbiguityBubbleMapResolved = Resolved<{
  batches: AmbiguityBubbleMapBatch[]
  count: number
  intelligence_mode?: string
}>

export type AmbiguityVelocityScatterResponse =
  | AmbiguityVelocityScatterResolved
  | AmbiguityBubbleMapResolved
  | EmptyKpiResponse
