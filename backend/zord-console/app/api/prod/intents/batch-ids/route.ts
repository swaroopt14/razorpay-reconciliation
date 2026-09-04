import { NextRequest } from 'next/server'
import { proxyIntentEngineGet } from '../_proxyIntentEngineGet'

export const dynamic = 'force-dynamic'

/** Proxy: GET /api/prod/intents/batch-ids → zord-intent-engine (tenant from session). */
export async function GET(request: NextRequest) {
  return proxyIntentEngineGet(request, { upstreamPath: '/api/prod/intents/batch-ids' })
}
