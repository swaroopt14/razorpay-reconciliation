import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function smokeBase() {
  return (
    process.env.ZORD_EDGE_URL ||
    process.env.SMOKE_SIMULATOR_URL ||
    process.env.ZORD_EVIDENCE_URL ||
    'http://localhost:8099'
  ).replace(/\/+$/, '')
}

async function proxy(request: NextRequest, path: string[]) {
  const suffix = path.map((p) => encodeURIComponent(p)).join('/')
  const incoming = new URL(request.url)
  const target = `${smokeBase()}/v1/${suffix}${incoming.search}`
  try {
    // Forward the user's session token so upload-readiness (session-scoped) works.
    const accessCookie = request.cookies.get('zord_access_token')?.value?.trim()
    const fwdHeaders: Record<string, string> = {
      'content-type': request.headers.get('content-type') || 'application/json',
      'x-tenant-id': request.headers.get('x-tenant-id') || 'tenant_novacell_eu',
    }
    if (accessCookie) fwdHeaders.authorization = `Bearer ${accessCookie}`
    const upstream = await fetch(target, {
      method: request.method,
      headers: fwdHeaders,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
      cache: 'no-store',
    })
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'control_plane_unreachable',
        detail: error instanceof Error ? error.message : 'unknown',
        target,
      },
      { status: 502 },
    )
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path ?? [])
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path ?? [])
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path ?? [])
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path ?? [])
}
