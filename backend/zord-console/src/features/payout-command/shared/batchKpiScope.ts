/**
 * Intelligence dashboard scope (see docs/intelligence-kpi-gaps.md § Batch scope).
 *
 * All Intelligence KPI routes except `batch_contract` accept optional `batch_id`.
 * When `batch_id` is sent with the session tenant, the API returns batch-scoped KPIs.
 * When omitted, the API returns tenant-wide KPIs. Trust `data_available` — never hide
 * valid responses client-side.
 */
export function intelligenceKpiScopeLabel(batchId?: string): string {
  const bid = batchId?.trim()
  return bid ? `Batch ${bid}` : 'Tenant-wide'
}
