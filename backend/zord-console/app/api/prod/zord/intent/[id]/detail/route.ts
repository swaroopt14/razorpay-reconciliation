import { NextRequest, NextResponse } from 'next/server'
import { getIntentDetail } from '@/services/analytics'
import { resolveRequestContext, withNoStore } from '../../../helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = resolveRequestContext(request)
  if (ctx.response) return ctx.response

  try {
    const detail = getIntentDetail(ctx.tenantId, params.id)
    if (!detail) {
      return NextResponse.json({ error: 'Intent not found' }, { status: 404 })
    }

    return withNoStore(NextResponse.json(detail))
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load intent detail', detail: error instanceof Error ? error.message : 'unknown error' }, { status: 500 })
  }
}
