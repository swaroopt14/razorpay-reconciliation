import { NextRequest, NextResponse } from 'next/server'
import { getExportQueue } from '@/services/analytics'
import { resolveRequestContext, withNoStore } from '../../helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = resolveRequestContext(request)
  if (ctx.response) return ctx.response

  const queue = getExportQueue(ctx.tenantId)

  return withNoStore(
    NextResponse.json({
      items: queue,
      queued_count: queue.filter((item) => item.status === 'QUEUED' || item.status === 'PROCESSING').length,
    }),
  )
}
