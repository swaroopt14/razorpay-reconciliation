import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardIntelligence } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return forwardIntelligence(request, BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.RECOMMENDATIONS)
}
