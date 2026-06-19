/**
 * Backend contract — Intended Payment Value chart (current vs predicted leakage).
 * Share with zord-intelligence / BFF owners.
 */

export const LEAKAGE_COMPARISON_TIMESERIES_API = {
  /** Console BFF (session tenant injected). */
  bffPath: '/api/prod/intelligence/timeseries/leakage',
  /** Upstream intelligence service. */
  upstreamPath: '/v1/intelligence/timeseries/leakage-exposure',
  method: 'GET' as const,
  queryParams: {
    granularity: 'day | week | month (required for chart Day/Week/Month pills)',
    batch_id: 'optional — scope series to payout batch',
  },
  responseWhenLive: {
    data_available: true,
    tenant_id: 'string',
    snapshot_id: 'string (optional)',
    computed_at: 'ISO-8601 (optional)',
    window_start: 'ISO-8601 (optional)',
    window_end: 'ISO-8601 (optional)',
    granularity: 'day | week | month',
    batch_id: 'string (optional, echo)',
    project_start_at: 'ISO-8601 (optional) — vertical marker; points with is_future:true are forecast zone',
    series: [
      {
        date: 'YYYY-MM-DD — bucket start',
        current_leakage_minor: 'number | string — observed leakage in minor units (paise)',
        predicted_leakage_minor: 'number | string — forecast / model leakage in minor units (paise)',
        is_future: 'boolean (optional) — true when date >= project_start_at or forecast-only bucket',
      },
    ],
  },
  responseWhenEmpty: {
    data_available: false,
    reason: 'string — UI falls back to preview series',
  },
  fieldMapping: {
    chartBlueLine: 'current_leakage_minor',
    chartGreenLine: 'predicted_leakage_minor',
    xAxis: 'date',
    verticalMarker: 'project_start_at',
    forecastZone: 'is_future',
  },
} as const
