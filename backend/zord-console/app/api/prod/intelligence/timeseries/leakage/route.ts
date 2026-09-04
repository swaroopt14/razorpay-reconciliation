import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardIntelligence } from '../../_shared'

export const dynamic = 'force-dynamic'

/** Proxies leakage exposure time series for the Intended Payment Value chart. */
export async function GET(request: NextRequest) {
  return forwardIntelligence(request, BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.LEAKAGE_EXPOSURE)
}
