import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function intelligenceBases() {
  if (process.env.ZORD_INTELLIGENCE_URL) return [process.env.ZORD_INTELLIGENCE_URL]
  return ['http://localhost:8080', 'http://zord-intelligence:8080']
}

function normalizePath(path: string[] | undefined) {
  if (!path || path.length === 0) return ''
  return path.map((segment) => encodeURIComponent(segment)).join('/')
}

function buildTargetUrl(base: string, path: string, search: string) {
  const normalizedBase = base.replace(/\/$/, '')
  const suffix = path ? `/${path}` : ''
  return `${normalizedBase}/v1/intelligence${suffix}${search}`
}

function passthroughHeaders(req: NextRequest) {
  const headers: Record<string, string> = {}
  const contentType = req.headers.get('content-type')
  const authorization = req.headers.get('authorization')
  const sourceType = req.headers.get('x-zord-source-type')
  const sourceClass = req.headers.get('x-zord-source-class')

  if (contentType) headers['content-type'] = contentType
  if (authorization) headers.authorization = authorization
  if (sourceType) headers['x-zord-source-type'] = sourceType
  if (sourceClass) headers['x-zord-source-class'] = sourceClass

  return headers
}

async function proxyRequest(req: NextRequest, path: string[] | undefined) {
  const encodedPath = normalizePath(path)
  const search = req.nextUrl.search
  const candidateUrls = intelligenceBases().map((base) => buildTargetUrl(base, encodedPath, search))
  const bodyBuffer = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer())
  const headers = passthroughHeaders(req)

  let lastError: unknown = null
  let lastResponse: Response | null = null
  let lastUrl = candidateUrls[candidateUrls.length - 1]

  for (const url of candidateUrls) {
    lastUrl = url
    try {
      const upstream = await fetch(url, {
        method: req.method,
        headers,
        body: bodyBuffer,
        cache: 'no-store',
      })

      lastResponse = upstream
      if (upstream.ok || upstream.status < 500) break
    } catch (error) {
      lastError = error
    }
  }

  if (!lastResponse) {
    return NextResponse.json(
      {
        error: 'Intelligence upstream unavailable',
        upstream: lastUrl,
        details: lastError instanceof Error ? lastError.message : 'Unknown upstream error',
      },
      { status: 502 },
    )
  }

  const payload = await lastResponse.text()
  return new NextResponse(payload, {
    status: lastResponse.status,
    headers: {
      'content-type': lastResponse.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  })
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return proxyRequest(req, params.path)
}

export async function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return proxyRequest(req, params.path)
}
