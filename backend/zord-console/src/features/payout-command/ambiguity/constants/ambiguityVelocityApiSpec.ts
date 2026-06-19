/**
 * Backend contract — Ambiguity Velocity bubble map.
 * Separate from GET /api/prod/intelligence/ambiguity KPIs.
 */

export const AMBIGUITY_VELOCITY_SCATTER_API = {
  bffPath: '/api/prod/ambiguity/velocity',
  upstreamPath: '/v1/intelligence/dashboard/bubble-map',
  method: 'GET' as const,
  queryParams: {
    batch_id: 'optional — filter to one batch',
    tenant_id: 'injected by BFF from signed-in session',
  },
  responseWhenLive: {
    data_available: true,
    tenant_id: 'string',
    intelligence_mode: 'GRADE_A | …',
    count: 'number of batches returned',
    batches: [
      {
        batch_id: 'string',
        amount_value: 'minor units (paise) — total batch value',
        amount_at_risk: 'minor units (paise) — ambiguous / at-risk value',
      },
    ],
  },
  chartMapping: {
    xAxis: '(amount_value / max_amount_value) × 100 — batch size left to right',
    yAxis: '(amount_at_risk / amount_value) × 100 — risk ratio bottom to top',
    bubbleSize: 'sqrt(amount_value / max_amount_value) × MAX_RADIUS — area proportional to money',
    color: 'risk tier from risk ratio: grey 0%, green ≤2%, yellow ≤5%, orange ≤10%, red >10%',
  },
} as const
