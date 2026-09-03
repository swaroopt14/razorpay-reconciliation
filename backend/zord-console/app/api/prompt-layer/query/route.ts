import { NextResponse } from 'next/server'

// Always proxy at request time (no caching), since this depends on runtime env + backend state.
export const dynamic = 'force-dynamic'

function normalizePromptLayerBase(base: string) {
  return base.replace(/\/+$/, '').replace(/\/query$/, '')
}

function upstreamCandidates() {
  // In Docker, the service DNS name is the most reliable target.
  // Keep host and localhost fallbacks for local/frontend-only development.
  return Array.from(
    new Set(
      [
        process.env.PROMPT_LAYER_URL,
        'http://zord-prompt-layer:8086',
        'http://host.docker.internal:8086',
        'http://localhost:8086',
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

export async function POST(req: Request) {
  const candidateUrls = upstreamCandidates().map((base) => `${normalizePromptLayerBase(base)}/query`)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ details: 'Invalid JSON body' }, { status: 400 })
  }

  let res: Response | null = null
  let lastError: unknown = null
  let lastUrl = candidateUrls[candidateUrls.length - 1]

  for (const url of candidateUrls) {
    lastUrl = url
    try {
      const auth = req.headers.get('authorization') || ''
      const tenant = req.headers.get('x-tenant-id') || ''
      const userId = req.headers.get('x-user-id') || ''
      const sessionId = req.headers.get('x-session-id') || ''

      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(auth ? { authorization: auth } : {}),
          ...(tenant ? { 'x-tenant-id': tenant } : {}),
          ...(userId ? { 'x-user-id': userId } : {}),
          ...(sessionId ? { 'x-session-id': sessionId } : {}),
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      })

      if (res.ok || res.status < 500) {
        break
      }
    } catch (error) {
      lastError = error
    }
  }

  if (!res) {
    return NextResponse.json(
      {
        details: 'Prompt-layer service unavailable',
        upstream: lastUrl,
        error: lastError instanceof Error ? lastError.message : 'Unknown upstream error',
      },
      { status: 502 },
    )
  }

  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export async function OPTIONS() {
  // Same-origin calls to /api/... typically don't require CORS, but OPTIONS may happen in some setups.
  return new NextResponse(null, { status: 204 })
}
