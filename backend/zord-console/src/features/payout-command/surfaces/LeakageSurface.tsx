'use client'

import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { PortfolioLeakageDashboard } from '../leakage-portfolio/PortfolioLeakageDashboard'

/**
 * Payment Gaps dock (`?dock=leakage`) — value-at-risk dashboard.
 * Data: GET /api/prod/intelligence/leakage → zord-intelligence leakage KPIs.
 */
export function LeakageSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const { tenantReady } = useSessionTenant()
  return <PortfolioLeakageDashboard tenantReady={tenantReady} initialBatchId={initialBatchId} />
}
