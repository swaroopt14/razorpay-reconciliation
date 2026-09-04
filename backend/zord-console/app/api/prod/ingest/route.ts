import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get('x-idempotency-key') || request.headers.get('X-Idempotency-Key')
  const authorization = request.headers.get('authorization') || request.headers.get('Authorization')

  if (!authorization) {
    return NextResponse.json({ error: 'Authorization header is required' }, { status: 401 })
  }
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'X-Idempotency-Key header is required' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const body = await request.text()

    const url = buildUrl('EDGE', BACKEND_SERVICES.EDGE.ENDPOINTS.INGEST)
    const res = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        'X-Idempotency-Key': idempotencyKey,
      },
      body,
    })

    clearTimeout(timeoutId)

    const text = await res.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // passthrough non-JSON
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: json?.error?.message || json?.error || text || `Ingest failed: ${res.status}` },
        { status: res.status }
      )
    }

    return NextResponse.json(json ?? { raw: text }, { status: 202 })
  } catch (error) {
    clearTimeout(timeoutId)
    const msg =
      error instanceof Error && error.name === 'AbortError'
        ? 'Request timeout: Edge service not responding'
        : error instanceof Error
          ? error.message
          : 'Ingest failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

