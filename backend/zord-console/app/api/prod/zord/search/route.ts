import { NextRequest, NextResponse } from 'next/server'
import { searchDataset } from '@/services/analytics'
import { resolveRequestContext, withNoStore } from '../helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = resolveRequestContext(request)
  if (ctx.response) return ctx.response

  const query = request.nextUrl.searchParams.get('q') || ''
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 20)))

  if (!query.trim()) {
    return withNoStore(NextResponse.json({ items: [] }))
  }

  try {
    const started = Date.now()
    const items = searchDataset(ctx.tenantId, query, limit)
    const durationMs = Date.now() - started

    return withNoStore(
      NextResponse.json({
        items,
        meta: {
          query,
          limit,
          response_ms: durationMs,
          target_ms: 200,
        },
      }),
    )
  } catch (error) {
    return NextResponse.json({ error: 'Search failed', detail: error instanceof Error ? error.message : 'unknown error' }, { status: 500 })
  }
}
